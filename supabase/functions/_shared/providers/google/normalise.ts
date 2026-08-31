import { safeTimeZone, zonedDateToUtc } from '../../time/zoned.ts';
import type { EventStatus, NormalisedEvent, ProviderEventInput } from '../types.ts';

import type { GoogleCalendarListEntry, GoogleEvent } from './schemas.ts';
import { type GoogleEventDate, isAllDay } from './wire.ts';

/**
 * Google ⇄ internal translation. The only file that knows Google's vocabulary
 * for a thing our own model already has a word for.
 */

const STATUS_MAP: Record<string, EventStatus> = {
  confirmed: 'confirmed',
  tentative: 'tentative',
  cancelled: 'cancelled',
};

/** Google's palette is per-calendar; ours is a hex column. Fall back to our default. */
const DEFAULT_CALENDAR_COLOR = '#6E8BFF';

export function normaliseCalendar(entry: GoogleCalendarListEntry): {
  providerCalendarId: string;
  name: string;
  color: string | null;
  isPrimary: boolean;
  isReadOnly: boolean;
  timezone: string | null;
} {
  const color = normaliseHex(entry.backgroundColor);

  return {
    providerCalendarId: entry.id,
    name: entry.summaryOverride ?? entry.summary ?? 'Untitled calendar',
    color: color ?? DEFAULT_CALENDAR_COLOR,
    isPrimary: entry.primary === true,
    // `reader` and `freeBusyReader` can be imported but never written to.
    isReadOnly: entry.accessRole !== 'owner' && entry.accessRole !== 'writer',
    timezone: entry.timeZone ?? null,
  };
}

/**
 * One Google event as an internal event.
 *
 * `calendarTimeZone` is the calendar's default zone, used when an event omits
 * its own — which all-day events always do.
 */
export function normaliseEvent(event: GoogleEvent, calendarTimeZone: string): NormalisedEvent {
  const fallbackZone = safeTimeZone(calendarTimeZone);
  const start = event.start ?? null;
  const end = event.end ?? null;
  const allDay = isAllDay(start) || isAllDay(end);
  const timezone = safeTimeZone(start?.timeZone ?? end?.timeZone ?? fallbackZone);

  // A tombstone from an incremental sync carries an id, a status, and little
  // else — so every field below has to tolerate being absent.
  const deleted = event.status === 'cancelled' && !event.summary && !start;

  const startAt = resolveInstant(start, timezone);
  const endAt = resolveInstant(end, timezone);

  return {
    providerEventId: event.id,
    providerEtag: event.etag ?? null,
    providerUpdatedAt: event.updated ?? null,
    title: event.summary?.trim() || 'Untitled',
    description: event.description ?? null,
    location: event.location ?? null,
    // A tombstone has no times; the caller only reads the id in that case, but
    // the row still has to satisfy `end_at >= start_at`.
    startAt: startAt ?? new Date(0).toISOString(),
    endAt: endAt ?? startAt ?? new Date(0).toISOString(),
    allDay,
    timezone,
    status: STATUS_MAP[event.status ?? 'confirmed'] ?? 'confirmed',
    recurrenceRule: extractRRule(event.recurrence),
    alerts: normaliseReminders(event.reminders),
    recurringEventId: event.recurringEventId ?? null,
    deleted,
  };
}

/** Our event as a Google request body. */
export function toGoogleEvent(input: ProviderEventInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    summary: input.title,
    description: input.description ?? undefined,
    location: input.location ?? undefined,
    start: toGoogleDate(input.startAt, input.timezone, input.allDay),
    end: toGoogleDate(input.endAt, input.timezone, input.allDay),
  };

  if (input.status) body.status = input.status;

  // Google wants the RRULE as a line in an array, alongside any EXDATE/RDATE.
  body.recurrence = input.recurrenceRule ? [ensureRRulePrefix(input.recurrenceRule)] : null;

  // `useDefault: false` with an empty override list is how Google expresses
  // "no reminder"; omitting the block would silently keep the calendar default.
  body.reminders = {
    useDefault: false,
    overrides: input.alerts.map((minutes) => ({ method: 'popup', minutes })),
  };

  return body;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveInstant(value: GoogleEventDate | null, timeZone: string): string | null {
  if (!value) return null;
  if (value.dateTime) return new Date(value.dateTime).toISOString();
  if (value.date) return zonedDateToUtc(value.date, timeZone).toISOString();
  return null;
}

function toGoogleDate(iso: string, timeZone: string, allDay: boolean): Record<string, string> {
  if (!allDay) return { dateTime: new Date(iso).toISOString(), timeZone };

  // Google's all-day `end.date` is exclusive, and our `endAt` is already the
  // instant the day *after* the last day begins — so the calendar date read in
  // the event's own zone is the value Google wants, with no adjustment.
  return { date: toDateKey(iso, timeZone) };
}

function toDateKey(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
  // en-CA formats as YYYY-MM-DD, which is the shape Google expects.
  return parts;
}

/**
 * Our model holds one RRULE. Google may also return EXDATE/RDATE/EXRULE lines,
 * which we drop rather than misrepresent: keeping the RRULE and discarding the
 * exceptions would show occurrences the user has already deleted, so a series
 * with exception lines is stored as its RRULE and reconciled by the individual
 * exception events Google also sends.
 */
function extractRRule(recurrence: string[] | null | undefined): string | null {
  if (!recurrence?.length) return null;
  const line = recurrence.find((entry) => entry.toUpperCase().startsWith('RRULE:'));
  return line ? line.slice('RRULE:'.length) : null;
}

function ensureRRulePrefix(rule: string): string {
  return rule.toUpperCase().startsWith('RRULE:') ? rule : `RRULE:${rule}`;
}

/**
 * Popup reminders become our `alerts`. Email and SMS reminders are Google's to
 * deliver, not ours to duplicate, so they are ignored.
 */
function normaliseReminders(reminders: GoogleEvent['reminders']): number[] {
  const overrides = reminders?.overrides ?? [];
  const minutes = overrides
    .filter((entry) => entry.method === 'popup' && typeof entry.minutes === 'number')
    .map((entry) => entry.minutes as number)
    .filter((value) => value >= 0 && value <= 60 * 24 * 28);

  // The events column caps at five and the schema rejects duplicates downstream.
  return [...new Set(minutes)].sort((a, b) => a - b).slice(0, 5);
}

/** Google returns `#RRGGBB`; anything else we decline to guess at. */
function normaliseHex(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}
