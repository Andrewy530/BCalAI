import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { logError } from '../../../lib/logger';
import type { ReminderPayload } from '../../../lib/notifications';
import { useSnoozeTask, useToggleTaskComplete } from '../../tasks/hooks/useTasks';

/**
 * Handles what happens when a reminder is tapped or one of its action buttons
 * is pressed. Kept separate from scheduling so the two can be reasoned about
 * independently.
 */
export function useNotificationResponse(): void {
  const toggleComplete = useToggleTaskComplete();
  const snooze = useSnoozeTask();

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      try {
        const payload = response.notification.request.content.data as
          Partial<ReminderPayload> | undefined;

        if (payload?.kind !== 'task' || typeof payload.taskId !== 'string') return;
        const taskId = payload.taskId;

        switch (response.actionIdentifier) {
          case 'complete':
            toggleComplete.mutate({ id: taskId, completed: true });
            return;

          case 'snooze':
            snooze.mutate({
              id: taskId,
              dueAt: new Date(Date.now() + 60 * 60_000),
              hasDueTime: true,
            });
            return;

          default:
            // A plain tap opens the task in the inbox.
            router.push({ pathname: '/(tabs)/tasks', params: { taskId } });
        }
      } catch (error) {
        logError(error);
      }
    });

    return () => subscription.remove();
  }, [toggleComplete, snooze]);
}
