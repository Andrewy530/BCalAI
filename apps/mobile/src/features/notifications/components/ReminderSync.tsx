import { useEffect } from 'react';

import { logError } from '../../../lib/logger';
import {
  configureNotificationHandler,
  ensureAndroidChannel,
  registerReminderActions,
} from '../../../lib/notifications';
import { useNotificationResponse } from '../hooks/useNotificationResponse';
import { useReminderSync } from '../hooks/useReminderSync';

configureNotificationHandler();

/**
 * Renders nothing. Mounted once at the root so reminder scheduling and
 * notification taps are handled for the whole app regardless of which screen
 * happens to be on top — covering both task reminders and event alerts.
 */
export function ReminderSync() {
  useEffect(() => {
    void ensureAndroidChannel().catch(logError);
    void registerReminderActions().catch(logError);
  }, []);

  useReminderSync();
  useNotificationResponse();

  return null;
}
