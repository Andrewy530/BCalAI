import type { CalendarEvent } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import { expandCalendarEvents } from './expand-calendar-events';

const UUID_ONE = '11111111-1111-1111-1111-111111111111';
const UUID_TWO = '22222222-2222-2222-2222-222222222222';

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: UUID_ONE,
    userId: UUID_TWO,
    calendarId: UUID_ONE,
    title: 'Planning',
    description: null,
    location: null,
    startAt: '2026-03-10T09:00:00.000Z',
    endAt: '2026-03-10T10:00:00.000Z',
    allDay: false,
    timezone: 'UTC',
    status: 'confirmed',
    recurrenceRule: null,
    alerts: [],
    sourceType: 'google',
    providerEventId: 'provider-event-1',
    recurringEventId: null,
    recurrenceOriginalStartAt: null,
    providerEtag: null,
    providerUpdatedAt: null,
    syncStatus: 'synced',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

const window = {
  start: new Date('2026-03-09T00:00:00.000Z'),
  end: new Date('2026-03-25T00:00:00.000Z'),
};

describe('expandCalendarEvents', () => {
  it('applies moved and cancelled Google exceptions to a series master', () => {
    const master = event({
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU',
      providerEventId: 'master-1',
    });
    const moved = event({
      id: UUID_TWO,
      title: 'Moved planning',
      recurringEventId: 'master-1',
      recurrenceOriginalStartAt: '2026-03-17T09:00:00.000Z',
      startAt: '2026-03-18T11:00:00.000Z',
      endAt: '2026-03-18T12:00:00.000Z',
    });
    const cancelled = event({
      id: '33333333-3333-3333-3333-333333333333',
      status: 'cancelled',
      recurringEventId: 'master-1',
      recurrenceOriginalStartAt: '2026-03-24T09:00:00.000Z',
    });

    const expanded = expandCalendarEvents([master, moved, cancelled], window);

    expect(expanded.map((item) => item.event.id)).toEqual([UUID_ONE, UUID_TWO]);
    expect(expanded.map((item) => new Date(item.start).toISOString())).toEqual([
      '2026-03-10T09:00:00.000Z',
      '2026-03-18T11:00:00.000Z',
    ]);
  });

  it('renders Microsoft materialized occurrences without expanding the master again', () => {
    const master = event({
      sourceType: 'microsoft',
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU',
      providerEventId: 'master-2',
    });
    const first = event({
      id: '33333333-3333-3333-3333-333333333333',
      sourceType: 'microsoft',
      providerEventId: 'occurrence-1',
      recurringEventId: 'master-2',
      recurrenceOriginalStartAt: '2026-03-10T09:00:00.000Z',
    });
    const second = event({
      id: '44444444-4444-4444-4444-444444444444',
      sourceType: 'microsoft',
      providerEventId: 'occurrence-2',
      recurringEventId: 'master-2',
      recurrenceOriginalStartAt: '2026-03-17T09:00:00.000Z',
      startAt: '2026-03-17T09:30:00.000Z',
      endAt: '2026-03-17T10:30:00.000Z',
    });

    const expanded = expandCalendarEvents([master, first, second], {
      ...window,
      end: new Date('2026-03-20T00:00:00.000Z'),
    });

    expect(expanded).toHaveLength(2);
    expect(expanded.map((item) => item.event.providerEventId)).toEqual([
      'occurrence-1',
      'occurrence-2',
    ]);
  });

  it('scopes series ids to their local calendar when providers coexist', () => {
    const googleMaster = event({
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU',
      providerEventId: 'same-opaque-id',
    });
    const microsoftOccurrence = event({
      id: '55555555-5555-5555-5555-555555555555',
      calendarId: UUID_TWO,
      sourceType: 'microsoft',
      providerEventId: 'microsoft-occurrence',
      recurringEventId: 'same-opaque-id',
      recurrenceOriginalStartAt: '2026-03-17T09:00:00.000Z',
      startAt: '2026-03-17T10:00:00.000Z',
      endAt: '2026-03-17T11:00:00.000Z',
    });

    const expanded = expandCalendarEvents([googleMaster, microsoftOccurrence], window);

    expect(expanded).toHaveLength(4);
    expect(expanded.filter((item) => item.event.id === microsoftOccurrence.id)).toHaveLength(1);
  });
});
