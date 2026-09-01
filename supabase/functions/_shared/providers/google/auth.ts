import { EdgeError } from '../../errors/index.ts';
import type { ProviderAuth, TokenSet } from '../types.ts';

import {
  GOOGLE_AUTH_ENDPOINT,
  GOOGLE_REVOKE_ENDPOINT,
  GOOGLE_SCOPES,
  GOOGLE_TOKEN_ENDPOINT,
  GOOGLE_USERINFO_ENDPOINT,
  googleClientId,
  googleClientSecret,
} from './config.ts';
import {
  googleTokenErrorSchema,
  googleTokenResponseSchema,
  googleUserInfoSchema,
} from './schemas.ts';

/**
 * Google OAuth, authorisation-code flow with PKCE.
 *
 * PKCE is used even though this is a confidential client with a secret: the
 * authorisation request is started by the app and completed by a server the app
 * cannot see, so the verifier is what proves the callback belongs to the same
 * connect attempt as the request. The CSRF `state` is stored separately in
 * `oauth_states` and checked before the code is ever exchanged.
 */

export const googleAuth: ProviderAuth = {
  kind: 'google',

  authorizationUrl({ state, codeChallenge, redirectUri }) {
    const params = new URLSearchParams({
      client_id: googleClientId(),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      // Without both of these Google returns a refresh token on the first
      // consent only — so a user who reconnects would silently get an
      // access-token-only grant that dies in an hour.
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    });

    return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
  },

  async exchangeCode({ code, codeVerifier, redirectUri }) {
    const token = await postToken({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    });

    if (!token.refreshToken) {
      // Without a refresh token the connection would work for an hour and then
      // fail in a way that looks like a sync bug. Refuse it at the source.
      throw new EdgeError(
        'PROVIDER_AUTH_EXPIRED',
        'Google did not grant offline access. Try connecting again.',
        400,
      );
    }

    return token;
  },

  refresh(refreshToken) {
    return postToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
  },

  async identify(accessToken) {
    const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new EdgeError('PROVIDER_AUTH_EXPIRED', 'Could not read the Google account.', 401);
    }

    const parsed = googleUserInfoSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new EdgeError('UNKNOWN', 'Google returned an unexpected profile.', 502);
    }

    return { providerUserId: parsed.data.sub, email: parsed.data.email ?? null };
  },

  async revoke(token) {
    // Best effort by design: a token Google has already forgotten returns 400,
    // and that must not stop us from deleting our own record of it.
    try {
      await fetch(GOOGLE_REVOKE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }).toString(),
      });
    } catch (cause) {
      console.error(JSON.stringify({ code: 'GOOGLE_REVOKE_FAILED', detail: String(cause) }));
    }
  },
};

async function postToken(fields: Record<string, string>): Promise<TokenSet> {
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      ...fields,
      client_id: googleClientId(),
      client_secret: googleClientSecret(),
    }).toString(),
  });

  if (!response.ok) {
    // `invalid_grant` is the specific, common case: the user revoked access in
    // their Google account settings, or the refresh token was already replaced.
    const reason = await safeReason(response);
    console.error(JSON.stringify({ code: 'GOOGLE_TOKEN_FAILED', status: response.status, reason }));

    throw new EdgeError(
      reason === 'invalid_grant' ? 'PROVIDER_AUTH_EXPIRED' : 'UNKNOWN',
      'Google would not issue a token. Reconnect the account.',
      reason === 'invalid_grant' ? 401 : 502,
    );
  }

  const parsed = googleTokenResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new EdgeError('UNKNOWN', 'Google returned an unexpected token response.', 502);
  }

  const { access_token, expires_in, refresh_token, scope } = parsed.data;

  return {
    accessToken: access_token,
    refreshToken: refresh_token ?? null,
    // 60s of slack so a token cannot expire mid-request.
    expiresAt: new Date(Date.now() + (expires_in - 60) * 1000).toISOString(),
    scopes: scope ? scope.split(' ') : [],
  };
}

/** The OAuth error *code* only. Never the description, which can echo input. */
async function safeReason(response: Response): Promise<string | null> {
  try {
    const parsed = googleTokenErrorSchema.safeParse(await response.json());
    return parsed.success ? (parsed.data.error ?? null) : null;
  } catch {
    return null;
  }
}
