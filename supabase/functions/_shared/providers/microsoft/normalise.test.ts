import { assertEquals, assertThrows } from 'jsr:@std/assert@^1.0.0';

import { EdgeError } from '../../errors/index.ts';

import { normaliseCalendar, normaliseEvent, toMicrosoftEvent } from './normalise.ts';
import { microsoftEventSchema } from './schemas.ts';
import type { MicrosoftEvent } from './schemas.ts';

const event = (overrides: Partial<MicrosoftEvent>): MicrosoftEvent => ({
  id: 'event-1',
  ...overrides,
});

Deno.test('normalises a timed event with a Windows timezone and Graph metadata', () => {
  const result = normaliseEvent(
    event({
      '@odata.etag': 'W/"etag-1"',
      changeKey: 'change-1',
      subject: 'Standup',
      bodyPreview: 'Daily check-in',
      location: { displayName: 'Room 1' },
      start: { dateTime: '2026-03-10T09:00:00.0000000', timeZone: 'Eastern Standard Time' },
      end: { dateTime: '2026-03-10T09:30:00.0000000', timeZone: 'Eastern Standard Time' },
      isAllDay: false,
      showAs: 'busy',
      lastModifiedDateTime: '2026-03-09T20:00:00Z',
    }),
  );

  assertEquals(result.providerEtag, 'W/"etag-1"');
  assertEquals(result.providerUpdatedAt, '2026-03-09T20:00:00.000Z');
  assertEquals(result.startAt, '2026-03-10T14:00:00.000Z');
  assertEquals(result.endAt, '2026-03-10T14:30:00.000Z');
  assertEquals(result.timezone, 'America/New_York');
  assertEquals(result.status, 'confirmed');
  assertEquals(result.description, 'Daily check-in');
  assertEquals(result.location, 'Room 1');
});

Deno.test('normalises all-day boundaries at local midnight', () => {
  const result = normaliseEvent(
    event({
      subject: 'Holiday',
      start: { dateTime: '2026-01-15T00:00:00.0000000', timeZone: 'Eastern Standard Time' },
      end: { dateTime: '2026-01-16T00:00:00.0000000', timeZone: 'Eastern Standard Time' },
      isAllDay: true,
    }),
  );

  assertEquals(result.allDay, true);
  assertEquals(result.startAt, '2026-01-15T05:00:00.000Z');
  assertEquals(result.endAt, '2026-01-16T05:00:00.000Z');
});

Deno.test('normalises Graph removed entries as deletions without inventing content', () => {
  const result = normaliseEvent(event({ '@removed': { reason: 'deleted' } }));

  assertEquals(result.deleted, true);
  assertEquals(result.status, 'cancelled');
  assertEquals(result.providerEventId, 'event-1');
  assertEquals(result.startAt, '1970-01-01T00:00:00.000Z');
});

Deno.test('keeps a removed recurring occurrence as a cancellation marker', () => {
  const result = normaliseEvent(
    event({
      '@removed': { reason: 'deleted' },
      seriesMasterId: 'master-1',
      originalStart: '2026-03-10T09:00:00.0000000',
      originalStartTimeZone: 'UTC',
      isAllDay: false,
    }),
  );

  assertEquals(result.deleted, false);
  assertEquals(result.status, 'cancelled');
  assertEquals(result.recurringEventId, 'master-1');
  assertEquals(result.startAt, '2026-03-10T09:00:00.000Z');
  assertEquals(result.recurrenceOriginalStartAt, '2026-03-10T09:00:00.000Z');
});

Deno.test('keeps cancelled content and recurring occurrence identity', () => {
  const cancelled = normaliseEvent(
    event({
      subject: 'Cancelled meeting',
      isCancelled: true,
      start: { dateTime: '2026-03-10T09:00:00Z', timeZone: 'UTC' },
      end: { dateTime: '2026-03-10T10:00:00Z', timeZone: 'UTC' },
    }),
  );
  const occurrence = normaliseEvent(
    event({
      subject: 'Weekly meeting',
      type: 'exception',
      seriesMasterId: 'master-1',
      originalStart: '2026-03-10T09:00:00.0000000',
      originalStartTimeZone: 'UTC',
      start: { dateTime: '2026-03-17T09:00:00Z', timeZone: 'UTC' },
      end: { dateTime: '2026-03-17T10:00:00Z', timeZone: 'UTC' },
      isCancelled: false,
    }),
  );

  assertEquals(cancelled.deleted, false);
  assertEquals(cancelled.status, 'cancelled');
  assertEquals(occurrence.recurringEventId, 'master-1');
  assertEquals(occurrence.recurrenceOriginalStartAt, '2026-03-10T09:00:00.000Z');
});

Deno.test('translates a recurring master and a single reminder', () => {
  const result = normaliseEvent(
    event({
      subject: 'Monthly review',
      start: { dateTime: '2026-03-10T14:00:00.0000000', timeZone: 'UTC' },
      end: { dateTime: '2026-03-10T15:00:00.0000000', timeZone: 'UTC' },
      type: 'seriesMaster',
      recurrence: {
        pattern: {
          type: 'relativeMonthly',
          interval: 1,
          daysOfWeek: ['tuesday'],
          index: 'second',
        },
        range: {
          type: 'noEnd',
          startDate: '2026-03-10',
          recurrenceTimeZone: 'Eastern Standard Time',
        },
      },
      isReminderOn: true,
      reminderMinutesBeforeStart: 30,
    }),
  );

  assertEquals(result.recurrenceRule, 'FREQ=MONTHLY;BYDAY=2TU');
  assertEquals(result.alerts, [30]);
  assertEquals(result.timezone, 'America/New_York');
  assertEquals(result.startAt, '2026-03-10T14:00:00.000Z');
});

Deno.test('rejects malformed live event payloads before normalization', () => {
  assertEquals(
    microsoftEventSchema.safeParse({ id: 'event-1', start: { dateTime: 2 } }).success,
    false,
  );
  assertThrows(() => normaliseEvent(event({ subject: 'Missing times' })), EdgeError);
});

Deno.test('prefers the full body over Graph bodyPreview', () => {
  const result = normaliseEvent(
    event({
      subject: 'Notes',
      bodyPreview: 'Truncated preview',
      body: { contentType: 'text', content: 'Complete notes' },
      start: { dateTime: '2026-03-10T09:00:00Z', timeZone: 'UTC' },
      end: { dateTime: '2026-03-10T10:00:00Z', timeZone: 'UTC' },
    }),
  );

  assertEquals(result.description, 'Complete notes');
});

Deno.test('normalises calendars and fails closed for unknown write access', () => {
  assertEquals(
    normaliseCalendar({
      id: 'calendar-1',
      name: 'Work',
      hexColor: '#123abc',
      isDefaultCalendar: true,
      canEdit: true,
      timeZone: 'Eastern Standard Time',
    }),
    {
      providerCalendarId: 'calendar-1',
      name: 'Work',
      color: '#123abc',
      isPrimary: true,
      isReadOnly: false,
      timezone: 'America/New_York',
    },
  );
  assertEquals(normaliseCalendar({ id: 'calendar-2', name: null, canEdit: null }).isReadOnly, true);
});

Deno.test('builds timed and all-day Graph write bodies', () => {
  assertEquals(
    toMicrosoftEvent({
      title: 'Timed',
      description: 'Notes',
      location: 'Room 1',
      startAt: '2026-03-10T14:00:00.123Z',
      endAt: '2026-03-10T14:30:00.123Z',
      allDay: false,
      timezone: 'America/New_York',
      recurrenceRule: null,
      alerts: [15],
    }),
    {
      subject: 'Timed',
      body: { contentType: 'text', content: 'Notes' },
      location: { displayName: 'Room 1' },
      start: { dateTime: '2026-03-10T09:00:00.1230000', timeZone: 'America/New_York' },
      end: { dateTime: '2026-03-10T09:30:00.1230000', timeZone: 'America/New_York' },
      isAllDay: false,
      isReminderOn: true,
      reminderMinutesBeforeStart: 15,
      recurrence: null,
    },
  );
  assertEquals(
    toMicrosoftEvent({
      title: 'Holiday',
      description: null,
      location: null,
      startAt: '2026-01-15T05:00:00.000Z',
      endAt: '2026-01-16T05:00:00.000Z',
      allDay: true,
      timezone: 'America/New_York',
      recurrenceRule: null,
      alerts: [],
    }).start,
    { dateTime: '2026-01-15T00:00:00.0000000', timeZone: 'America/New_York' },
  );
});

Deno.test('refuses more than one alert because Graph has one reminder field', () => {
  assertThrows(
    () =>
      toMicrosoftEvent({
        title: 'Too many alerts',
        description: null,
        location: null,
        startAt: '2026-03-10T14:00:00Z',
        endAt: '2026-03-10T15:00:00Z',
        allDay: false,
        timezone: 'UTC',
        recurrenceRule: null,
        alerts: [5, 15],
      }),
    EdgeError,
  );
});
