import { z } from 'zod';

import { adminClient, requireUser } from '../_shared/auth/index.ts';
import { EdgeError, withErrorHandling } from '../_shared/errors/index.ts';
import { jsonResponse, preflight } from '../_shared/http/cors.ts';
import {
  loadAccount,
  resolveContext,
  type ProviderAccountRow,
} from '../_shared/providers/accounts.ts';
import { providerFor } from '../_shared/providers/registry.ts';
import { watchRegistrationFromState } from '../_shared/providers/watch.ts';
import { loadSyncState } from '../_shared/sync/engine.ts';
import { JOB_KINDS, calendarInitialSyncKey, enqueue } from '../_shared/sync/jobs.ts';

/**
 * Import or drop one provider calendar.
 *
 * Importing creates the local `calendars` row and its sync state, then enqueues
 * the durable first sync. A year of events can take longer than a request
 * should, and the client already knows to watch sync health.
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

  // A repeated import request must not reset a cursor while another initial or
  // incremental sync is running. The local calendar row is the import
  // identity; only a genuinely new state gets the full-sync defaults below.
  const existingState = await loadSyncState(admin, account.id, providerCalendarId);
  const stateValues: SyncStateImportValues = existingState
    ? {
        provider_account_id: account.id,
        calendar_id: calendar.id,
        provider_calendar_id: providerCalendarId,
      }
    : {
        provider_account_id: account.id,
        calendar_id: calendar.id,
        provider_calendar_id: providerCalendarId,
        sync_cursor: null,
        needs_full_resync: true,
        retry_count: 0,
        last_error: null,
      };

  const { data: state, error: stateError } = await admin
    .from('calendar_sync_states')
    .upsert(stateValues, { onConflict: 'provider_account_id,provider_calendar_id' })
    .select(
      'id, provider_account_id, calendar_id, provider_calendar_id, sync_cursor, ' +
        'needs_full_resync, webhook_channel_id, webhook_resource_id, ' +
        'webhook_subscription_id, webhook_token, webhook_expires_at, retry_count',
    )
    .single();

  if (stateError || !state) {
    console.error(JSON.stringify({ code: 'SYNC_STATE_INIT_FAILED', detail: stateError?.code }));
    throw new EdgeError('UNKNOWN', 'Could not prepare that calendar for syncing.', 500);
  }

  await enqueue(admin, {
    userId: account.user_id,
    providerAccountId: account.id,
    kind: JOB_KINDS.calendarInitialSync,
    payload: { calendarId: calendar.id as string },
    idempotencyKey: calendarInitialSyncKey(calendar.id as string),
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

type SyncStateImportValues = {
  provider_account_id: string;
  calendar_id: string;
  provider_calendar_id: string;
  sync_cursor?: string | null;
  needs_full_resync?: boolean;
  retry_count?: number;
  last_error?: string | null;
};

async function dropCalendar(
  admin: ReturnType<typeof adminClient>,
  account: ProviderAccountRow,
  providerCalendarId: string,
): Promise<Response> {
  const state = await loadSyncState(admin, account.id, providerCalendarId);
  const provider = providerFor(account.provider);

  if (provider.watchScope === 'calendar') {
    // Stop the provider watch before the state row disappears, or the provider
    // may keep delivering notifications we can no longer route. Account-scoped
    // registrations belong to the connection and survive dropping one calendar.
    const previousRegistration = state
      ? watchRegistrationFromState(state, new Date().toISOString())
      : null;
    if (previousRegistration) {
      try {
        const ctx = await resolveContext(admin, account);
        await provider.unwatch(ctx, previousRegistration);
      } catch (cause) {
        // An expired account cannot stop its provider watch; it lapses according
        // to provider limits (which may be only a few days), and every delivery
        // until then is dropped as unknown.
        console.error(JSON.stringify({ code: 'UNWATCH_ON_DROP_FAILED', detail: String(cause) }));
      }
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
