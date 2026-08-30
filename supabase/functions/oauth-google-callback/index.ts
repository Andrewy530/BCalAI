import { adminClient } from '../_shared/auth/index.ts';
import { EdgeError } from '../_shared/errors/index.ts';
import { appReturnUrl } from '../_shared/providers/google/config.ts';
import { authFor } from '../_shared/providers/registry.ts';

/**
 * Where Google sends the user back.
 *
 * This runs without a JWT — the caller is a browser following a redirect, not
 * the app — so `state` is the only thing proving the request belongs to a
 * connect attempt someone actually started. It is single-use: consumed by the
 * lookup below and deleted before the code is exchanged.
 *
 * Everything it returns is a 302 into the app. A user staring at a browser tab
 * should never see a JSON error envelope, so failures redirect with a reason
 * code the app can render.
 */
Deno.serve(async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const denied = url.searchParams.get('error');

  // The user pressed "Cancel" on the consent screen. Not an error worth logging.
  if (denied) return redirect('cancelled');
  if (!code || !state) return redirect('invalid_request');

  try {
    const admin = adminClient();

    const { data: handshake, error: stateError } = await admin
      .from('oauth_states')
      .select('id, user_id, provider, code_verifier, redirect_uri, expires_at')
      .eq('state', state)
      .maybeSingle();

    if (stateError) throw new EdgeError('UNKNOWN', 'Could not read the handshake.', 500);
    if (!handshake) return redirect('expired');

    // Delete before exchanging: a replayed callback must not be able to mint a
    // second grant, even if the exchange below is slow.
    await admin.from('oauth_states').delete().eq('id', handshake.id);

    if (new Date(handshake.expires_at as string).getTime() < Date.now()) {
      return redirect('expired');
    }

    const auth = authFor(handshake.provider as string);
    const tokens = await auth.exchangeCode({
      code,
      codeVerifier: handshake.code_verifier as string,
      redirectUri: handshake.redirect_uri as string,
    });

    const identity = await auth.identify(tokens.accessToken);

    // Upsert on the natural key so reconnecting refreshes the existing
    // connection rather than creating a second one for the same Google account.
    const { data: account, error: accountError } = await admin
      .from('provider_accounts')
      .upsert(
        {
          user_id: handshake.user_id as string,
          provider: handshake.provider as string,
          provider_user_id: identity.providerUserId,
          email: identity.email,
          status: 'active',
          scopes: tokens.scopes,
          last_error: null,
          connected_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider,provider_user_id' },
      )
      .select('id')
      .single();

    if (accountError || !account) {
      console.error(
        JSON.stringify({ code: 'PROVIDER_ACCOUNT_UPSERT_FAILED', detail: accountError?.code }),
      );
      throw new EdgeError('UNKNOWN', 'Could not save the connection.', 500);
    }

    const { error: secretError } = await admin.rpc('store_provider_secret', {
      p_account_id: account.id,
      p_secret: tokens.refreshToken,
    });

    if (secretError) {
      // A connection without a stored credential is worse than no connection:
      // it would look connected and fail on every sync. Roll it back.
      await admin.from('provider_accounts').delete().eq('id', account.id);
      console.error(JSON.stringify({ code: 'VAULT_STORE_FAILED', detail: secretError.code }));
      throw new EdgeError('UNKNOWN', 'Could not store the credential.', 500);
    }

    console.log(
      JSON.stringify({
        event: 'provider_connected',
        provider: handshake.provider,
        userId: handshake.user_id,
      }),
    );

    return redirect('connected');
  } catch (error) {
    const reason = error instanceof EdgeError ? error.code : 'UNKNOWN';
    console.error(JSON.stringify({ code: 'OAUTH_CALLBACK_FAILED', reason }));
    return redirect('failed');
  }
});

/**
 * Back into the app.
 *
 * Only a fixed reason code travels in the URL — never an email, an account id,
 * or a provider message.
 */
function redirect(status: string): Response {
  const target = new URL(appReturnUrl());
  target.searchParams.set('provider', 'google');
  target.searchParams.set('status', status);

  return new Response(null, {
    status: 302,
    headers: { Location: target.toString(), 'Cache-Control': 'no-store' },
  });
}
