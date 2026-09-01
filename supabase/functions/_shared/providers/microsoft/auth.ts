import { EdgeError } from '../../errors/index.ts';
import type { ProviderAuth, TokenSet } from '../types.ts';

import {
  MICROSOFT_GRAPH_API,
  MICROSOFT_SCOPES,
  microsoftAuthorizeEndpoint,
  microsoftClientId,
  microsoftClientSecret,
  microsoftTokenEndpoint,
} from './config.ts';
import {
  microsoftTokenErrorSchema,
  microsoftTokenResponseSchema,
  microsoftUserInfoSchema,
} from './schemas.ts';

export interface MicrosoftAuthDeps {
  fetch?: typeof fetch;
  now?: () => number;
  clientId?: string;
  clientSecret?: string;
  tenant?: string;
}

/**
 * Microsoft OAuth, authorization-code flow with PKCE.
 *
 * The factory keeps network and clock effects injectable so token handling can
 * be tested without credentials or a live identity-platform account.
 */
export function createMicrosoftAuth(deps: MicrosoftAuthDeps = {}): ProviderAuth {
  const fetcher = deps.fetch ?? fetch;
  const now = deps.now ?? (() => Date.now());
  const clientId = () => deps.clientId ?? microsoftClientId();
  const clientSecret = () => deps.clientSecret ?? microsoftClientSecret();

  return {
    kind: 'microsoft',

    authorizationUrl({ state, codeChallenge, redirectUri }) {
      const params = new URLSearchParams({
        client_id: clientId(),
        redirect_uri: redirectUri,
        response_type: 'code',
        response_mode: 'query',
        scope: MICROSOFT_SCOPES.join(' '),
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      return `${microsoftAuthorizeEndpoint(deps.tenant)}?${params.toString()}`;
    },

    exchangeCode({ code, codeVerifier, redirectUri }) {
      return postToken(
        fetcher,
        now,
        microsoftTokenEndpoint(deps.tenant),
        clientId(),
        clientSecret(),
        {
          grant_type: 'authorization_code',
          code,
          code_verifier: codeVerifier,
          redirect_uri: redirectUri,
        },
        true,
      );
    },

    refresh(refreshToken) {
      return postToken(
        fetcher,
        now,
        microsoftTokenEndpoint(deps.tenant),
        clientId(),
        clientSecret(),
        { grant_type: 'refresh_token', refresh_token: refreshToken },
        false,
      );
    },

    async identify(accessToken) {
      const response = await fetcher(
        `${MICROSOFT_GRAPH_API}/me?$select=id,mail,userPrincipalName`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        console.error(
          JSON.stringify({
            code: 'MICROSOFT_PROFILE_FAILED',
            status: response.status,
          }),
        );
        throw translateProfileFailure(response.status);
      }

      const parsed = microsoftUserInfoSchema.safeParse(
        await responseJson(response, 'Microsoft returned an unexpected profile.'),
      );
      if (!parsed.success) {
        throw new EdgeError('UNKNOWN', 'Microsoft returned an unexpected profile.', 502);
      }

      return {
        providerUserId: parsed.data.id,
        email: parsed.data.mail || parsed.data.userPrincipalName || null,
      };
    },

    async revoke(_token) {
      // There is no safe per-app revoke operation for this connection. The
      // Graph revokeSignInSessions operation is overbroad and unsupported for
      // personal accounts, so deleting the Vault secret is authoritative.
    },
  };
}

/** The production adapter; credentials are resolved when a method is called. */
export const microsoftAuth: ProviderAuth = createMicrosoftAuth();

async function postToken(
  fetcher: typeof fetch,
  now: () => number,
  endpoint: string,
  clientId: string,
  clientSecret: string,
  fields: Record<string, string>,
  requireRefreshToken: boolean,
): Promise<TokenSet> {
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      ...fields,
    }).toString(),
  });

  if (!response.ok) {
    const reason = await safeReason(response);
    console.error(
      JSON.stringify({
        code: 'MICROSOFT_TOKEN_FAILED',
        status: response.status,
        reason,
      }),
    );

    throw new EdgeError(
      reason === 'invalid_grant' ? 'PROVIDER_AUTH_EXPIRED' : 'UNKNOWN',
      'Microsoft would not issue a token. Reconnect the account.',
      reason === 'invalid_grant' ? 401 : 502,
    );
  }

  const parsed = microsoftTokenResponseSchema.safeParse(
    await responseJson(response, 'Microsoft returned an unexpected token response.'),
  );
  if (!parsed.success) {
    throw new EdgeError('UNKNOWN', 'Microsoft returned an unexpected token response.', 502);
  }

  if (requireRefreshToken && !parsed.data.refresh_token) {
    throw new EdgeError(
      'PROVIDER_AUTH_EXPIRED',
      'Microsoft did not grant offline access. Try connecting again.',
      400,
    );
  }

  const { access_token, expires_in, refresh_token, scope } = parsed.data;
  return {
    accessToken: access_token,
    refreshToken: refresh_token ?? null,
    expiresAt: new Date(now() + Math.max(expires_in - 60, 0) * 1000).toISOString(),
    scopes: scope ? scope.split(' ').filter(Boolean) : [],
  };
}

async function responseJson(response: Response, message: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new EdgeError('UNKNOWN', message, 502);
  }
}

function translateProfileFailure(status: number): EdgeError {
  switch (status) {
    case 401:
      return new EdgeError('PROVIDER_AUTH_EXPIRED', 'Reconnect your Microsoft account.', 401);
    case 403:
      return new EdgeError('NOT_AUTHORIZED', 'Microsoft denied access to this account.', 403);
    case 429:
      return new EdgeError(
        'PROVIDER_RATE_LIMITED',
        'Microsoft is temporarily rate limiting requests.',
        429,
      );
    default:
      return new EdgeError(
        'UNKNOWN',
        status >= 500 ? 'Microsoft is unavailable.' : 'Microsoft rejected the account request.',
        502,
      );
  }
}

/** Read only the machine-readable token error code. */
async function safeReason(response: Response): Promise<string | null> {
  try {
    const parsed = microsoftTokenErrorSchema.safeParse(await response.json());
    return parsed.success ? (parsed.data.error ?? null) : null;
  } catch {
    return null;
  }
}
