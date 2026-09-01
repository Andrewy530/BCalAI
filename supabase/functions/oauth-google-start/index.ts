import { adminClient, requireUser } from '../_shared/auth/index.ts';
import { EdgeError, withErrorHandling } from '../_shared/errors/index.ts';
import { jsonResponse, preflight } from '../_shared/http/cors.ts';
import { createPkcePair } from '../_shared/providers/crypto.ts';
import { googleRedirectUri } from '../_shared/providers/google/config.ts';
import { authFor } from '../_shared/providers/registry.ts';

/**
 * Begin a Google connection.
 *
 * Returns a URL for the app to open in a system browser. The PKCE verifier and
 * the CSRF state are written here and read by the callback — they cannot be
 * held by the app, because the leg that completes the flow is a request from
 * Google to our server that the app never sees.
 */
const handler = withErrorHandling(async (request) => {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') throw new EdgeError('METHOD_NOT_ALLOWED', 'Use POST.', 405);

  const user = await requireUser(request);
  const admin = adminClient();

  const redirectUri = googleRedirectUri();
  const { verifier, challenge } = await createPkcePair();
  const state = crypto.randomUUID();

  const { error } = await admin.from('oauth_states').insert({
    user_id: user.id,
    provider: 'google',
    state,
    code_verifier: verifier,
    redirect_uri: redirectUri,
  });

  if (error) {
    console.error(JSON.stringify({ code: 'OAUTH_STATE_INSERT_FAILED', detail: error.code }));
    throw new EdgeError('UNKNOWN', 'Could not start the connection.', 500);
  }

  // Housekeeping on a path that already writes: abandoned consent screens would
  // otherwise accumulate verifiers indefinitely.
  await admin.from('oauth_states').delete().lt('expires_at', new Date().toISOString());

  const authorizationUrl = authFor('google').authorizationUrl({
    state,
    codeChallenge: challenge,
    redirectUri,
  });

  console.log(JSON.stringify({ event: 'oauth_started', provider: 'google', userId: user.id }));

  return jsonResponse({ authorizationUrl, state });
});

Deno.serve(handler);
