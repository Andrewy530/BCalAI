import { addZonedDays, getZonedParts, zonedWallClockToUtc } from '@cal/domain';
import type { Task } from '@cal/schemas';
import { useCallback } from 'react';

import { useDeleteTask, useSnoozeTask, useToggleTaskComplete } from './useTasks';
import { useTaskEditorStore } from '../../../store/task-editor.store';
import { useUserTimeZone } from '../../settings/hooks/useProfile';

/**
 * The handful of actions every task list needs, bound once so the inbox and
 * Today cannot drift apart on what "snooze" means.
 */
export function useTaskActions() {
  const timeZone = useUserTimeZone();
  const toggleComplete = useToggleTaskComplete();
  const snooze = useSnoozeTask();
  const remove = useDeleteTask();
  const openTask = useTaskEditorStore((state) => state.openTask);

  const onToggleComplete = useCallback(
    (task: Task, completed: boolean) => toggleComplete.mutate({ id: task.id, completed }),
    [toggleComplete],
  );

  /**
   * Snoozing moves a task to tomorrow. A timed task keeps its time of day; a
   * date-only task stays date-only rather than acquiring a spurious time.
   */
  const onSnooze = useCallback(
    (task: Task) => {
      const base = task.dueAt ? new Date(task.dueAt) : new Date();
      const tomorrow = addZonedDays(base, 1, timeZone);
      const parts = getZonedParts(tomorrow, timeZone);
      const existing = task.dueAt ? getZonedParts(new Date(task.dueAt), timeZone) : null;

      const dueAt = zonedWallClockToUtc(
        {
          year: parts.year,
          month: parts.month,
          day: parts.day,
          hour: task.hasDueTime && existing ? existing.hour : 12,
          minute: task.hasDueTime && existing ? existing.minute : 0,
        },
        timeZone,
      );

      snooze.mutate({ id: task.id, dueAt, hasDueTime: task.hasDueTime });
    },
    [snooze, timeZone],
  );

  const onDelete = useCallback((task: Task) => remove.mutate(task.id), [remove]);

  const onOpenTask = useCallback((task: Task) => openTask(task.id), [openTask]);

  return { onToggleComplete, onSnooze, onDelete, onOpenTask };
}
