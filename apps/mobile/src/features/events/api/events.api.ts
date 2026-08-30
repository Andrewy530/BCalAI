import {
  type Calendar,
  type CalendarEvent,
  type CreateCalendarInput,
  type CreateEventInput,
  type UpdateEventInput,
  calendarSchema,
  createCalendarSchema,
  createEventSchema,
  eventSchema,
  updateEventSchema,
} from '@cal/schemas';
import { z } from 'zod';

import { toAppError } from '../../../lib/errors/app-error';
import { supabase } from '../../../lib/supabase/client';

/**
 * The only module that knows how calendars and events are stored.
 *
 * Note the window read below: events are fetched by overlapping time range
 * rather than all at once, because a calendar's dataset grows without bound
 * and the views only ever show a bounded span.
 */

const EVENT_COLUMNS =
  'id, user_id, calendar_id, title, description, location, start_at, end_at, all_day, ' +
  'timezone, status, recurrence_rule, alerts, source_type, provider_event_id, provider_etag, ' +
  'provider_updated_at, sync_status, created_at, updated_at';

const eventRowSchema = z
  .object({
    id: z.string(),
    user_id: z.string(),
    calendar_id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    location: z.string().nullable(),
    start_at: z.string(),
    end_at: z.string(),
    all_day: z.boolean(),
    timezone: z.string(),
    status: z.string(),
    recurrence_rule: z.string().nullable(),
    alerts: z.array(z.number()).nullable(),
    source_type: z.string(),
    provider_event_id: z.string().nullable(),
    provider_etag: z.string().nullable(),
    provider_updated_at: z.string().nullable(),
    sync_status: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .transform((row) => ({
    id: row.id,
    userId: row.user_id,
    calendarId: row.calendar_id,
    title: row.title,
    description: row.description,
    location: row.location,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: row.all_day,
    timezone: row.timezone,
    status: row.status,
    recurrenceRule: row.recurrence_rule,
    alerts: row.alerts ?? [],
    sourceType: row.source_type,
    providerEventId: row.provider_event_id,
    providerEtag: row.provider_etag,
    providerUpdatedAt: row.provider_updated_at,
    syncStatus: row.sync_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
  .pipe(eventSchema);

const calendarRowSchema = z
  .object({
    id: z.string(),
    user_id: z.string(),
    name: z.string(),
    color: z.string(),
    source_type: z.string(),
    provider_account_id: z.string().nullable(),
    provider_calendar_id: z.string().nullable(),
    is_visible: z.boolean(),
    is_default: z.boolean(),
    is_read_only: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .transform((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    color: row.color,
    sourceType: row.source_type,
    providerAccountId: row.provider_account_id,
    providerCalendarId: row.provider_calendar_id,
    isVisible: row.is_visible,
    isDefault: row.is_default,
    isReadOnly: row.is_read_only,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
  .pipe(calendarSchema);

// ---------------------------------------------------------------------------
// Calendars
// ---------------------------------------------------------------------------

export async function fetchCalendars(): Promise<Calendar[]> {
  const { data, error } = await supabase
    .from('calendars')
    .select('*')
    .order('is_default', { ascending: false })
    .order('name');

  if (error) throw toAppError(error);
  return (data ?? []).map((row) => calendarRowSchema.parse(row));
}

export async function createCalendar(
  input: CreateCalendarInput,
  userId: string,
): Promise<Calendar> {
  const parsed = createCalendarSchema.parse(input);

  const { data, error } = await supabase
    .from('calendars')
    .insert({
      user_id: userId,
      name: parsed.name,
      color: parsed.color,
      is_visible: parsed.isVisible,
      is_default: parsed.isDefault,
    })
    .select('*')
    .single();

  if (error) throw toAppError(error);
  return calendarRowSchema.parse(data);
}

export async function updateCalendarVisibility(id: string, isVisible: boolean): Promise<void> {
  const { error } = await supabase.from('calendars').update({ is_visible: isVisible }).eq('id', id);
  if (error) throw toAppError(error);
}

export async function deleteCalendar(id: string): Promise<void> {
  const { error } = await supabase.from('calendars').delete().eq('id', id);
  if (error) throw toAppError(error);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * Every event that could appear between `start` and `end`.
 *
 * Recurring events are stored once, as a master row, so the window filter
 * cannot exclude them by start time — a weekly series that began last year
 * still has occurrences this week. They are fetched whole and expanded on the
 * client by `expandOccurrences`.
 */
export async function fetchEventsInWindow(start: Date, end: Date): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .neq('status', 'cancelled')
    .or(
      `and(start_at.lt.${end.toISOString()},end_at.gt.${start.toISOString()}),` +
        `recurrence_rule.not.is.null`,
    )
    .order('start_at');

  if (error) throw toAppError(error);
  return (data ?? []).map((row) => eventRowSchema.parse(row));
}

export async function fetchEvent(id: string): Promise<CalendarEvent> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .eq('id', id)
    .single();

  if (error) throw toAppError(error);
  return eventRowSchema.parse(data);
}

export async function createEvent(
  input: CreateEventInput,
  userId: string,
): Promise<CalendarEvent> {
  const parsed = createEventSchema.parse(input);

  const { data, error } = await supabase
    .from('events')
    .insert({
      user_id: userId,
      calendar_id: parsed.calendarId,
      title: parsed.title,
      description: parsed.description ?? null,
      location: parsed.location ?? null,
      start_at: parsed.startAt,
      end_at: parsed.endAt,
      all_day: parsed.allDay,
      timezone: parsed.timezone,
      recurrence_rule: parsed.recurrenceRule ?? null,
      alerts: parsed.alerts,
    })
    .select(EVENT_COLUMNS)
    .single();

  if (error) throw toAppError(error);
  return eventRowSchema.parse(data);
}

export async function updateEvent(input: UpdateEventInput): Promise<CalendarEvent> {
  const parsed = updateEventSchema.parse(input);
  const { id, ...patch } = parsed;

  const columns: Record<string, string> = {
    calendarId: 'calendar_id',
    title: 'title',
    description: 'description',
    location: 'location',
    startAt: 'start_at',
    endAt: 'end_at',
    allDay: 'all_day',
    timezone: 'timezone',
    status: 'status',
    recurrenceRule: 'recurrence_rule',
    alerts: 'alerts',
  };

  const payload: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(columns)) {
    const value = patch[key as keyof typeof patch];
    if (value !== undefined) payload[column] = value;
  }

  const { data, error } = await supabase
    .from('events')
    .update(payload)
    .eq('id', id)
    .select(EVENT_COLUMNS)
    .single();

  if (error) throw toAppError(error);
  return eventRowSchema.parse(data);
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw toAppError(error);
}
