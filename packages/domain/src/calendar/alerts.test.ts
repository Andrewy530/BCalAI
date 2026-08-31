import type { CalendarEvent } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import { eventAlertKey, parseEventAlertKey, planEventAlerts } from './alerts';

const NOW = new Date('2026-08-31T12:00:00Z');

function event(overrides: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return {
    userId: 'user-1',
    calendarId: 'cal-1',
    title: `Event ${overrides.id}`,
    description: null,
    location: null,
    startAt: '2026-08-31T18:00:00Z',
    endAt: '2026-08-31T19:00:00Z',
    allDay: false,
    timezone: 'America/New_York',
    status: 'confirmed',
    recurrenceRule: null,
    alerts: [],
    sourceType: 'internal',
    providerEventId: null,
    providerEtag: null,
    providerUpdatedAt: null,
    syncStatus: 'synced',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  } as CalendarEvent;
}

describe('planEventAlerts', () => {
  it('schedules one reminder per alert offset', () => {
    const planned = planEventAlerts([event({ id: 'a', alerts: [10, 60] })], { now: NOW });

    expect(planned.map((r) => r.fireAt.toISOString())).toEqual([
      '2026-08-31T17:00:00.000Z',
      '2026-08-31T17:50:00.000Z',
    ]);
  });

  it('ignores events with no alerts', () => {
    expect(planEventAlerts([event({ id: 'a' })], { now: NOW })).toHaveLength(0);
  });

  it('ignores cancelled events', () => {
    expect(
      planEventAlerts([event({ id: 'a', alerts: [10], status: 'cancelled' })], { now: NOW }),
    ).toHaveLength(0);
  });

  it('never schedules an alert whose moment has already passed', () => {
    // Starts in six hours, but the alert is a full day before.
    expect(planEventAlerts([event({ id: 'a', alerts: [1440] })], { now: NOW })).toHaveLength(0);
  });

  it('produces a distinct alert for each occurrence of a series', () => {
    const planned = planEventAlerts(
      [event({ id: 'standup', alerts: [10], recurrenceRule: 'FREQ=DAILY' })],
      { now: NOW, horizonDays: 3 },
    );

    expect(planned).toHaveLength(3);
    // Keys must differ per occurrence or the diff would treat them as one.
    expect(new Set(planned.map((r) => r.key)).size).toBe(3);
    expect(planned[0]?.key).toBe('event:standup:0:10');
  });

  it('stops at the horizon', () => {
    const near = planEventAlerts([event({ id: 'a', alerts: [10], recurrenceRule: 'FREQ=DAILY' })], {
      now: NOW,
      horizonDays: 5,
    });
    const far = planEventAlerts([event({ id: 'a', alerts: [10], recurrenceRule: 'FREQ=DAILY' })], {
      now: NOW,
      horizonDays: 30,
    });

    expect(near.length).toBeLessThan(far.length);
    expect(near).toHaveLength(5);
  });

  it('returns reminders soonest first', () => {
    const planned = planEventAlerts(
      [
        event({
          id: 'later',
          alerts: [10],
          startAt: '2026-09-05T18:00:00Z',
          endAt: '2026-09-05T19:00:00Z',
        }),
        event({ id: 'sooner', alerts: [10] }),
      ],
      { now: NOW },
    );

    expect(planned.map((r) => r.taskId)).toEqual(['sooner', 'later']);
  });

  it('phrases the lead time readably', () => {
    const bodies = planEventAlerts([event({ id: 'a', alerts: [0, 15, 60, 120] })], {
      now: NOW,
    }).map((r) => r.body);

    expect(bodies).toEqual(['In 2 hours', 'In 1 hour', 'In 15 minutes', 'Starting now']);
  });

  // Task keys are `task:<id>:<kind>`; event keys must never collide with them,
  // because a collision would silently cancel the wrong notification.
  it('namespaces keys away from task reminders', () => {
    const planned = planEventAlerts([event({ id: 'a', alerts: [10] })], { now: NOW });
    expect(planned[0]?.key.startsWith('event:')).toBe(true);
  });
});

describe('eventAlertKey', () => {
  it('round-trips through parseEventAlertKey', () => {
    expect(parseEventAlertKey(eventAlertKey('abc', 3, 15))).toEqual({
      eventId: 'abc',
      occurrenceIndex: 3,
      minutesBefore: 15,
    });
  });

  it('rejects keys that are not event alerts', () => {
    expect(parseEventAlertKey('task:abc:due')).toBeNull();
    expect(parseEventAlertKey('event:abc:x:15')).toBeNull();
    expect(parseEventAlertKey('nonsense')).toBeNull();
  });
});
