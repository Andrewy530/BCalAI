import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import { normaliseCalendar, normaliseEvent, toGoogleEvent } from './normalise.ts';
import type { GoogleCalendarListEntry, GoogleEvent } from './schemas.ts';

/**
 * Run with `deno test supabase/functions/`.
 *
 * These cover the translation decisions that are easy to get wrong and
 * expensive to notice: an all-day event is a pair of calendar dates with no
 * offset, so it lands on the wrong day whenever the zone is assumed; and an
 * incremental sync reports a deletion as a tombstone with almost no fields,
 * which every other code path has to tolerate.
 */

const event = (overrides: Partial<GoogleEvent>): GoogleEvent => ({
  id: 'evt-1',
  ...overrides,
});

Deno.test('a timed event keeps its instant regardless of the calendar zone', () => {
  const result = normaliseEvent(
    event({
      summary: 'Standup',
      start: { dateTime: '2026-03-10T09:00:00-05:00', timeZone: 'America/New_York' },
      end: { dateTime: '2026-03-10T09:30:00-05:00', timeZone: 'America/New_York' },
    }),
    'UTC',
  );

  assertEquals(result.startAt, '2026-03-10T14:00:00.000Z');
  assertEquals(result.endAt, '2026-03-10T14:30:00.000Z');
  assertEquals(result.allDay, false);
});

Deno.test('an all-day event starts at local midnight in the calendar zone', () => {
  const result = normaliseEvent(
    event({ summary: 'Holiday', start: { date: '2026-01-15' }, end: { date: '2026-01-16' } }),
    'America/New_York',
  );

  // Mid-January is EST, UTC-5.
  assertEquals(result.startAt, '2026-01-15T05:00:00.000Z');
  assertEquals(result.endAt, '2026-01-16T05:00:00.000Z');
  assertEquals(result.allDay, true);
  assertEquals(result.timezone, 'America/New_York');
});

Deno.test('an all-day event in a zone east of UTC starts before midnight UTC', () => {
  const result = normaliseEvent(
    event({ summary: 'Feiertag', start: { date: '2026-01-15' }, end: { date: '2026-01-16' } }),
    'Europe/Berlin',
  );

  assertEquals(result.startAt, '2026-01-14T23:00:00.000Z');
});

Deno.test('a tombstone is recognised even though it carries no times', () => {
  const result = normaliseEvent(event({ status: 'cancelled' }), 'UTC');

  assertEquals(result.deleted, true);
  assertEquals(result.providerEventId, 'evt-1');
  // The row still has to satisfy `end_at >= start_at`.
  assertEquals(result.endAt >= result.startAt, true);
});

Deno.test('a cancelled event that still has content is not a tombstone', () => {
  const result = normaliseEvent(
    event({
      status: 'cancelled',
      summary: 'Cancelled review',
      start: { dateTime: '2026-03-10T09:00:00Z' },
      end: { dateTime: '2026-03-10T10:00:00Z' },
    }),
    'UTC',
  );

  assertEquals(result.deleted, false);
  assertEquals(result.status, 'cancelled');
});

Deno.test('keeps the original start of a modified recurring instance', () => {
  const result = normaliseEvent(
    event({
      summary: 'Moved standup',
      recurringEventId: 'master-1',
      originalStartTime: { dateTime: '2026-03-10T09:00:00Z', timeZone: 'UTC' },
      start: { dateTime: '2026-03-11T11:00:00Z', timeZone: 'UTC' },
      end: { dateTime: '2026-03-11T12:00:00Z', timeZone: 'UTC' },
    }),
    'UTC',
  );

  assertEquals(result.recurringEventId, 'master-1');
  assertEquals(result.recurrenceOriginalStartAt, '2026-03-10T09:00:00.000Z');
});

Deno.test('keeps a cancelled recurring instance as a suppression marker', () => {
  const result = normaliseEvent(
    event({
      status: 'cancelled',
      recurringEventId: 'master-1',
      originalStartTime: { dateTime: '2026-03-10T09:00:00Z', timeZone: 'UTC' },
    }),
    'UTC',
  );

  assertEquals(result.deleted, false);
  assertEquals(result.status, 'cancelled');
  assertEquals(result.startAt, '2026-03-10T09:00:00.000Z');
  assertEquals(result.recurrenceOriginalStartAt, '2026-03-10T09:00:00.000Z');
});

Deno.test('only the RRULE line survives; EXDATE and RDATE are dropped', () => {
  const result = normaliseEvent(
    event({
      summary: 'Weekly',
      start: { dateTime: '2026-03-10T09:00:00Z' },
      end: { dateTime: '2026-03-10T10:00:00Z' },
      recurrence: ['EXDATE;TZID=UTC:20260317T090000', 'RRULE:FREQ=WEEKLY;BYDAY=TU'],
    }),
    'UTC',
  );

  assertEquals(result.recurrenceRule, 'FREQ=WEEKLY;BYDAY=TU');
});

Deno.test('only popup reminders become alerts, deduplicated and sorted', () => {
  const result = normaliseEvent(
    event({
      summary: 'Meeting',
      start: { dateTime: '2026-03-10T09:00:00Z' },
      end: { dateTime: '2026-03-10T10:00:00Z' },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 },
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 10 },
          { method: 'popup', minutes: 30 },
        ],
      },
    }),
    'UTC',
  );

  assertEquals(result.alerts, [10, 30]);
});

Deno.test('an untitled event gets a placeholder rather than failing the title check', () => {
  const result = normaliseEvent(
    event({
      start: { dateTime: '2026-03-10T09:00:00Z' },
      end: { dateTime: '2026-03-10T10:00:00Z' },
    }),
    'UTC',
  );

  assertEquals(result.title, 'Untitled');
});

Deno.test('an unusable time zone falls back to UTC instead of throwing', () => {
  const result = normaliseEvent(
    event({ summary: 'Odd', start: { date: '2026-01-15' }, end: { date: '2026-01-16' } }),
    'Not/A_Zone',
  );

  assertEquals(result.timezone, 'UTC');
  assertEquals(result.startAt, '2026-01-15T00:00:00.000Z');
});

// ---------------------------------------------------------------------------

const calendarEntry = (overrides: Partial<GoogleCalendarListEntry>): GoogleCalendarListEntry => ({
  id: 'cal-1',
  ...overrides,
});

Deno.test('reader access is imported but marked read-only', () => {
  assertEquals(normaliseCalendar(calendarEntry({ accessRole: 'reader' })).isReadOnly, true);
  assertEquals(normaliseCalendar(calendarEntry({ accessRole: 'freeBusyReader' })).isReadOnly, true);
  assertEquals(normaliseCalendar(calendarEntry({ accessRole: 'writer' })).isReadOnly, false);
  assertEquals(normaliseCalendar(calendarEntry({ accessRole: 'owner' })).isReadOnly, false);
});

Deno.test('a colour we cannot store falls back to the app palette', () => {
  assertEquals(normaliseCalendar(calendarEntry({ backgroundColor: 'blue' })).color, '#6E8BFF');
  assertEquals(normaliseCalendar(calendarEntry({ backgroundColor: '#123abc' })).color, '#123abc');
});

Deno.test('summaryOverride wins, because it is what the user renamed it to', () => {
  const result = normaliseCalendar(
    calendarEntry({ summary: 'work@example.com', summaryOverride: 'Work' }),
  );

  assertEquals(result.name, 'Work');
});

// ---------------------------------------------------------------------------

Deno.test('an all-day event goes back out as calendar dates, not instants', () => {
  const body = toGoogleEvent({
    title: 'Holiday',
    description: null,
    location: null,
    startAt: '2026-01-15T05:00:00.000Z',
    endAt: '2026-01-16T05:00:00.000Z',
    allDay: true,
    timezone: 'America/New_York',
    recurrenceRule: null,
    alerts: [],
  });

  assertEquals(body.start, { date: '2026-01-15' });
  assertEquals(body.end, { date: '2026-01-16' });
});

Deno.test('no alerts is expressed explicitly, not by omission', () => {
  const body = toGoogleEvent({
    title: 'Focus',
    description: null,
    location: null,
    startAt: '2026-03-10T09:00:00.000Z',
    endAt: '2026-03-10T10:00:00.000Z',
    allDay: false,
    timezone: 'UTC',
    recurrenceRule: null,
    alerts: [],
  });

  // Omitting the block would silently keep the calendar's default reminder.
  assertEquals(body.reminders, { useDefault: false, overrides: [] });
  assertEquals(body.recurrence, null);
});

Deno.test('a stored RRULE is re-prefixed for the wire', () => {
  const body = toGoogleEvent({
    title: 'Weekly',
    description: null,
    location: null,
    startAt: '2026-03-10T09:00:00.000Z',
    endAt: '2026-03-10T10:00:00.000Z',
    allDay: false,
    timezone: 'UTC',
    recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU',
    alerts: [10],
  });

  assertEquals(body.recurrence, ['RRULE:FREQ=WEEKLY;BYDAY=TU']);
  assertEquals(body.reminders, {
    useDefault: false,
    overrides: [{ method: 'popup', minutes: 10 }],
  });
});
