import type { SupabaseClient } from '@supabase/supabase-js';

import { loadAccount, resolveContext, type ProviderAccountRow } from './accounts.ts';
import { authFor, isSupportedProvider, providerFor } from './registry.ts';
import { watchRegistrationFromState, type StoredWatchState } from './watch.ts';
import type { WatchRegistration } from './types.ts';

/**
 * Releasing a provider grant.
 *
 * Shared by the explicit disconnect and by account deletion, which must not
 * differ: both leave the user with no live OAuth grant and no orphaned change
 * notification registration.
 *
 * Every step is best-effort and ordered so the irreversible local delete
 * happens last, at the caller. A provider we cannot reach must never block a
 * user from disconnecting or deleting their account.
 */
export async function releaseProviderGrant(
  admin: SupabaseClient,
  providerAccountId: string,
): Promise<void> {
  let account;
  try {
    account = await loadAccount(admin, providerAccountId);
  } catch {
    return;
  }

  if (!isSupportedProvider(account.provider)) return;

  const { data: refreshToken } = await admin.rpc('read_provider_secret', {
    p_account_id: providerAccountId,
  });

  // Provider watches need a live access token, so they are stopped before the
  // grant is revoked — after revocation there is no way to reach them at all.
  await stopChannels(admin, account);

  if (typeof refreshToken === 'string' && refreshToken) {
    await authFor(account.provider).revoke(refreshToken);
  }

  const { error } = await admin.rpc('delete_provider_secret', { p_account_id: providerAccountId });
  if (error) {
    console.error(JSON.stringify({ code: 'VAULT_DELETE_FAILED', detail: error.code }));
  }
}

async function stopChannels(admin: SupabaseClient, account: ProviderAccountRow): Promise<void> {
  const { data: states } = await admin
    .from('calendar_sync_states')
    .select(
      'webhook_channel_id, webhook_resource_id, webhook_subscription_id, ' +
        'webhook_token, webhook_expires_at',
    )
    .eq('provider_account_id', account.id);

  const fallbackExpiresAt = new Date().toISOString();
  const live: WatchRegistration[] = [];
  const accountRegistration = watchRegistrationFromState(account, fallbackExpiresAt);
  if (accountRegistration) live.push(accountRegistration);

  for (const state of states ?? []) {
    const registration = watchRegistrationFromState(
      state as unknown as StoredWatchState,
      fallbackExpiresAt,
    );
    if (registration) live.push(registration);
  }

  const seen = new Set<string>();
  const registrations = live.filter((registration) => {
    const key =
      `${registration.channelId}\u0000${registration.resourceId ?? ''}` +
      `\u0000${registration.subscriptionId ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (registrations.length === 0) return;

  try {
    const ctx = await resolveContext(admin, account);
    const adapter = providerFor(account.provider);

    for (const registration of registrations) {
      try {
        await adapter.unwatch(ctx, registration);
      } catch (cause) {
        // One stale registration must not prevent the remaining registrations
        // from being stopped during disconnect or account deletion.
        console.error(JSON.stringify({ code: 'UNWATCH_FAILED', detail: String(cause) }));
      }
    }
  } catch (cause) {
    // An expired connection cannot stop its own provider watches. They lapse
    // according to provider limits (which may be only a few days), and every
    // delivery until then is dropped as an unknown watch.
    console.error(JSON.stringify({ code: 'UNWATCH_FAILED', detail: String(cause) }));
  }
}
