import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { capReminders, diffReminders, planReminders } from '@cal/domain';

import {
  cancelReminder,
  getPermissionState,
  getScheduledReminders,
  scheduleReminder,
  useReminderPreferences,
} from '../../../lib/notifications';
import { logError } from '../../../lib/logger';
import { useAuth } from '../../auth';
import { useUserTimeZone } from '../../settings/hooks/useProfile';
import { useTasks } from '../../tasks/hooks/useTasks';

/**
 * Keeps the OS notification queue in step with the user's tasks.
 *
 * The reconcile is a diff, not a rebuild: iOS caps pending local notifications
 * at 64, and re-scheduling everything on every keystroke would churn through
 * that budget. Runs whenever the task list changes and again on foreground,
 * since time passes while the app is closed and past reminders fall away.
 */
export function useTaskReminders(): void {
  const { isAuthenticated } = useAuth();
  const timeZone = useUserTimeZone();
  const { preferences, isLoaded } = useReminderPreferences();
  // Reuses the collection the inbox already loads rather than issuing a second
  // fetch; `planReminders` skips completed and archived work on its own.
  const { data: tasks, dataUpdatedAt } = useTasks();

  // Serialises reconciles so an app-foreground and a refetch cannot interleave
  // and both decide to schedule the same reminder.
  const running = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !isLoaded || !tasks) return;

    let cancelled = false;

    const reconcile = async () => {
      if (running.current) return;
      running.current = true;

      try {
        if ((await getPermissionState()) !== 'granted') return;

        const planned = capReminders(
          planReminders(tasks, { now: new Date(), timeZone, preferences }),
        );
        const scheduled = await getScheduledReminders();
        const { toSchedule, toCancel } = diffReminders(planned, scheduled);

        if (cancelled) return;

        for (const key of toCancel) await cancelReminder(key);
        for (const reminder of toSchedule) await scheduleReminder(reminder);
      } catch (error) {
        logError(error);
      } finally {
        running.current = false;
      }
    };

    void reconcile();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reconcile();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [isAuthenticated, isLoaded, tasks, dataUpdatedAt, timeZone, preferences]);
}
