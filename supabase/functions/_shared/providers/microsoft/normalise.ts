import { EdgeError } from '../../errors/index.ts';
import { safeTimeZone, zonedWallClockToUtc } from '../../time/zoned.ts';
import type { EventStatus, NormalisedEvent, ProviderEventInput } from '../types.ts';

import {
  graphRecurrenceToRRule,
  microsoftTimeZoneFor,
  rruleToGraphRecurrence,
} from './recurrence.ts';
import type { MicrosoftCalendar, MicrosoftEvent } from './schemas.ts';

const DEFAULT_CALENDAR_COLOR = '#6E8BFF';
const MAX_ALERT_MINUTES = 60 * 24 * 28;

export function normaliseCalendar(entry: MicrosoftCalendar): {
  providerCalendarId: string;
  name: string;
  color: string | null;
  isPrimary: boolean;
  isReadOnly: boolean;
  timezone: string | null;
} {
  let timezone: string | null = null;
  if (entry.timeZone) {
    try {
      timezone = microsoftTimeZoneFor(entry.timeZone);
    } catch {
      // Calendar metadata is optional. An event carrying its own zone can still
      // be imported; the event normaliser fails closed if that zone is unusable.
      timezone = null;
    }
  }

  return {
    providerCalendarId: entry.id,
    name: entry.name?.trim() || 'Untitled calendar',
    color: normaliseHex(entry.hexColor) ?? DEFAULT_CALENDAR_COLOR,
    isPrimary: entry.isDefaultCalendar === true,
    // Missing canEdit is treated as read-only: a false negative here would send
    // a provider write to a calendar whose permissions we never established.
    isReadOnly: entry.canEdit !== true,
    timezone,
  };
}

/** Translate one validated Graph event, including delta tombstones. */
export function normaliseEvent(event: MicrosoftEvent, calendarTimeZone = 'UTC'): NormalisedEvent {
  const recurrenceTimeZone = event.recurrence?.range.recurrenceTimeZone;
  const timezone = microsoftTimeZoneFor(
    recurrenceTimeZone ??
      event.originalStartTimeZone ??
      event.start?.timeZone ??
      event.end?.timeZone ??
      safeTimeZone(calendarTimeZone),
  );
  const removed = event['@removed'] !== null && event['@removed'] !== undefined;
  const recurringEventId = event.seriesMasterId ?? null;
  const recurrenceOriginalStartAt = resolveOriginalStart(event, timezone);
  const hasRecurrenceInstanceIdentity =
    recurringEventId !== null && recurrenceOriginalStartAt !== null;
  const deletionLike = removed || (event.isCancelled === true && !event.subject && !event.start);
  const deleted = deletionLike && !hasRecurrenceInstanceIdentity;

  if (deleted) {
    return {
      providerEventId: event.id,
      providerEtag: event['@odata.etag'] ?? event.changeKey ?? null,
      providerUpdatedAt: normaliseUpdatedAt(event.lastModifiedDateTime),
      title: 'Untitled',
      description: null,
      location: null,
      startAt: new Date(0).toISOString(),
      endAt: new Date(0).toISOString(),
      allDay: false,
      timezone,
      status: 'cancelled',
      recurrenceRule: null,
      alerts: [],
      recurringEventId,
      recurrenceOriginalStartAt,
      deleted: true,
    };
  }

  if (deletionLike && hasRecurrenceInstanceIdentity) {
    return {
      providerEventId: event.id,
      providerEtag: event['@odata.etag'] ?? event.changeKey ?? null,
      providerUpdatedAt: normaliseUpdatedAt(event.lastModifiedDateTime),
      title: event.subject?.trim() || 'Untitled',
      description: null,
      location: null,
      startAt: recurrenceOriginalStartAt,
      endAt: recurrenceOriginalStartAt,
      allDay: event.isAllDay === true,
      timezone,
      status: 'cancelled',
      recurrenceRule: null,
      alerts: [],
      recurringEventId,
      recurrenceOriginalStartAt,
      deleted: false,
    };
  }

  if (!event.start || !event.end) {
    throw new EdgeError('UNKNOWN', 'Microsoft returned an event without start or end.', 502);
  }

  const startAt = resolveGraphInstant(event.start.dateTime, event.start.timeZone ?? timezone);
  const endAt = resolveGraphInstant(event.end.dateTime, event.end.timeZone ?? timezone);
  if (endAt.getTime() < startAt.getTime()) {
    throw new EdgeError('UNKNOWN', 'Microsoft returned an event with invalid times.', 502);
  }

  return {
    providerEventId: event.id,
    // Immutable ids are requested by the client. ChangeKey is a useful fallback
    // for mocked/older responses that omit the OData etag.
    providerEtag: event['@odata.etag'] ?? event.changeKey ?? null,
    providerUpdatedAt: normaliseUpdatedAt(event.lastModifiedDateTime),
    title: event.subject?.trim() || 'Untitled',
    description: normaliseDescription(event),
    location: event.location?.displayName?.trim() || null,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    allDay: event.isAllDay === true,
    timezone,
    status: statusFor(event),
    recurrenceRule: graphRecurrenceToRRule(event.recurrence),
    alerts: normaliseReminder(event),
    recurringEventId,
    recurrenceOriginalStartAt: resolveOriginalStart(event, timezone),
    deleted: false,
  };
}

/** Build a Graph event body without leaking the app's RRULE vocabulary upward. */
export function toMicrosoftEvent(input: ProviderEventInput): Record<string, unknown> {
  if (input.alerts.length > 1) {
    throw new EdgeError(
      'VALIDATION_FAILED',
      'Microsoft supports one reminder per event; choose one alert.',
      400,
    );
  }
  if (input.status === 'cancelled') {
    throw new EdgeError('VALIDATION_FAILED', 'Cancelled events cannot be created or edited.', 400);
  }

  const timezone = ensureWriteTimeZone(input.timezone);
  const body: Record<string, unknown> = {
    subject: input.title,
    body: { contentType: 'text', content: input.description ?? '' },
    location: { displayName: input.location ?? '' },
    start: toGraphDateTime(input.startAt, timezone, input.allDay),
    end: toGraphDateTime(input.endAt, timezone, input.allDay),
    isAllDay: input.allDay,
    isReminderOn: input.alerts.length === 1,
    reminderMinutesBeforeStart: input.alerts[0] ?? 0,
    recurrence: rruleToGraphRecurrence({
      recurrenceRule: input.recurrenceRule,
      startAt: input.startAt,
      timezone,
    }),
  };

  if (input.status) body.showAs = input.status === 'tentative' ? 'tentative' : 'busy';
  return body;
}

function statusFor(event: MicrosoftEvent): EventStatus {
  if (event.isCancelled === true) return 'cancelled';
  return event.showAs === 'tentative' ? 'tentative' : 'confirmed';
}

function normaliseReminder(event: MicrosoftEvent): number[] {
  const minutes = event.reminderMinutesBeforeStart;
  if (event.isReminderOn === false || minutes === null || minutes === undefined) return [];
  return Number.isSafeInteger(minutes) && minutes >= 0 && minutes <= MAX_ALERT_MINUTES
    ? [minutes]
    : [];
}

function normaliseDescription(event: MicrosoftEvent): string | null {
  const content = event.body?.content;
  if (content) {
    if (event.body?.contentType?.toLowerCase() !== 'html') return content.trim() || null;

    // Graph HTML bodies are treated as text in the app model. This intentionally
    // does not attempt to render arbitrary provider markup in a native view.
    const text = decodeHtmlEntities(content.replace(/<[^>]*>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
    if (text) return text;
  }

  // bodyPreview is a useful fallback for responses that did not include body,
  // but it may be truncated and therefore must not win over the full body.
  return event.bodyPreview?.trim() || null;
}

function resolveGraphInstant(value: string, timeZone: string): Date {
  const normalized = value.trim().replace(/\s*T\s*/, 'T');
  const withOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  if (withOffset) {
    const parsed = new Date(normalized.replace(/\.(\d{3})\d+(?=Z|[+-]\d{2}:?\d{2}$)/, '.$1'));
    if (Number.isFinite(parsed.getTime())) return parsed;
  }

  const localMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?$/.exec(
    normalized,
  );
  if (!localMatch) {
    throw new EdgeError('UNKNOWN', 'Microsoft returned an invalid event time.', 502);
  }

  const year = Number(localMatch[1]);
  const month = Number(localMatch[2]);
  const day = Number(localMatch[3]);
  const hour = Number(localMatch[4]);
  const minute = Number(localMatch[5]);
  const second = Number(localMatch[6] ?? '0');
  const fraction = localMatch[7] ?? '';
  if (
    !validDateTime(year, month, day, hour, minute, second) ||
    !Number.isFinite(Number(`0.${fraction || '0'}`))
  ) {
    throw new EdgeError('UNKNOWN', 'Microsoft returned an invalid event time.', 502);
  }

  const milliseconds = Number((fraction + '000').slice(0, 3));
  const instant = zonedWallClockToUtc(
    { year, month, day, hour, minute },
    microsoftTimeZoneFor(timeZone),
  );
  instant.setUTCSeconds(second, milliseconds);
  return instant;
}

function toGraphDateTime(iso: string, timeZone: string, allDay: boolean): Record<string, string> {
  const parts = localPartsForInstant(iso, timeZone);
  if (allDay) {
    return {
      dateTime: `${parts.date}T00:00:00.0000000`,
      timeZone,
    };
  }
  return {
    dateTime: `${parts.date}T${parts.hour}:${parts.minute}:${parts.second}.${parts.millisecond}0000`,
    timeZone,
  };
}

function localPartsForInstant(
  iso: string,
  timeZone: string,
): { date: string; hour: string; minute: string; second: string; millisecond: string } {
  const instant = new Date(iso);
  if (!Number.isFinite(instant.getTime())) {
    throw new EdgeError('VALIDATION_FAILED', 'This event has an invalid time.', 400);
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const values: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }
  const date = `${values.year}-${values.month}-${values.day}`;
  return {
    date,
    hour: values.hour ?? '00',
    minute: values.minute ?? '00',
    second: values.second ?? '00',
    millisecond: String(instant.getUTCMilliseconds()).padStart(3, '0'),
  };
}

function ensureWriteTimeZone(candidate: string): string {
  try {
    return microsoftTimeZoneFor(candidate);
  } catch {
    throw new EdgeError('VALIDATION_FAILED', 'This event has an unsupported time zone.', 400);
  }
}

function normaliseUpdatedAt(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new EdgeError('UNKNOWN', 'Microsoft returned an invalid update time.', 502);
  }
  return date.toISOString();
}

function resolveOriginalStart(event: MicrosoftEvent, fallbackTimeZone: string): string | null {
  if (!event.originalStart) return null;
  const zone = event.originalStartTimeZone ?? fallbackTimeZone;
  return resolveGraphInstant(event.originalStart, zone).toISOString();
}

function validDateTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59
  );
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

function normaliseHex(value: string | null | undefined): string | null {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}
