import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useTaskEditorStore } from '../../../store/task-editor.store';

/**
 * Opens the task editor for a `taskId` route parameter, then clears it.
 *
 * Clearing matters: without it, navigating away and back — or any re-render
 * that re-reads the params — would pop the editor open again.
 */
export function useOpenTaskFromParam(taskId: string | undefined): void {
  const openTask = useTaskEditorStore((state) => state.openTask);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!taskId || handled.current === taskId) return;

    handled.current = taskId;
    openTask(taskId);
    router.setParams({ taskId: '' });
  }, [taskId, openTask]);
}
