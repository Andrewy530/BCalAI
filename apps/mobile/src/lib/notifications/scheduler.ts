import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { PlannedReminder } from '@cal/domain';

import { logError } from '../logger';

/**
 * The thin platform layer over `expo-notifications`.
 *
 * It knows how to ask permission, schedule, cancel, and read back what is
 * pending. It deliberately contains *no* rules about when a reminder should
 * fire — that is `@cal/domain`'s job, so it stays unit-testable.
 */

export const TASK_REMINDER_CATEGORY = 'task-reminder';

/** Payload attached to every reminder so a tap can deep-link to the item. */
export interface ReminderPayload extends Record<string, unknown> {
  kind: 'task';
  taskId: string;
  reminderKey: string;
}

export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Android needs an explicit channel or notifications arrive silently with no
 * way for the user to change that.
 */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('reminders', {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function getPermissionState(): Promise<PermissionState> {
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return 'granted';
  return canAskAgain ? 'undetermined' : 'denied';
}

/**
 * Ask for permission. Call this from a deliberate user action — asking on
 * first launch is the fastest way to get a permanent "no".
 */
export async function requestPermission(): Promise<PermissionState> {
  const { status } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return status === 'granted' ? 'granted' : 'denied';
}

/** Everything this app currently has pending, keyed by our own reminder key. */
export async function getScheduledReminders(): Promise<Map<string, Date>> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const result = new Map<string, Date>();

  for (const request of scheduled) {
    const payload = request.content.data as Partial<ReminderPayload> | undefined;
    const key = payload?.reminderKey;
    if (typeof key !== 'string') continue;

    const fireAt = fireDateOf(request.trigger);
    if (fireAt) result.set(key, fireAt);
  }

  return result;
}

/**
 * Read the fire time back off a pending request. Only date triggers are used
 * for task reminders, so anything else is treated as unrecognised rather than
 * guessed at.
 */
function fireDateOf(trigger: Notifications.NotificationTrigger | null): Date | null {
  if (!trigger) return null;

  if ('type' in trigger && trigger.type === Notifications.SchedulableTriggerInputTypes.DATE) {
    const value = (trigger as { value?: number | Date }).value;
    if (typeof value === 'number') return new Date(value);
    if (value instanceof Date) return value;
  }

  return null;
}

export async function scheduleReminder(reminder: PlannedReminder): Promise<void> {
  // Cancelling first makes scheduling idempotent: re-running the sync can
  // never leave two notifications for the same task.
  await cancelReminder(reminder.key);

  const payload: ReminderPayload = {
    kind: 'task',
    taskId: reminder.taskId,
    reminderKey: reminder.key,
  };

  await Notifications.scheduleNotificationAsync({
    identifier: reminder.key,
    content: {
      title: reminder.title,
      body: reminder.body,
      data: payload,
      categoryIdentifier: TASK_REMINDER_CATEGORY,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminder.fireAt,
    },
  });
}

export async function cancelReminder(key: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(key);
  } catch (error) {
    // Cancelling something already gone is not a failure worth surfacing.
    logError(error);
  }
}

export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Register the actions shown on a long-pressed reminder. Doing this once at
 * startup means the buttons exist by the time the first reminder fires.
 */
export async function registerReminderActions(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(TASK_REMINDER_CATEGORY, [
    { identifier: 'complete', buttonTitle: 'Mark done', options: { opensAppToForeground: false } },
    { identifier: 'snooze', buttonTitle: 'Snooze 1 hour', options: { opensAppToForeground: false } },
  ]);
}
