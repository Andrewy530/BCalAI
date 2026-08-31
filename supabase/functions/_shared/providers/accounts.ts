import type { SupabaseClient } from '@supabase/supabase-js';

import { EdgeError } from '../errors/index.ts';

import { authFor } from './registry.ts';
import type { ProviderContext, ProviderKind } from './types.ts';

/**
 * Connected-account bookkeeping: resolving an access token, and recording the
 * health of the connection.
 *
 * The refresh token is read through `read_provider_secret`, used, and dropped.
 * It is never returned from this module, never logged, and never placed on a
 * context object that outlives the request.
 */

export interface ProviderAccountRow {
  id: string;
  user_id: string;
  provider: ProviderKind;
  provider_user_id: string;
  email: string | null;
  status: string;
  scopes: string[];
}

export async function loadAccount(
  admin: SupabaseClient,
  providerAccountId: string,
): Promise<ProviderAccountRow> {
  const { data, error } = await admin
    .from('provider_accounts')
    .select('id, user_id, provider, provider_user_id, email, status, scopes')
    .eq('id', providerAccountId)
    .maybeSingle();

  if (error) throw new EdgeError('UNKNOWN', 'Could not read the connection.', 500);
  if (!data) throw new EdgeError('NOT_FOUND', 'That connection no longer exists.', 404);

  return data as ProviderAccountRow;
}

/**
 * Exchange the stored refresh token for a usable access token.
 *
 * There is deliberately no access-token cache. Google's refresh endpoint is
 * cheap relative to a sync run, and caching would mean a second secret with its
 * own expiry to keep correct — complexity that buys one saved round trip per
 * invocation. If sync volume ever makes that matter, cache it in Vault beside
 * the refresh token rather than in a column.
 */
export async function resolveContext(
  admin: SupabaseClient,
  account: ProviderAccountRow,
): Promise<ProviderContext> {
  const { data: refreshToken, error } = await admin.rpc('read_provider_secret', {
    p_account_id: account.id,
  });

  if (error || !refreshToken || typeof refreshToken !== 'string') {
    await markAccount(admin, account.id, 'expired', 'No stored credential.');
    throw new EdgeError('GOOGLE_AUTH_EXPIRED', 'Reconnect your calendar account.', 401);
  }

  try {
    const tokens = await authFor(account.provider).refresh(refreshToken);

    // Google may rotate the refresh token. Persisting the replacement is what
    // keeps a long-lived connection from dying on a future refresh.
    if (tokens.refreshToken && tokens.refreshToken !== refreshToken) {
      await admin.rpc('store_provider_secret', {
        p_account_id: account.id,
        p_secret: tokens.refreshToken,
      });
    }

    if (account.status !== 'active') {
      await markAccount(admin, account.id, 'active', null);
    }

    return {
      providerAccountId: account.id,
      userId: account.user_id,
      accessToken: tokens.accessToken,
    };
  } catch (cause) {
    const expired = cause instanceof EdgeError && cause.code === 'GOOGLE_AUTH_EXPIRED';
    if (expired) {
      await markAccount(admin, account.id, 'expired', 'The provider rejected our credential.');
    }
    throw cause;
  }
}

/**
 * Record connection health.
 *
 * `last_error` is client-readable, so it must stay a short sentence we wrote —
 * never a provider message, which can quote event titles.
 */
export async function markAccount(
  admin: SupabaseClient,
  providerAccountId: string,
  status: 'active' | 'expired' | 'revoked' | 'error',
  message: string | null,
): Promise<void> {
  await admin
    .from('provider_accounts')
    .update({ status, last_error: message })
    .eq('id', providerAccountId);
}

export async function touchSynced(admin: SupabaseClient, providerAccountId: string): Promise<void> {
  await admin
    .from('provider_accounts')
    .update({ last_sync_at: new Date().toISOString(), last_error: null, status: 'active' })
    .eq('id', providerAccountId);
}
