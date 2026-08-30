import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { DEFAULT_REMINDER_PREFERENCES, type ReminderPreferences } from '@cal/domain';

import { logError } from '../logger';

export const REMINDER_PREFERENCES_KEY = 'reminder-preferences.v1';

/**
 * Reminder settings are device-local on purpose: notifications are scheduled
 * on this device, so "10 minutes before" on a phone and a future tablet are
 * legitimately different answers. Server-side push in a later sprint will need
 * its own account-level setting.
 */
export function useReminderPreferences() {
  const [preferences, setPreferences] = useState<ReminderPreferences>(
    DEFAULT_REMINDER_PREFERENCES,
  );
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(REMINDER_PREFERENCES_KEY);
        if (active && stored) {
          // Merge rather than replace, so a newly added preference gets its
          // default instead of arriving as undefined.
          setPreferences({ ...DEFAULT_REMINDER_PREFERENCES, ...JSON.parse(stored) });
        }
      } catch (error) {
        logError(error);
      } finally {
        if (active) setIsLoaded(true);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const update = useCallback(async (patch: Partial<ReminderPreferences>) => {
    setPreferences((previous) => {
      const next = { ...previous, ...patch };
      void AsyncStorage.setItem(REMINDER_PREFERENCES_KEY, JSON.stringify(next)).catch(logError);
      return next;
    });
  }, []);

  return { preferences, update, isLoaded };
}
