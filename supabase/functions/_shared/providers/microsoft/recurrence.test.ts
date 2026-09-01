import { assertEquals, assertThrows } from 'jsr:@std/assert@^1.0.0';

import { EdgeError } from '../../errors/index.ts';

import {
  graphRecurrenceToRRule,
  microsoftTimeZoneFor,
  rruleToGraphRecurrence,
} from './recurrence.ts';
import type { MicrosoftRecurrence } from './schemas.ts';

const start = '2026-03-10T14:00:00.000Z';

const recurrence = (overrides: Partial<MicrosoftRecurrence>): MicrosoftRecurrence => ({
  pattern: {
    type: 'daily',
    interval: 1,
  },
  range: {
    type: 'noEnd',
    startDate: '2026-03-10',
  },
  ...overrides,
});

Deno.test('translates daily Graph recurrence and interval', () => {
  assertEquals(
    graphRecurrenceToRRule(recurrence({ pattern: { type: 'daily', interval: 2 } })),
    'FREQ=DAILY;INTERVAL=2',
  );
});

Deno.test('translates a multi-day weekly recurrence and week start', () => {
  assertEquals(
    graphRecurrenceToRRule(
      recurrence({
        pattern: {
          type: 'weekly',
          interval: 1,
          daysOfWeek: ['monday', 'wednesday', 'friday'],
          firstDayOfWeek: 'sunday',
        },
      }),
    ),
    'FREQ=WEEKLY;BYDAY=MO,WE,FR;WKST=SU',
  );
});

Deno.test('translates absolute and relative monthly/yearly forms', () => {
  assertEquals(
    graphRecurrenceToRRule(
      recurrence({
        pattern: { type: 'absoluteMonthly', interval: 1, dayOfMonth: 15 },
        range: { type: 'endDate', startDate: '2026-03-10', endDate: '2026-12-31' },
      }),
    ),
    'FREQ=MONTHLY;BYMONTHDAY=15;UNTIL=20261231',
  );
  assertEquals(
    graphRecurrenceToRRule(
      recurrence({
        pattern: {
          type: 'relativeYearly',
          interval: 1,
          month: 11,
          daysOfWeek: ['thursday'],
          index: 'last',
        },
        range: { type: 'numbered', startDate: '2026-03-10', numberOfOccurrences: 3 },
      }),
    ),
    'FREQ=YEARLY;BYMONTH=11;BYDAY=-1TH;COUNT=3',
  );
});

Deno.test('rejects malformed Graph recurrence instead of dropping semantics', () => {
  assertThrows(
    () =>
      graphRecurrenceToRRule(
        recurrence({
          pattern: { type: 'relativeMonthly', interval: 1, daysOfWeek: ['monday', 'friday'] },
        }),
      ),
    EdgeError,
  );
});

Deno.test('rejects out-of-range Graph recurrence fields and reversed ranges', () => {
  for (const recurrenceValue of [
    recurrence({ pattern: { type: 'absoluteMonthly', interval: 1, dayOfMonth: 32 } }),
    recurrence({ pattern: { type: 'absoluteYearly', interval: 1, month: 13, dayOfMonth: 1 } }),
    recurrence({
      pattern: { type: 'daily', interval: 1 },
      range: { type: 'endDate', startDate: '2026-03-10', endDate: '2026-03-09' },
    }),
  ]) {
    assertThrows(() => graphRecurrenceToRRule(recurrenceValue), EdgeError);
  }
});

Deno.test('builds a weekly Graph recurrence from an RRULE', () => {
  assertEquals(
    rruleToGraphRecurrence({
      recurrenceRule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;WKST=SU',
      startAt: start,
      timezone: 'America/New_York',
    }),
    {
      pattern: {
        type: 'weekly',
        interval: 2,
        daysOfWeek: ['monday', 'wednesday'],
        firstDayOfWeek: 'sunday',
      },
      range: {
        type: 'noEnd',
        startDate: '2026-03-10',
        recurrenceTimeZone: 'America/New_York',
      },
    },
  );
});

Deno.test('builds finite absolute and relative recurrence ranges', () => {
  assertEquals(
    rruleToGraphRecurrence({
      recurrenceRule: 'FREQ=MONTHLY;BYMONTHDAY=15;COUNT=4',
      startAt: start,
      timezone: 'America/New_York',
    }),
    {
      pattern: { type: 'absoluteMonthly', interval: 1, dayOfMonth: 15 },
      range: {
        type: 'numbered',
        startDate: '2026-03-10',
        recurrenceTimeZone: 'America/New_York',
        numberOfOccurrences: 4,
      },
    },
  );
  assertEquals(
    rruleToGraphRecurrence({
      recurrenceRule: 'FREQ=YEARLY;BYMONTH=11;BYDAY=-1TH;UNTIL=20281231',
      startAt: start,
      timezone: 'America/New_York',
    }),
    {
      pattern: {
        type: 'relativeYearly',
        interval: 1,
        month: 11,
        daysOfWeek: ['thursday'],
        index: 'last',
      },
      range: {
        type: 'endDate',
        startDate: '2026-03-10',
        recurrenceTimeZone: 'America/New_York',
        endDate: '2028-12-31',
      },
    },
  );
});

Deno.test('uses the local date for all-day and timezone-aware recurrence anchors', () => {
  assertEquals(microsoftTimeZoneFor('Eastern Standard Time'), 'America/New_York');
  assertEquals(
    rruleToGraphRecurrence({
      recurrenceRule: 'FREQ=YEARLY',
      startAt: '2026-01-15T05:00:00.000Z',
      timezone: 'America/New_York',
    }),
    {
      pattern: { type: 'absoluteYearly', interval: 1, month: 1, dayOfMonth: 15 },
      range: {
        type: 'noEnd',
        startDate: '2026-01-15',
        recurrenceTimeZone: 'America/New_York',
      },
    },
  );
});

Deno.test('rejects RRULE constructs Graph cannot represent faithfully', () => {
  for (const recurrenceRule of [
    'FREQ=MONTHLY;BYMONTHDAY=1,15',
    'FREQ=MONTHLY;BYSETPOS=-1;BYDAY=FR',
    'FREQ=DAILY;UNTIL=20261231T120000Z',
    'FREQ=WEEKLY;BYDAY=1MO',
    'FREQ=DAILY;COUNT=2;UNTIL=20261231',
  ]) {
    const error = assertThrows(() =>
      rruleToGraphRecurrence({ recurrenceRule, startAt: start, timezone: 'UTC' }),
    );
    assertEquals((error as EdgeError).code, 'VALIDATION_FAILED');
  }
});
