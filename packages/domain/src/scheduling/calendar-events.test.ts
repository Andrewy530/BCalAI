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

    const expanded = expandSchedulingCalendarEvents([master, first, second], window);

    expect(expanded.map((item) => item.event.providerEventId)).toEqual([
      'occurrence-1',
      'occurrence-2',
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
});
