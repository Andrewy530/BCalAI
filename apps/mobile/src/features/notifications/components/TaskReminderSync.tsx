import { useEffect } from 'react';

import { logError } from '../../../lib/logger';
import {
  configureNotificationHandler,
  ensureAndroidChannel,
  registerReminderActions,
} from '../../../lib/notifications';
import { useNotificationResponse } from '../hooks/useNotificationResponse';
import { useTaskReminders } from '../hooks/useTaskReminders';

configureNotificationHandler();

/**
 * Renders nothing. Mounted once at the root so reminder scheduling and
 * notification taps are handled for the whole app regardless of which screen
 * happens to be on top.
 */
export function TaskReminderSync() {
  useEffect(() => {
    void ensureAndroidChannel().catch(logError);
    void registerReminderActions().catch(logError);
  }, []);

  useTaskReminders();
  useNotificationResponse();

  return null;
}
