import type { SupabaseClient } from '@supabase/supabase-js';

import { EdgeError } from '../errors/index.ts';
import type { ProviderAccountRow } from '../providers/accounts.ts';
import { providerFor } from '../providers/registry.ts';
import type {
  EventStatus,
  NormalisedEvent,
  ProviderContext,
  ProviderEventInput,
} from '../providers/types.ts';

/**
 * Outward writes.
 *
 * `docs/sync-engine.md` § Writes: the provider mutation happens *first*, and
 * the local copy is only updated once the provider has confirmed it. The
 * tempting inverse — write locally, push later — is what produces the failure
 * users describe as their calendar "changing back", because a rejected push
 * leaves a local row that no longer matches anything real.
 *
 * A failed push therefore does not roll the local row back either. It marks it
 * `failed`, which is visible in the UI and retried by the queue, so the user
 * knows their edit has not landed rather than watching it silently vanish.
 */

export type PushOperation = 'create' | 'update' | 'delete';

export interface PushRequest {
  eventId: string;
  operation: PushOperation;
  providerCalendarId: string | null;
  providerEventId: string | null;
}

interface EventRow {
  id: string;
  user_id: string;
  calendar_id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  timezone: string;
  status: string;
  recurrence_rule: string | null;
  alerts: number[] | null;
  provider_event_id: string | null;
  provider_etag: string | null;
}

const EVENT_COLUMNS =
  'id, user_id, calendar_id, title, description, location, start_at, end_at, all_day, ' +
  'timezone, status, recurrence_rule, alerts, provider_event_id, provider_etag';

export async function pushEvent(
  admin: SupabaseClient,
  account: ProviderAccountRow,
  ctx: ProviderContext,
  request: PushRequest,
): Promise<{ providerEventId: string | null }> {
  const provider = providerFor(account.provider);

  if (request.operation === 'delete') {
    const providerCalendarId = request.providerCalendarId;
    const providerEventId = request.providerEventId;

    if (!providerCalendarId || !providerEventId) {
      throw new EdgeError('VALIDATION_FAILED', 'Nothing to delete at the provider.', 400);
    }

    await provider.deleteEvent(ctx, providerCalendarId, providerEventId);

    // Only now is the local copy safe to remove.
    await admin.from('events').delete().eq('id', request.eventId).eq('user_id', account.user_id);

    console.log(
      JSON.stringify({ event: 'provider_event_deleted', provider: account.provider }),
    );
    return { providerEventId: null };
  }

  const event = await loadEvent(admin, request.eventId, account.user_id);
  const providerCalendarId =
    request.providerCalendarId ?? (await resolveProviderCalendarId(admin, event.calendar_id));

  const input = toProviderInput(event);

  try {
    const result: NormalisedEvent =
      request.operation === 'create' || !event.provider_event_id
        ? await provider.createEvent(ctx, providerCalendarId, input)
        : await provider.updateEvent(ctx, providerCalendarId, event.provider_event_id, input);

    await admin
      .from('events')
      .update({
        provider_account_id: account.id,
        provider_event_id: result.providerEventId,
        provider_etag: result.providerEtag,
        provider_updated_at: result.providerUpdatedAt,
        source_type: account.provider,
        sync_status: 'synced',
      })
      .eq('id', event.id);

    console.log(
      JSON.stringify({
        event: 'provider_event_written',
        provider: account.provider,
        operation: request.operation,
      }),
    );

    return { providerEventId: result.providerEventId };
  } catch (error) {
    const conflict = error instanceof EdgeError && error.code === 'EVENT_PROVIDER_CONFLICT';

    await admin
      .from('events')
      .update({ sync_status: conflict ? 'conflict' : 'failed' })
      .eq('id', event.id);

    throw error;
  }
}

async function loadEvent(
  admin: SupabaseClient,
  eventId: string,
  userId: string,
): Promise<EventRow> {
  const { data, error } = await admin
    .from('events')
    .select(EVENT_COLUMNS)
    .eq('id', eventId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new EdgeError('UNKNOWN', 'Could not read that event.', 500);
  if (!data) throw new EdgeError('NOT_FOUND', 'That event no longer exists.', 404);

  return data as EventRow;
}

async function resolveProviderCalendarId(
  admin: SupabaseClient,
  calendarId: string,
): Promise<string> {
  const { data, error } = await admin
    .from('calendars')
    .select('provider_calendar_id, is_read_only')
    .eq('id', calendarId)
    .maybeSingle();

  if (error) throw new EdgeError('UNKNOWN', 'Could not read that calendar.', 500);
  if (!data?.provider_calendar_id) {
    throw new EdgeError('VALIDATION_FAILED', 'That calendar is not a synced calendar.', 400);
  }
  if (data.is_read_only) {
    // Google grants `reader` access to subscribed calendars — holidays, a
    // shared team calendar. Attempting the write would fail at the provider
    // anyway; refusing here gives the user a sentence instead of a 403.
    throw new EdgeError('NOT_AUTHORIZED', 'That calendar is read-only.', 403);
  }

  return data.provider_calendar_id as string;
}

/** The column is an enum in Postgres, but it arrives here as a plain string. */
function toEventStatus(value: string): EventStatus {
  return value === 'tentative' || value === 'cancelled' ? value : 'confirmed';
}

function toProviderInput(event: EventRow): ProviderEventInput {
  return {
    title: event.title,
    description: event.description,
    location: event.location,
    startAt: event.start_at,
    endAt: event.end_at,
    allDay: event.all_day,
    timezone: event.timezone,
    recurrenceRule: event.recurrence_rule,
    alerts: event.alerts ?? [],
    status: toEventStatus(event.status),
  };
}
