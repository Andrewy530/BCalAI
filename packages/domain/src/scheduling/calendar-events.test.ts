import { describe, expect, it } from 'vitest';

import {
  expandSchedulingCalendarEvents,
  schedulingEventsToBusyIntervals,
  type SchedulingCalendarEvent,
} from './calendar-events';

interface TestEvent extends SchedulingCalendarEvent {
  id: string;
}

function event(overrides: Partial<TestEvent> = {}): TestEvent {
  return {
    id: 'event-1',
    calendarId: 'calendar-1',
    startAt: '2026-03-10T09:00:00.000Z',
    endAt: '2026-03-10T10:00:00.000Z',
    timezone: 'UTC',
    status: 'confirmed',
    recurrenceRule: null,
    sourceType: 'google',
    providerEventId: 'provider-event-1',
    recurringEventId: null,
    recurrenceOriginalStartAt: null,
    ...overrides,
  };
}

const window = {
  start: new Date('2026-03-09T00:00:00.000Z'),
  end: new Date('2026-03-25T00:00:00.000Z'),
};

describe('expandSchedulingCalendarEvents', () => {
  it('applies moved and cancelled provider exceptions before producing busy time', () => {
    const master = event({
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU',
      providerEventId: 'master-1',
    });
    const moved = event({
      id: 'event-2',
      recurringEventId: 'master-1',
      recurrenceOriginalStartAt: '2026-03-17T09:00:00.000Z',
      startAt: '2026-03-18T11:00:00.000Z',
      endAt: '2026-03-18T12:00:00.000Z',
    });
    const cancelled = event({
      id: 'event-3',
      status: 'cancelled',
      recurringEventId: 'master-1',
      recurrenceOriginalStartAt: '2026-03-24T09:00:00.000Z',
    });

    const expanded = expandSchedulingCalendarEvents([master, moved, cancelled], window);

    expect(expanded.map((item) => item.event.id)).toEqual(['event-1', 'event-2']);
    expect(expanded.map((item) => new Date(item.start).toISOString())).toEqual([
      '2026-03-10T09:00:00.000Z',
      '2026-03-18T11:00:00.000Z',
    ]);
  });

  it('uses Microsoft materialized occurrences without expanding the master twice', () => {
    const master = event({
      sourceType: 'microsoft',
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU',
      providerEventId: 'master-2',
    });
    const first = event({
      id: 'event-2',
      sourceType: 'microsoft',
      providerEventId: 'occurrence-1',
      recurringEventId: 'master-2',
      recurrenceOriginalStartAt: '2026-03-10T09:00:00.000Z',
    });
    const second = event({
      id: 'event-3',
      sourceType: 'microsoft',
      providerEventId: 'occurrence-2',
      recurringEventId: 'master-2',
      recurrenceOriginalStartAt: '2026-03-17T09:00:00.000Z',
      startAt: '2026-03-17T09:30:00.000Z',
      endAt: '2026-03-17T10:30:00.000Z',
    });

    const expanded = expandSchedulingCalendarEvents([master, first, second], {
      ...window,
      end: new Date('2026-03-20T00:00:00.000Z'),
    });

    expect(expanded.map((item) => item.event.providerEventId)).toEqual([
      'occurrence-1',
      'occurrence-2',
    ]);
  });

  it('fills gaps when Microsoft occurrence materialization is sparse', () => {
    const master = event({
      sourceType: 'microsoft',
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU',
      providerEventId: 'master-sparse',
    });
    const first = event({
      id: 'event-materialized',
      sourceType: 'microsoft',
      providerEventId: 'occurrence-1',
      recurringEventId: 'master-sparse',
      recurrenceOriginalStartAt: '2026-03-10T09:00:00.000Z',
    });

    const expanded = expandSchedulingCalendarEvents([master, first], window);

    expect(expanded.map((item) => new Date(item.start).toISOString())).toEqual([
      '2026-03-10T09:00:00.000Z',
      '2026-03-17T09:00:00.000Z',
      '2026-03-24T09:00:00.000Z',
    ]);
  });

  it('returns only overlapping, non-cancelled intervals to the availability engine', () => {
    const busy = schedulingEventsToBusyIntervals(
      [
        event(),
        event({
          id: 'event-2',
          status: 'cancelled',
          startAt: '2026-03-11T09:00:00.000Z',
          endAt: '2026-03-11T10:00:00.000Z',
        }),
        event({
          id: 'event-3',
          startAt: '2026-04-01T09:00:00.000Z',
          endAt: '2026-04-01T10:00:00.000Z',
        }),
      ],
      window,
    );

    expect(busy).toEqual([
      {
        start: new Date('2026-03-10T09:00:00.000Z').getTime(),
        end: new Date('2026-03-10T10:00:00.000Z').getTime(),
      },
    ]);
  });

  it('matches recurrence exceptions with realistic database/PostgREST timestamp formats', () => {
    const master = event({
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU',
      providerEventId: 'master-formats',
    });
    // PostgREST format with explicit +00:00 offset instead of .000Z
    const movedWithOffset = event({
      id: 'event-offset',
      recurringEventId: 'master-formats',
      recurrenceOriginalStartAt: '2026-03-17T09:00:00+00:00',
      startAt: '2026-03-18T11:00:00.000Z',
      endAt: '2026-03-18T12:00:00.000Z',
    });
    // Explicit non-UTC timezone offset (-04:00 EDT) pointing to the same UTC instant 09:00:00Z
    const cancelledWithTzOffset = event({
      id: 'event-tz-offset',
      status: 'cancelled',
      recurringEventId: 'master-formats',
      recurrenceOriginalStartAt: '2026-03-24T05:00:00-04:00',
    });

    const expanded = expandSchedulingCalendarEvents(
      [master, movedWithOffset, cancelledWithTzOffset],
      window,
    );

    expect(expanded.map((item) => item.event.id)).toEqual(['event-1', 'event-offset']);
    expect(expanded.map((item) => new Date(item.start).toISOString())).toEqual([
      '2026-03-10T09:00:00.000Z',
      '2026-03-18T11:00:00.000Z',
    ]);
  });

  it('includes a recurring exception moved into the scheduling window from outside the window', () => {
    const master = event({
      // Tuesday series: March 3 (outside window), March 10, March 17, March 24
      startAt: '2026-03-03T09:00:00.000Z',
      endAt: '2026-03-03T10:00:00.000Z',
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU',
      providerEventId: 'master-outside',
    });
    // The March 3 occurrence is outside the window (which starts March 9).
    // It was rescheduled into the window on Thursday March 12.
    const movedIntoWindow = event({
      id: 'event-moved-in',
      recurringEventId: 'master-outside',
      recurrenceOriginalStartAt: '2026-03-03T09:00:00.000Z',
      startAt: '2026-03-12T14:00:00.000Z',
      endAt: '2026-03-12T15:00:00.000Z',
    });

    const expanded = expandSchedulingCalendarEvents([master, movedIntoWindow], window);

    expect(expanded.map((item) => item.event.id)).toEqual([
      'event-1', // March 10
      'event-moved-in', // March 12 (moved from March 3)
      'event-1', // March 17
      'event-1', // March 24
    ]);
    expect(expanded.map((item) => new Date(item.start).toISOString())).toEqual([
      '2026-03-10T09:00:00.000Z',
      '2026-03-12T14:00:00.000Z',
      '2026-03-17T09:00:00.000Z',
      '2026-03-24T09:00:00.000Z',
    ]);
  });

  it('fails closed when persisted recurrence data is unsupported', () => {
    const malformedMaster = event({
      startAt: '2020-03-10T09:00:00.000Z',
      endAt: '2020-03-10T10:00:00.000Z',
      recurrenceRule: 'FREQ=WEEKLY;BYSETPOS=1;BYDAY=TU',
      providerEventId: 'unsupported-master',
    });

    expect(() => schedulingEventsToBusyIntervals([malformedMaster], window)).toThrow(
      'Unsupported calendar recurrence rule',
    );
  });
});
