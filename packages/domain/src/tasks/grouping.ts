import type { Task } from '@cal/schemas';

import { toZonedDateKey } from '../time/timezone';

/**
 * How the Today screen and the task inbox slice a flat task list. Kept out of
 * the UI so the same rules can be reused by notifications, widgets, and the
 * scheduling engine without drifting.
 */
export interface TaskBuckets {
  overdue: Task[];
  dueToday: Task[];
  scheduled: Task[];
  unscheduled: Task[];
  completedToday: Task[];
}

const PRIORITY_WEIGHT: Record<Task['priority'], number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

/** Most urgent first, then soonest due, then newest. */
export function compareTasks(a: Task, b: Task): number {
  const priority = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
  if (priority !== 0) return priority;

  if (a.dueAt && b.dueAt) {
    const due = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    if (due !== 0) return due;
  } else if (a.dueAt !== b.dueAt) {
    return a.dueAt ? -1 : 1;
  }

  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

export function bucketTasks(
  tasks: readonly Task[],
  now: Date,
  timeZone: string,
): TaskBuckets {
  const todayKey = toZonedDateKey(now, timeZone);
  const buckets: TaskBuckets = {
    overdue: [],
    dueToday: [],
    scheduled: [],
    unscheduled: [],
    completedToday: [],
  };

  for (const task of tasks) {
    if (task.status === 'archived') continue;

    if (task.status === 'completed') {
      if (task.completedAt && toZonedDateKey(new Date(task.completedAt), timeZone) === todayKey) {
        buckets.completedToday.push(task);
      }
      continue;
    }

    if (task.dueAt) {
      const dueKey = toZonedDateKey(new Date(task.dueAt), timeZone);
      // A date-only task is not overdue until its day has passed; a task with a
      // real time becomes overdue the moment that time is behind us.
      const isOverdue =
        dueKey < todayKey || (task.hasDueTime && new Date(task.dueAt).getTime() < now.getTime());

      if (isOverdue) {
        buckets.overdue.push(task);
        continue;
      }
      if (dueKey === todayKey) {
        buckets.dueToday.push(task);
        continue;
      }
    }

    if (task.scheduledEventId) buckets.scheduled.push(task);
    else buckets.unscheduled.push(task);
  }

  for (const key of Object.keys(buckets) as (keyof TaskBuckets)[]) {
    buckets[key].sort(compareTasks);
  }

  return buckets;
}

/** Tasks the scheduling engine is allowed to place: flexible, sized, unplaced. */
export function schedulableTasks(tasks: readonly Task[]): Task[] {
  return tasks
    .filter(
      (task) =>
        task.isFlexible &&
        task.status === 'open' &&
        task.scheduledEventId === null &&
        task.estimatedMinutes !== null,
    )
    .sort(compareTasks);
}
