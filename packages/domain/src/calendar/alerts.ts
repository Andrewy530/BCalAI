import type { CalendarEvent } from '@cal/schemas';

import type { PlannedReminder } from '../tasks/reminders';
import { expandOccurrences } from '../recurrence/expand';

/**
 * Turning event alerts into scheduled reminders.
 *
 * Event alerts and task reminders share the `PlannedReminder` shape on purpose:
 * they compete for the same capped OS notification queue, so they have to be
 * planned and reconciled in a single pass. Two independent reconciles would
 * each cancel the other's pending notifications.
 */

/** Namespaced so an event alert can never collide with a task reminder. */
export const eventAlertKey = (
  eventId: string,
  occurrenceIndex: number,
  minutesBefore: number,
): string => `event:${eventId}:${occurrenceIndex}:${minutesBefore}`;

export function parseEventAlertKey(
  key: string,
): { eventId: string; occurrenceIndex: number; minutesBefore: number } | null {
  const parts = key.split(':');
  if (parts.length !== 4 || parts[0] !== 'event') return null;

  const occurrenceIndex = Number(parts[2]);
  const minutesBefore = Number(parts[3]);
  if (!Number.isInteger(occurrenceIndex) || !Number.isInteger(minutesBefore)) return null;

  return { eventId: parts[1] ?? '', occurrenceIndex, minutesBefore };
}

function alertBody(minutesBefore: number): string {
  if (minutesBefore === 0) return 'Starting now';
  if (minutesBefore < 60) return `In ${minutesBefore} minutes`;
  if (minutesBefore === 60) return 'In 1 hour';
  if (minutesBefore < 1440) return `In ${Math.round(minutesBefore / 60)} hours`;
  return minutesBefore === 1440 ? 'Tomorrow' : `In ${Math.round(minutesBefore / 1440)} days`;
}

export interface EventAlertOptions {
  now: Date;
  /** How far ahead to schedule. Beyond this, the next reconcile picks it up. */
  horizonDays?: number;
}

/**
 * Alerts for every occurrence of every event inside the horizon.
 *
 * A recurring event carries its alert offsets on the master row, so each
 * expanded occurrence produces its own set — which is why the key includes the
 * occurrence index.
 */
export function planEventAlerts(
  events: readonly CalendarEvent[],
  options: EventAlertOptions,
): PlannedReminder[] {
  const { now, horizonDays = 30 } = options;
  const horizon = new Date(now.getTime() + horizonDays * 86_400_000);

  const planned: PlannedReminder[] = [];

  for (const event of events) {
    if (event.alerts.length === 0) continue;
    if (event.status === 'cancelled') continue;

    const occurrences = expandOccurrences(
      {
        start: new Date(event.startAt),
        end: new Date(event.endAt),
        timeZone: event.timezone,
        recurrenceRule: event.recurrenceRule,
      },
      { start: now, end: horizon },
    );

    for (const occurrence of occurrences) {
      for (const minutesBefore of event.alerts) {
        const fireAt = new Date(occurrence.start - minutesBefore * 60_000);
        // An alert whose moment has passed is noise, not a reminder.
        if (fireAt.getTime() <= now.getTime()) continue;

        planned.push({
          taskId: event.id,
          key: eventAlertKey(event.id, occurrence.index, minutesBefore),
          fireAt,
          title: event.title,
          body: alertBody(minutesBefore),
        });
      }
    }
  }

  return planned.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}
