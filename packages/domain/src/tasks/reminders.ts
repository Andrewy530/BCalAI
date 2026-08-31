import type { Task } from '@cal/schemas';

import { zonedWallClockToUtc, getZonedParts } from '../time/timezone';

/**
 * Deciding *when* a task reminder should fire.
 *
 * This is pure so it can be unit tested and reused: the mobile app feeds the
 * results to `expo-notifications`, and a future server-push path can feed the
 * same results to a scheduler without reimplementing the rules.
 */

export interface ReminderPreferences {
  /** Fire reminders for tasks that have a specific due time. */
  timedTasksEnabled: boolean;
  /** Minutes before the due time to fire. 0 = exactly at the due time. */
  minutesBefore: number;
  /** Fire a single morning reminder for tasks due that day with no set time. */
  allDayTasksEnabled: boolean;
  /** Local minute of day for that morning reminder. */
  allDayMinute: number;
}

export const DEFAULT_REMINDER_PREFERENCES: ReminderPreferences = {
  timedTasksEnabled: true,
  minutesBefore: 10,
  allDayTasksEnabled: true,
  allDayMinute: 9 * 60,
};

export interface PlannedReminder {
  taskId: string;
  /** Stable id so a reschedule replaces rather than duplicates a reminder. */
  key: string;
  fireAt: Date;
  title: string;
  body: string;
}

/** Notification identifiers are namespaced so we never cancel someone else's. */
export const reminderKey = (taskId: string, kind: 'due' | 'allday'): string =>
  `task:${taskId}:${kind}`;

export function parseReminderKey(key: string): { taskId: string; kind: string } | null {
  const parts = key.split(':');
  if (parts.length !== 3 || parts[0] !== 'task') return null;
  return { taskId: parts[1] ?? '', kind: parts[2] ?? '' };
}

/**
 * The reminder a single task should have, or null when it should have none.
 *
 * Returns at most one reminder per task: a second notification for the same
 * item is noise, and the Today screen already covers the daily overview.
 */
export function planReminderForTask(
  task: Task,
  options: { now: Date; timeZone: string; preferences: ReminderPreferences },
): PlannedReminder | null {
  const { now, timeZone, preferences } = options;

  if (!task.dueAt) return null;
  if (task.status === 'completed' || task.status === 'archived') return null;

  const dueAt = new Date(task.dueAt);

  if (task.hasDueTime) {
    if (!preferences.timedTasksEnabled) return null;

    const fireAt = new Date(dueAt.getTime() - preferences.minutesBefore * 60_000);
    // Never schedule into the past — the OS would either drop it or fire it
    // immediately, and an alert for something already overdue is just noise.
    if (fireAt.getTime() <= now.getTime()) return null;

    return {
      taskId: task.id,
      key: reminderKey(task.id, 'due'),
      fireAt,
      title: task.title,
      body:
        preferences.minutesBefore === 0 ? 'Due now' : `Due in ${preferences.minutesBefore} minutes`,
    };
  }

  if (!preferences.allDayTasksEnabled) return null;

  // Date-only task: remind on the morning of the due day, in the user's zone.
  const parts = getZonedParts(dueAt, timeZone);
  const fireAt = zonedWallClockToUtc(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: Math.floor(preferences.allDayMinute / 60),
      minute: preferences.allDayMinute % 60,
    },
    timeZone,
  );

  if (fireAt.getTime() <= now.getTime()) return null;

  return {
    taskId: task.id,
    key: reminderKey(task.id, 'allday'),
    fireAt,
    title: task.title,
    body: 'Due today',
  };
}

export function planReminders(
  tasks: readonly Task[],
  options: { now: Date; timeZone: string; preferences: ReminderPreferences },
): PlannedReminder[] {
  return tasks
    .map((task) => planReminderForTask(task, options))
    .filter((reminder): reminder is PlannedReminder => reminder !== null)
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}

export interface ReminderDiff {
  toSchedule: PlannedReminder[];
  /** Keys of already-scheduled notifications that are no longer wanted. */
  toCancel: string[];
}

/**
 * Reconcile what *should* be scheduled against what already is.
 *
 * iOS caps how many local notifications an app may have pending, and
 * re-scheduling everything on every change would burn through that budget and
 * cause visible flicker. Diffing keeps the OS-level work proportional to what
 * the user actually changed.
 */
export function diffReminders(
  planned: readonly PlannedReminder[],
  scheduled: ReadonlyMap<string, Date>,
): ReminderDiff {
  const toSchedule: PlannedReminder[] = [];
  const plannedKeys = new Set<string>();

  for (const reminder of planned) {
    plannedKeys.add(reminder.key);
    const existing = scheduled.get(reminder.key);
    // Compare to the second: sub-second drift is not a real change.
    if (!existing || Math.abs(existing.getTime() - reminder.fireAt.getTime()) >= 1000) {
      toSchedule.push(reminder);
    }
  }

  const toCancel = [...scheduled.keys()].filter((key) => !plannedKeys.has(key));

  return { toSchedule, toCancel };
}

/**
 * iOS allows 64 pending local notifications per app. Keep a margin for event
 * alerts, which Sprint 2 adds, and always keep the *soonest* reminders.
 */
export const MAX_PENDING_TASK_REMINDERS = 48;

export function capReminders(
  planned: readonly PlannedReminder[],
  limit = MAX_PENDING_TASK_REMINDERS,
): PlannedReminder[] {
  return [...planned].sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime()).slice(0, limit);
}
