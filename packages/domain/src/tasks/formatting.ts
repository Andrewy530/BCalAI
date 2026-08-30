import type { HourCycle, Task, TaskPriority } from '@cal/schemas';

import { toZonedDateKey, getZonedParts, addZonedDays } from '../time/timezone';

/**
 * Human labels for task metadata.
 *
 * These live in the domain rather than in components because the same wording
 * has to appear in the inbox, on the Today screen, and inside notification
 * copy. One definition means those can never drift apart.
 */

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export type DueTone = 'overdue' | 'today' | 'soon' | 'later' | 'none';

export interface DueLabel {
  /** e.g. "Today, 14:30", "Tomorrow", "Fri 12 Sep", "2 days overdue". */
  text: string;
  tone: DueTone;
}

/** "14:30" or "2:30 PM", depending on the user's clock preference. */
export function formatTimeOfDay(instant: Date, timeZone: string, hourCycle: HourCycle): string {
  const { hour, minute } = getZonedParts(instant, timeZone);
  const paddedMinute = String(minute).padStart(2, '0');

  if (hourCycle === 'h23') return `${String(hour).padStart(2, '0')}:${paddedMinute}`;

  const suffix = hour < 12 ? 'AM' : 'PM';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${paddedMinute} ${suffix}`;
}

/**
 * Whole days between two local calendar days, ignoring the time of day.
 * Negative when `target` is in the past.
 */
export function calendarDaysBetween(from: Date, target: Date, timeZone: string): number {
  const fromKey = toZonedDateKey(from, timeZone);
  const targetKey = toZonedDateKey(target, timeZone);
  if (fromKey === targetKey) return 0;

  // Step a day at a time rather than dividing by 86.4e6, which is wrong across
  // a DST boundary. The search window is bounded so a far-future date short
  // circuits to a plain difference of the date keys.
  const direction = targetKey > fromKey ? 1 : -1;
  for (let days = 1; days <= 400; days += 1) {
    const stepped = addZonedDays(from, days * direction, timeZone);
    if (toZonedDateKey(stepped, timeZone) === targetKey) return days * direction;
  }

  return Math.round((target.getTime() - from.getTime()) / 86_400_000);
}

export function formatDueDate(
  dueAt: Date,
  options: { now: Date; timeZone: string; hourCycle: HourCycle; hasTime: boolean },
): DueLabel {
  const { now, timeZone, hourCycle, hasTime } = options;
  const days = calendarDaysBetween(now, dueAt, timeZone);
  const time = hasTime ? formatTimeOfDay(dueAt, timeZone, hourCycle) : null;

  // A timed task is overdue the moment its time passes; a date-only task is
  // not overdue until its whole day has gone by.
  const isOverdue = hasTime ? dueAt.getTime() < now.getTime() : days < 0;

  if (isOverdue) {
    if (days === 0 && time) return { text: `Today, ${time}`, tone: 'overdue' };
    if (days === -1) return { text: time ? `Yesterday, ${time}` : 'Yesterday', tone: 'overdue' };
    return { text: `${Math.abs(days)} days overdue`, tone: 'overdue' };
  }

  if (days === 0) return { text: time ? `Today, ${time}` : 'Today', tone: 'today' };
  if (days === 1) return { text: time ? `Tomorrow, ${time}` : 'Tomorrow', tone: 'soon' };

  const parts = getZonedParts(dueAt, timeZone);

  if (days > 1 && days < 7) {
    const weekday = WEEKDAY_NAMES[parts.weekday] ?? '';
    return { text: time ? `${weekday}, ${time}` : weekday, tone: 'soon' };
  }

  const month = MONTH_NAMES[parts.month - 1] ?? '';
  const date = `${parts.day} ${month}`;
  const withYear = parts.year === getZonedParts(now, timeZone).year ? date : `${date} ${parts.year}`;
  return { text: time ? `${withYear}, ${time}` : withYear, tone: 'later' };
}

/** Convenience wrapper that tolerates a task with no due date. */
export function describeTaskDue(
  task: Pick<Task, 'dueAt' | 'hasDueTime'>,
  options: { now: Date; timeZone: string; hourCycle: HourCycle },
): DueLabel {
  if (!task.dueAt) return { text: '', tone: 'none' };
  return formatDueDate(new Date(task.dueAt), { ...options, hasTime: task.hasDueTime });
}

/** "45m", "1h", "1h 30m", "2h". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

/** Priorities worth drawing attention to in a dense list. */
export const isNotablePriority = (priority: TaskPriority): boolean =>
  priority === 'high' || priority === 'urgent';

/** Durations offered as one-tap chips in the editor. */
export const DURATION_PRESETS = [15, 30, 45, 60, 90, 120] as const;
