import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { capReminders, diffReminders, planEventAlerts, planReminders } from '@cal/domain';

import {
  cancelReminder,
  getPermissionState,
  getScheduledReminders,
  scheduleReminder,
  useReminderPreferences,
} from '../../../lib/notifications';
import { logError } from '../../../lib/logger';
import { useAuth } from '../../auth';
import { useEventsInWindow } from '../../events/hooks/useEvents';
import { useUserTimeZone } from '../../settings/hooks/useProfile';
import { useTasks } from '../../tasks/hooks/useTasks';

/** How far ahead event alerts are scheduled. */
const HORIZON_DAYS = 30;

/**
 * Keeps the OS notification queue in step with tasks *and* event alerts.
 *
 * Both must be reconciled in one pass. The diff cancels any pending reminder
 * it did not plan, so two separate reconciles would each tear down the other's
 * notifications on every run.
 *
 * The reconcile is a diff rather than a rebuild: iOS caps pending local
 * notifications at 64, and re-scheduling everything on every change would
 * churn through that budget. It runs when either collection changes, and again
 * on foreground — time passes while the app is closed and past alerts fall away.
 */
export function useReminderSync(): void {
  const { isAuthenticated } = useAuth();
  const timeZone = useUserTimeZone();
  const { preferences, isLoaded } = useReminderPreferences();

  // Reuses the collections the inbox and calendar already load rather than
  // issuing extra fetches.
  const { data: tasks, dataUpdatedAt: tasksUpdatedAt } = useTasks();

  const horizonStart = useRef(new Date()).current;
  const horizonEnd = useRef(new Date(horizonStart.getTime() + HORIZON_DAYS * 86_400_000)).current;
  const { data: events, dataUpdatedAt: eventsUpdatedAt } = useEventsInWindow(
    horizonStart,
    horizonEnd,
  );

  // Serialises reconciles so a foreground event and a refetch cannot interleave
  // and both decide to schedule the same reminder.
  const running = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !isLoaded) return;
    if (!tasks && !events) return;

    let cancelled = false;

    const reconcile = async () => {
      if (running.current) return;
      running.current = true;

      try {
        if ((await getPermissionState()) !== 'granted') return;

        const now = new Date();
        const planned = capReminders([
          ...planReminders(tasks ?? [], { now, timeZone, preferences }),
          ...planEventAlerts(events ?? [], { now, horizonDays: HORIZON_DAYS }),
        ]);

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
  }, [
    isAuthenticated,
    isLoaded,
    tasks,
    tasksUpdatedAt,
    events,
    eventsUpdatedAt,
    timeZone,
    preferences,
  ]);
}
