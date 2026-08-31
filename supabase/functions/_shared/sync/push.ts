import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { EdgeError } from '../errors/index.ts';
import type { ProviderAccountRow } from '../providers/accounts.ts';
import { providerFor } from '../providers/registry.ts';
import type { NormalisedEvent, ProviderContext, ProviderEventInput } from '../providers/types.ts';

/**
 * Outward writes.
 *
 * `docs/sync-engine.md` § Writes: the provider mutation happens *first*, and
 * the local copy is only written once the provider has confirmed it. That
 * ordering is why the draft arrives here rather than being saved by the app —
 * writing locally and pushing afterwards is what produces the failure users
 * describe as their calendar "changing back", because a rejected push leaves a
 * local row matching nothing real.
 *
 * A rejected edit therefore leaves nothing behind on a create, and marks the
 * row `failed` on an update, so the user learns their change has not landed
 * rather than watching it silently revert.
 */

export const eventDraftSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(10_000).nullish(),
  location: z.string().max(500).nullish(),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  allDay: z.boolean().default(false),
  timezone: z.string().min(1).max(64),
  recurrenceRule: z.string().nullish(),
  alerts: z.array(z.number().int().min(0).max(60 * 24 * 28)).max(5).default([]),
});

export type EventDraft = z.infer<typeof eventDraftSchema>;

export type PushRequest =
  | { operation: 'create'; calendarId: string; draft: EventDraft }
  | { operation: 'update'; eventId: string; draft: EventDraft }
  | { operation: 'delete'; eventId: string };

export interface PushResult {
  eventId: string | null;
  providerEventId: string | null;
}

interface EventRow {
  id: string;
  calendar_id: string;
  provider_event_id: string | null;
  provider_etag: string | null;
}

const EVENT_COLUMNS = 'id, calendar_id, provider_event_id, provider_etag';

export async function pushEvent(
  admin: SupabaseClient,
  account: ProviderAccountRow,
  ctx: ProviderContext,
  request: PushRequest,
): Promise<PushResult> {
  switch (request.operation) {
    case 'create':
      return await createOutward(admin, account, ctx, request.calendarId, request.draft);
    case 'update':
      return await updateOutward(admin, account, ctx, request.eventId, request.draft);
    case 'delete':
      return await deleteOutward(admin, account, ctx, request.eventId);
  }
}

async function createOutward(
  admin: SupabaseClient,
  account: ProviderAccountRow,
  ctx: ProviderContext,
  calendarId: string,
  draft: EventDraft,
): Promise<PushResult> {
  const providerCalendarId = await resolveWritableCalendar(admin, calendarId, account.user_id);

  // Provider first. Nothing is written locally until this returns.
  const created = await providerFor(account.provider).createEvent(
    ctx,
    providerCalendarId,
    toProviderInput(draft),
  );

  const { data, error } = await admin
    .from('events')
    .upsert(toRow(created, account, calendarId), {
      onConflict: 'provider_account_id,provider_event_id',
    })
    .select('id')
    .single();

  if (error || !data) {
    // The event exists in Google but not here. Harmless and self-correcting:
    // the next sync of this calendar imports it like any other provider event.
    console.error(JSON.stringify({ code: 'LOCAL_MIRROR_FAILED', detail: error?.code }));
    return { eventId: null, providerEventId: created.providerEventId };
  }

  console.log(JSON.stringify({ event: 'provider_event_created', provider: account.provider }));
  return { eventId: data.id as string, providerEventId: created.providerEventId };
}

async function updateOutward(
  admin: SupabaseClient,
  account: ProviderAccountRow,
  ctx: ProviderContext,
  eventId: string,
  draft: EventDraft,
): Promise<PushResult> {
  const event = await loadEvent(admin, eventId, account.user_id);
  if (!event.provider_event_id) {
    throw new EdgeError('VALIDATION_FAILED', 'That event has no provider copy yet.', 400);
  }

  const providerCalendarId = await resolveWritableCalendar(
    admin,
    event.calendar_id,
    account.user_id,
  );

  try {
    const updated = await providerFor(account.provider).updateEvent(
      ctx,
      providerCalendarId,
      event.provider_event_id,
      toProviderInput(draft),
    );

    const { error } = await admin
      .from('events')
      .update(toRow(updated, account, event.calendar_id))
      .eq('id', event.id);

    if (error) throw new EdgeError('UNKNOWN', 'Could not update the local copy.', 500);

    console.log(JSON.stringify({ event: 'provider_event_updated', provider: account.provider }));
    return { eventId: event.id, providerEventId: updated.providerEventId };
  } catch (error) {
    const conflict = error instanceof EdgeError && error.code === 'EVENT_PROVIDER_CONFLICT';

    // The local row still holds the *old* values, which are what the provider
    // still has. Marking it surfaces the failed edit without inventing state.
    await admin
      .from('events')
      .update({ sync_status: conflict ? 'conflict' : 'failed' })
      .eq('id', event.id);

    throw error;
  }
}

async function deleteOutward(
  admin: SupabaseClient,
  account: ProviderAccountRow,
  ctx: ProviderContext,
  eventId: string,
): Promise<PushResult> {
  const event = await loadEvent(admin, eventId, account.user_id);

  if (event.provider_event_id) {
    const providerCalendarId = await resolveWritableCalendar(
      admin,
      event.calendar_id,
      account.user_id,
    );

    try {
      await providerFor(account.provider).deleteEvent(
        ctx,
        providerCalendarId,
        event.provider_event_id,
      );
    } catch (error) {
      await admin.from('events').update({ sync_status: 'failed' }).eq('id', event.id);
      throw error;
    }
  }

  // Only now is the local copy safe to remove.
  await admin.from('events').delete().eq('id', event.id).eq('user_id', account.user_id);

  console.log(JSON.stringify({ event: 'provider_event_deleted', provider: account.provider }));
  return { eventId: null, providerEventId: null };
}

// ---------------------------------------------------------------------------

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

async function resolveWritableCalendar(
  admin: SupabaseClient,
  calendarId: string,
  userId: string,
): Promise<string> {
  const { data, error } = await admin
    .from('calendars')
    .select('provider_calendar_id, is_read_only')
    .eq('id', calendarId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new EdgeError('UNKNOWN', 'Could not read that calendar.', 500);
  if (!data?.provider_calendar_id) {
    throw new EdgeError('VALIDATION_FAILED', 'That calendar is not a synced calendar.', 400);
  }
  if (data.is_read_only) {
    // Google grants `reader` on subscribed calendars — holidays, a shared team
    // calendar. The write would fail at the provider anyway; refusing here
    // gives the user a sentence instead of a 403.
    throw new EdgeError('NOT_AUTHORIZED', 'That calendar is read-only.', 403);
  }

  return data.provider_calendar_id as string;
}

function toRow(
  event: NormalisedEvent,
  account: ProviderAccountRow,
  calendarId: string,
): Record<string, unknown> {
  return {
    user_id: account.user_id,
    calendar_id: calendarId,
    title: event.title,
    description: event.description,
    location: event.location,
    start_at: event.startAt,
    end_at: event.endAt,
    all_day: event.allDay,
    timezone: event.timezone,
    status: event.status,
    recurrence_rule: event.recurrenceRule,
    alerts: event.alerts,
    source_type: account.provider,
    provider_account_id: account.id,
    provider_event_id: event.providerEventId,
    provider_etag: event.providerEtag,
    provider_updated_at: event.providerUpdatedAt,
    // The provider echoed the write back to us, so the copy is current by
    // construction — not optimistically, but because this *is* their version.
    sync_status: 'synced',
  };
}

function toProviderInput(draft: EventDraft): ProviderEventInput {
  return {
    title: draft.title,
    description: draft.description ?? null,
    location: draft.location ?? null,
    startAt: draft.startAt,
    endAt: draft.endAt,
    allDay: draft.allDay,
    timezone: draft.timezone,
    recurrenceRule: draft.recurrenceRule ?? null,
    alerts: draft.alerts,
  };
}
