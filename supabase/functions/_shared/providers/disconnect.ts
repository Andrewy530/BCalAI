import type { SupabaseClient } from '@supabase/supabase-js';

import { loadAccount, resolveContext } from './accounts.ts';
import { authFor, isSupportedProvider, providerFor } from './registry.ts';

/**
 * Releasing a provider grant.
 *
 * Shared by the explicit disconnect and by account deletion, which must not
 * differ: both leave the user with no live OAuth grant and no orphaned change
 * channel.
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

  // Channels need a live access token, so they are stopped before the grant is
  // revoked — after revocation there is no way to reach them at all.
  await stopChannels(admin, providerAccountId, account.provider);

  if (typeof refreshToken === 'string' && refreshToken) {
    await authFor(account.provider).revoke(refreshToken);
  }

  const { error } = await admin.rpc('delete_provider_secret', { p_account_id: providerAccountId });
  if (error) {
    console.error(JSON.stringify({ code: 'VAULT_DELETE_FAILED', detail: error.code }));
  }
}

async function stopChannels(
  admin: SupabaseClient,
  providerAccountId: string,
  provider: string,
): Promise<void> {
  const { data: states } = await admin
    .from('calendar_sync_states')
    .select('webhook_channel_id, webhook_resource_id, webhook_token, webhook_expires_at')
    .eq('provider_account_id', providerAccountId);

  const live = (states ?? []).filter(
    (state) => state.webhook_channel_id && state.webhook_resource_id,
  );
  if (live.length === 0) return;

  try {
    const account = await loadAccount(admin, providerAccountId);
    const ctx = await resolveContext(admin, account);
    const adapter = providerFor(provider);

    for (const state of live) {
      await adapter.unwatch(ctx, {
        channelId: state.webhook_channel_id as string,
        resourceId: state.webhook_resource_id as string,
        subscriptionId: null,
        token: (state.webhook_token as string | null) ?? '',
        expiresAt: (state.webhook_expires_at as string | null) ?? new Date().toISOString(),
      });
    }
  } catch (cause) {
    // An expired connection cannot stop its own channels. They lapse within the
    // week, and every delivery until then is dropped as an unknown channel.
    console.error(JSON.stringify({ code: 'UNWATCH_FAILED', detail: String(cause) }));
  }
}
