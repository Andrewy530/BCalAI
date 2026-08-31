import { z } from 'zod';

import { adminClient, requireUser } from '../_shared/auth/index.ts';
import { EdgeError, withErrorHandling } from '../_shared/errors/index.ts';
import { runAfterResponse } from '../_shared/http/background.ts';
import { jsonResponse, preflight } from '../_shared/http/cors.ts';
import {
  loadAccount,
  resolveContext,
  type ProviderAccountRow,
} from '../_shared/providers/accounts.ts';
import { providerFor } from '../_shared/providers/registry.ts';
import {
  ensureWatch,
  loadSyncState,
  recordSyncFailure,
  syncCalendar,
  type SyncStateRow,
} from '../_shared/sync/engine.ts';

/**
 * Import or drop one provider calendar.
 *
 * Importing creates the local `calendars` row and its sync state, then does the
 * first sync *after* responding — a year of events can take longer than a
 * request should, and the client already knows to watch sync health.
 *
 * Dropping is the inverse and is deliberately destructive: deleting the
 * `calendars` row cascades its events away, because those rows are copies whose
 * authority lives at the provider. Nothing the user authored here is lost.
 */
const bodySchema = z.object({
  providerAccountId: z.string().uuid(),
  providerCalendarId: z.string().min(1),
  imported: z.boolean(),
});

const handler = withErrorHandling(async (request) => {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') throw new EdgeError('METHOD_NOT_ALLOWED', 'Use POST.', 405);

  const user = await requireUser(request);
  const input = parse(await request.json().catch(() => null));

  const admin = adminClient();
  const account = await loadAccount(admin, input.providerAccountId);
  if (account.user_id !== user.id) {
    throw new EdgeError('NOT_AUTHORIZED', 'That connection is not yours.', 403);
  }

  return input.imported
    ? await importCalendar(admin, account, input.providerCalendarId)
    : await dropCalendar(admin, account, input.providerCalendarId);
});

async function importCalendar(
  admin: ReturnType<typeof adminClient>,
  account: ProviderAccountRow,
  providerCalendarId: string,
): Promise<Response> {
  const ctx = await resolveContext(admin, account);

  // Read the calendar's own name and colour from the provider rather than
  // trusting anything the client sent.
  const available = await providerFor(account.provider).listCalendars(ctx);
  const source = available.find((entry) => entry.providerCalendarId === providerCalendarId);
  if (!source) throw new EdgeError('NOT_FOUND', 'That calendar is no longer available.', 404);

  const { data: calendar, error: calendarError } = await admin
    .from('calendars')
    .upsert(
      {
        user_id: account.user_id,
        name: source.name,
        color: source.color ?? '#6E8BFF',
        source_type: account.provider,
        provider_account_id: account.id,
        provider_calendar_id: providerCalendarId,
        is_read_only: source.isReadOnly,
        is_visible: true,
      },
      { onConflict: 'provider_account_id,provider_calendar_id' },
    )
    .select('id')
    .single();

  if (calendarError || !calendar) {
    console.error(JSON.stringify({ code: 'CALENDAR_IMPORT_FAILED', detail: calendarError?.code }));
    throw new EdgeError('UNKNOWN', 'Could not import that calendar.', 500);
  }

  const { data: state, error: stateError } = await admin
    .from('calendar_sync_states')
    .upsert(
      {
        provider_account_id: account.id,
        calendar_id: calendar.id,
        provider_calendar_id: providerCalendarId,
        // A fresh import always starts from a full window, even if a previous
        // import of the same calendar left a cursor behind.
        sync_cursor: null,
        needs_full_resync: true,
        retry_count: 0,
        last_error: null,
      },
      { onConflict: 'provider_account_id,provider_calendar_id' },
    )
    .select(
      'id, provider_account_id, calendar_id, provider_calendar_id, sync_cursor, ' +
        'needs_full_resync, webhook_channel_id, webhook_resource_id, webhook_token, ' +
        'webhook_expires_at, retry_count',
    )
    .single();

  if (stateError || !state) {
    console.error(JSON.stringify({ code: 'SYNC_STATE_INIT_FAILED', detail: stateError?.code }));
    throw new EdgeError('UNKNOWN', 'Could not prepare that calendar for syncing.', 500);
  }

  const syncState = state as SyncStateRow;

  runAfterResponse(async () => {
    try {
      await syncCalendar(admin, account, ctx, syncState);
      // Only worth a channel once there is something to keep up to date.
      await ensureWatch(admin, account, ctx, syncState);
    } catch (error) {
      await recordSyncFailure(admin, syncState, error);
      throw error;
    }
  });

  console.log(
    JSON.stringify({
      event: 'calendar_imported',
      provider: account.provider,
      calendarId: calendar.id,
    }),
  );

  return jsonResponse({ calendarId: calendar.id, syncing: true });
}

async function dropCalendar(
  admin: ReturnType<typeof adminClient>,
  account: ProviderAccountRow,
  providerCalendarId: string,
): Promise<Response> {
  const state = await loadSyncState(admin, account.id, providerCalendarId);

  // Stop the channel before the state row disappears, or Google keeps
  // delivering notifications we can no longer route.
  if (state?.webhook_channel_id && state.webhook_resource_id) {
    try {
      const ctx = await resolveContext(admin, account);
      await providerFor(account.provider).unwatch(ctx, {
        channelId: state.webhook_channel_id,
        resourceId: state.webhook_resource_id,
        subscriptionId: null,
        token: state.webhook_token ?? '',
        expiresAt: state.webhook_expires_at ?? new Date().toISOString(),
      });
    } catch (cause) {
      // An expired account cannot stop its channels; the channel lapses on its
      // own within a week and every delivery until then is dropped as unknown.
      console.error(JSON.stringify({ code: 'UNWATCH_ON_DROP_FAILED', detail: String(cause) }));
    }
  }

  const { error } = await admin
    .from('calendars')
    .delete()
    .eq('provider_account_id', account.id)
    .eq('provider_calendar_id', providerCalendarId);

  if (error) throw new EdgeError('UNKNOWN', 'Could not remove that calendar.', 500);

  // calendar_sync_states.calendar_id cascades to null-free deletion with the
  // calendar row, but a state row keyed only to the account can survive it.
  await admin
    .from('calendar_sync_states')
    .delete()
    .eq('provider_account_id', account.id)
    .eq('provider_calendar_id', providerCalendarId);

  console.log(
    JSON.stringify({
      event: 'calendar_dropped',
      provider: account.provider,
      accountId: account.id,
    }),
  );

  return jsonResponse({ calendarId: null, syncing: false });
}

function parse(body: unknown) {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) throw new EdgeError('VALIDATION_FAILED', 'Pick a calendar to import.', 400);
  return parsed.data;
}

Deno.serve(handler);
