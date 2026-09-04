import { bucketTasks, compareTasks } from '@cal/domain';
import { useMemo } from 'react';

import { useTaskLists, useTasks } from './useTasks';
import type { TaskWithTags } from '../api/tasks.api';

export type TaskFilter = 'inbox' | 'all' | 'completed';

export interface WebTaskBuckets {
  overdue: TaskWithTags[];
  dueToday: TaskWithTags[];
  scheduled: TaskWithTags[];
  unscheduled: TaskWithTags[];
  completedToday: TaskWithTags[];
  upcoming: TaskWithTags[];
  someday: TaskWithTags[];
  allCompleted: TaskWithTags[];
}

export interface UseTaskBucketsOptions {
  listId?: string | null;
  filter?: TaskFilter;
  timeZone?: string;
}

export interface UseTaskBucketsResult {
  buckets: WebTaskBuckets;
  tasks: TaskWithTags[];
  timeZone: string;
  now: Date;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useTaskBuckets(options?: UseTaskBucketsOptions): UseTaskBucketsResult {
  const tasksQuery = useTasks({ openOnly: false });
  const listsQuery = useTaskLists();

  const timeZone = options?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';

  // Stable "now" for consistent date calculations across renders
  const now = useMemo(() => new Date(), [tasksQuery.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const listFiltered = useMemo(() => {
    const all = tasksQuery.data ?? [];
    if (options?.listId === undefined || options?.listId === null) {
      return all;
    }
    return all.filter((task) => task.listId === options.listId);
  }, [tasksQuery.data, options?.listId]);

  const buckets = useMemo<WebTaskBuckets>(() => {
    const base = bucketTasks(listFiltered, now, timeZone);

    const upcoming = (base.unscheduled as TaskWithTags[]).filter((task) => task.dueAt !== null);
    const someday = (base.unscheduled as TaskWithTags[]).filter((task) => task.dueAt === null);
    const allCompleted = listFiltered
      .filter((task) => task.status === 'completed')
      .sort(compareTasks);

    return {
      overdue: base.overdue as TaskWithTags[],
      dueToday: base.dueToday as TaskWithTags[],
      scheduled: base.scheduled as TaskWithTags[],
      unscheduled: base.unscheduled as TaskWithTags[],
      completedToday: base.completedToday as TaskWithTags[],
      upcoming,
      someday,
      allCompleted,
    };
  }, [listFiltered, now, timeZone]);

  return {
    buckets,
    tasks: listFiltered,
    timeZone,
    now,
    isLoading: tasksQuery.isLoading || listsQuery.isLoading,
    isError: tasksQuery.isError,
    refetch: () => void tasksQuery.refetch(),
  };
}
