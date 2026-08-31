import { bucketTasks, type TaskBuckets } from '@cal/domain';
import type { Task } from '@cal/schemas';
import { useMemo } from 'react';

import { useTaskLists, useTasks } from './useTasks';
import { useProfile, useUserTimeZone } from '../../settings/hooks/useProfile';

/**
 * `bucketTasks` splits work by urgency; the inbox additionally wants future
 * dated work separated from work with no date at all. That extra split is done
 * here rather than in the domain because it is a presentation choice — Today
 * deliberately does not make it.
 */
export interface InboxBuckets extends TaskBuckets {
  /** Has a due date beyond today. */
  upcoming: Task[];
  /** No due date at all. */
  someday: Task[];
}

export interface UseTaskBucketsResult {
  buckets: InboxBuckets;
  tasks: Task[];
  timeZone: string;
  hourCycle: 'h12' | 'h23';
  now: Date;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useTaskBuckets(options?: { listId?: string | null }): UseTaskBucketsResult {
  const tasksQuery = useTasks();
  const listsQuery = useTaskLists();
  const timeZone = useUserTimeZone();
  const { data: profile } = useProfile();

  // A single `now` for the whole render keeps every relative label consistent
  // — otherwise two rows can disagree about what "today" means mid-render.
  const now = useMemo(() => new Date(), [tasksQuery.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const all = tasksQuery.data ?? [];
    if (options?.listId === undefined) return all;
    return all.filter((task) => task.listId === options.listId);
  }, [tasksQuery.data, options?.listId]);

  const buckets = useMemo<InboxBuckets>(() => {
    const base = bucketTasks(filtered, now, timeZone);
    const upcoming = base.unscheduled.filter((task) => task.dueAt !== null);
    const someday = base.unscheduled.filter((task) => task.dueAt === null);
    return { ...base, upcoming, someday };
  }, [filtered, now, timeZone]);

  return {
    buckets,
    tasks: filtered,
    timeZone,
    hourCycle: profile?.hourCycle ?? 'h23',
    now,
    isLoading: tasksQuery.isLoading || listsQuery.isLoading,
    isError: tasksQuery.isError,
    refetch: () => void tasksQuery.refetch(),
  };
}
