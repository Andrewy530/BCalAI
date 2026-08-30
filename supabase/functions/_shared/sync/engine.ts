import type { SupabaseClient } from '@supabase/supabase-js';

import { EdgeError } from '../errors/index.ts';
import { markAccount, touchSynced, type ProviderAccountRow } from '../providers/accounts.ts';
import { providerFor } from '../providers/registry.ts';
import type { ProviderContext, SyncResult } from '../providers/types.ts';

import { applyProviderEvents } from './upsert.ts';
import { initialSyncWindow, webhookUrlFor } from './window.ts';

/**
 * One calendar's worth of sync, from cursor to committed rows.
 *
 * Every entry point — the connect flow, a webhook, cron, a manual refresh —
 * ends up here, so the decision "initial or incremental?" is made in exactly
 * one place, from persisted state rather than from what the caller believed.
 */

export interface SyncStateRow {
  id: string;
  provider_account_id: string;
  calendar_id: string | null;
  provider_calendar_id: string;
  sync_cursor: string | null;
  needs_full_resync: boolean;
  webhook_channel_id: string | null;
  webhook_resource_id: string | null;
  webhook_token: string | null;
  webhook_expires_at: string | null;
  retry_count: number;
}

export interface SyncOutcome {
  mode: 'initial' | 'incremental';
  written: number;
  deleted: number;
  skippedPending: number;
}

const SYNC_STATE_COLUMNS =
  'id, provider_account_id, calendar_id, provider_calendar_id, sync_cursor, ' +
  'needs_full_resync, webhook_channel_id, webhook_resource_id, webhook_token, ' +
  'webhook_expires_at, retry_count';

export async function loadSyncState(
  admin: SupabaseClient,
  providerAccountId: string,
  providerCalendarId: string,
): Promise<SyncStateRow | null> {
  const { data, error } = await admin
    .from('calendar_sync_states')
    .select(SYNC_STATE_COLUMNS)
    .eq('provider_account_id', providerAccountId)
    .eq('provider_calendar_id', providerCalendarId)
    .maybeSingle();

  if (error) throw new EdgeError('UNKNOWN', 'Could not read sync state.', 500);
  return (data as SyncStateRow | null) ?? null;
}

export async function loadSyncStateByCalendar(
  admin: SupabaseClient,
  calendarId: string,
): Promise<SyncStateRow | null> {
  const { data, error } = await admin
    .from('calendar_sync_states')
    .select(SYNC_STATE_COLUMNS)
    .eq('calendar_id', calendarId)
    .maybeSingle();

  if (error) throw new EdgeError('UNKNOWN', 'Could not read sync state.', 500);
  return (data as SyncStateRow | null) ?? null;
}

/**
 * Sync one calendar.
 *
 * An expired cursor is not an error here — it is a documented provider
 * behaviour with exactly one correct response, so it is handled inline by
 * falling back to a full resync rather than propagated as a failure the queue
 * would retry five times and then give up on.
 */
export async function syncCalendar(
  admin: SupabaseClient,
  account: ProviderAccountRow,
  ctx: ProviderContext,
  state: SyncStateRow,
): Promise<SyncOutcome> {
  if (!state.calendar_id) {
    throw new EdgeError('NOT_FOUND', 'That calendar is not imported.', 404);
  }

  const provider = providerFor(account.provider);
  const canIncrement = Boolean(state.sync_cursor) && !state.needs_full_resync;

  let mode: 'initial' | 'incremental' = canIncrement ? 'incremental' : 'initial';
  let result: SyncResult = canIncrement
    ? await provider.incrementalSync(ctx, state.provider_calendar_id, state.sync_cursor as string)
    : await provider.initialSync(ctx, state.provider_calendar_id, initialSyncWindow());

  if (result.cursorInvalid) {
    console.warn(
      JSON.stringify({ code: 'GOOGLE_SYNC_CURSOR_INVALID', calendarId: state.calendar_id }),
    );
    mode = 'initial';
    result = await provider.initialSync(ctx, state.provider_calendar_id, initialSyncWindow());
  }

  const outcome = await applyProviderEvents(
    admin,
    {
      userId: account.user_id,
      calendarId: state.calendar_id,
      providerAccountId: account.id,
    },
    result.events,
    account.provider,
  );

  const now = new Date().toISOString();
  await admin
    .from('calendar_sync_states')
    .update({
      sync_cursor: result.cursor ?? state.sync_cursor,
      needs_full_resync: false,
      retry_count: 0,
      last_error: null,
      ...(mode === 'initial' ? { last_full_sync_at: now } : {}),
      last_incremental_sync_at: now,
    })
    .eq('id', state.id);

  await touchSynced(admin, account.id);

  console.log(
    JSON.stringify({
      event: 'calendar_synced',
      provider: account.provider,
      calendarId: state.calendar_id,
      mode,
      written: outcome.written,
      deleted: outcome.deleted,
      skippedPending: outcome.skippedPending,
    }),
  );

  return { mode, ...outcome };
}

/** Record a per-calendar failure without losing the reason for the operator. */
export async function recordSyncFailure(
  admin: SupabaseClient,
  state: SyncStateRow,
  error: unknown,
): Promise<void> {
  const code = error instanceof EdgeError ? error.code : 'UNKNOWN';

  await admin
    .from('calendar_sync_states')
    .update({
      last_error: code,
      retry_count: state.retry_count + 1,
      // An invalid cursor should not be presented again on the retry.
      needs_full_resync: code === 'GOOGLE_SYNC_CURSOR_INVALID' ? true : state.needs_full_resync,
    })
    .eq('id', state.id);
}

/**
 * (Re)register the provider's change channel.
 *
 * Called on import and again by the hourly cron. Failure is logged but not
 * fatal: without a channel the calendar still converges through the daily
 * reconciliation, just less promptly.
 */
export async function ensureWatch(
  admin: SupabaseClient,
  account: ProviderAccountRow,
  ctx: ProviderContext,
  state: SyncStateRow,
): Promise<boolean> {
  const provider = providerFor(account.provider);

  try {
    // Stop the previous channel first, or Google keeps delivering to a channel
    // whose id we have already forgotten.
    if (state.webhook_channel_id && state.webhook_resource_id) {
      await provider.unwatch(ctx, {
        channelId: state.webhook_channel_id,
        resourceId: state.webhook_resource_id,
        subscriptionId: null,
        token: state.webhook_token ?? '',
        expiresAt: state.webhook_expires_at ?? new Date().toISOString(),
      });
    }

    const registration = await provider.watch(
      ctx,
      state.provider_calendar_id,
      webhookUrlFor(account.provider),
    );

    await admin
      .from('calendar_sync_states')
      .update({
        webhook_channel_id: registration.channelId,
        webhook_resource_id: registration.resourceId,
        webhook_subscription_id: registration.subscriptionId,
        webhook_token: registration.token,
        webhook_expires_at: registration.expiresAt,
      })
      .eq('id', state.id);

    return true;
  } catch (cause) {
    const code = cause instanceof EdgeError ? cause.code : 'UNKNOWN';
    console.error(
      JSON.stringify({ code: 'WATCH_REGISTRATION_FAILED', reason: code, stateId: state.id }),
    );

    if (code === 'GOOGLE_AUTH_EXPIRED') {
      await markAccount(admin, account.id, 'expired', 'Reconnect this account.');
    }
    return false;
  }
}
