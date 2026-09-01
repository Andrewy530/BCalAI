import { z } from 'zod';

import { adminClient } from '../_shared/auth/index.ts';
import { EdgeError } from '../_shared/errors/index.ts';
import { appReturnUrl } from '../_shared/providers/config.ts';
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
const oauthStateSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  provider: z.literal('google'),
  code_verifier: z.string().min(1),
  redirect_uri: z.string().url(),
  expires_at: z.string().min(1),
});

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

    const parsedHandshake = oauthStateSchema.safeParse(handshake);
    if (!parsedHandshake.success) {
      console.error(JSON.stringify({ code: 'OAUTH_STATE_INVALID' }));
      throw new EdgeError('UNKNOWN', 'Could not read the handshake.', 500);
    }
    const validHandshake = parsedHandshake.data;

    // Delete before exchanging: a replayed callback must not be able to mint a
    // second grant, even if the exchange below is slow.
    const { error: consumeError, count } = await admin
      .from('oauth_states')
      .delete({ count: 'exact' })
      .eq('id', validHandshake.id);

    if (consumeError) {
      console.error(
        JSON.stringify({ code: 'OAUTH_STATE_CONSUME_FAILED', detail: consumeError.code }),
      );
      throw new EdgeError('UNKNOWN', 'Could not consume the handshake.', 500);
    }
    if (count !== 1) return redirect('expired');

    if (new Date(validHandshake.expires_at).getTime() < Date.now()) {
      return redirect('expired');
    }

    const auth = authFor(validHandshake.provider);
    const tokens = await auth.exchangeCode({
      code,
      codeVerifier: validHandshake.code_verifier,
      redirectUri: validHandshake.redirect_uri,
    });

    const identity = await auth.identify(tokens.accessToken);

    const accountFields = {
      user_id: validHandshake.user_id,
      provider: validHandshake.provider,
      provider_user_id: identity.providerUserId,
      email: identity.email,
      status: 'active' as const,
      scopes: tokens.scopes,
      last_error: null,
      connected_at: new Date().toISOString(),
    };

    // Find the natural key before writing. Reconnecting must refresh the
    // existing secret in place, and a failed Vault operation must never delete
    // a connection that was already working.
    const { data: existingAccount, error: existingAccountError } = await admin
      .from('provider_accounts')
      .select('id')
      .eq('user_id', accountFields.user_id)
      .eq('provider', accountFields.provider)
      .eq('provider_user_id', accountFields.provider_user_id)
      .maybeSingle();

    if (existingAccountError) {
      console.error(
        JSON.stringify({
          code: 'PROVIDER_ACCOUNT_LOOKUP_FAILED',
          detail: existingAccountError.code,
        }),
      );
      throw new EdgeError('UNKNOWN', 'Could not save the connection.', 500);
    }

    const isNewAccount = !existingAccount;
    let accountId: string;

    if (existingAccount) {
      accountId = z.string().uuid().parse(existingAccount.id);
    } else {
      const { data: insertedAccount, error: accountError } = await admin
        .from('provider_accounts')
        .insert(accountFields)
        .select('id')
        .single();

      if (accountError || !insertedAccount) {
        console.error(
          JSON.stringify({ code: 'PROVIDER_ACCOUNT_INSERT_FAILED', detail: accountError?.code }),
        );
        throw new EdgeError('UNKNOWN', 'Could not save the connection.', 500);
      }
      accountId = z.string().uuid().parse(insertedAccount.id);
    }

    const { error: secretError } = await admin.rpc('store_provider_secret', {
      p_account_id: accountId,
      p_secret: tokens.refreshToken,
    });

    if (secretError) {
      // A new connection without a stored credential is worse than no
      // connection: it would look connected and fail on every sync. Roll it
      // back, but leave an existing connection untouched so reconnect failure
      // does not destroy a working grant.
      if (isNewAccount) {
        const { error: rollbackError } = await admin
          .from('provider_accounts')
          .delete()
          .eq('id', accountId);
        if (rollbackError) {
          console.error(
            JSON.stringify({
              code: 'PROVIDER_ACCOUNT_ROLLBACK_FAILED',
              detail: rollbackError.code,
            }),
          );
        }
      }
      console.error(JSON.stringify({ code: 'VAULT_STORE_FAILED', detail: secretError.code }));
      throw new EdgeError('UNKNOWN', 'Could not store the credential.', 500);
    }

    if (!isNewAccount) {
      const { error: updateError } = await admin
        .from('provider_accounts')
        .update(accountFields)
        .eq('id', accountId);

      if (updateError) {
        console.error(
          JSON.stringify({ code: 'PROVIDER_ACCOUNT_UPDATE_FAILED', detail: updateError.code }),
        );
        throw new EdgeError('UNKNOWN', 'Could not save the connection.', 500);
      }
    }

    console.log(
      JSON.stringify({
        event: 'provider_connected',
        provider: validHandshake.provider,
        userId: validHandshake.user_id,
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
