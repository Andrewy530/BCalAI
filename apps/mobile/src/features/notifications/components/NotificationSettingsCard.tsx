import { useCallback, useEffect, useState } from 'react';
import { Linking, Switch, View } from 'react-native';

import { formatDuration } from '@cal/domain';
import { Button, Card, Chip, Divider, Text, useTheme } from '@cal/ui';

import { logError } from '../../../lib/logger';
import {
  cancelAllReminders,
  getPermissionState,
  requestPermission,
  useReminderPreferences,
  type PermissionState,
} from '../../../lib/notifications';

const LEAD_TIME_OPTIONS = [0, 5, 10, 30, 60] as const;

/**
 * Notification preferences, and the only place the app asks for permission.
 *
 * Asking on first launch is the fastest route to a permanent "no", so the
 * prompt is attached to the user turning reminders on.
 */
export function NotificationSettingsCard() {
  const theme = useTheme();
  const { preferences, update } = useReminderPreferences();
  const [permission, setPermission] = useState<PermissionState>('undetermined');

  const refreshPermission = useCallback(() => {
    void getPermissionState().then(setPermission).catch(logError);
  }, []);

  useEffect(refreshPermission, [refreshPermission]);

  const handleEnable = async () => {
    const next = await requestPermission();
    setPermission(next);
    if (next === 'denied') void Linking.openSettings();
  };

  if (permission !== 'granted') {
    return (
      <Card title="Reminders">
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="callout" color="secondary">
            {permission === 'denied'
              ? 'Notifications are turned off for this app. Enable them in Settings to get reminders for what is due.'
              : 'Get a nudge when something is due, even when the app is closed.'}
          </Text>
          <Button
            label={permission === 'denied' ? 'Open Settings' : 'Turn on reminders'}
            onPress={() => void handleEnable()}
          />
        </View>
      </Card>
    );
  }

  return (
    <Card title="Reminders" padded={false}>
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <Row
          label="Tasks with a set time"
          hint="Fires shortly before the task is due."
          value={preferences.timedTasksEnabled}
          onChange={(timedTasksEnabled) => void update({ timedTasksEnabled })}
        />

        {preferences.timedTasksEnabled ? (
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="subhead" color="secondary">
              How far ahead
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              {LEAD_TIME_OPTIONS.map((minutes) => (
                <Chip
                  key={minutes}
                  label={minutes === 0 ? 'At the time' : formatDuration(minutes)}
                  selected={preferences.minutesBefore === minutes}
                  onPress={() => void update({ minutesBefore: minutes })}
                />
              ))}
            </View>
          </View>
        ) : null}

        <Divider />

        <Row
          label="Tasks due on a day"
          hint="One morning reminder for work with no set time."
          value={preferences.allDayTasksEnabled}
          onChange={(allDayTasksEnabled) => void update({ allDayTasksEnabled })}
        />

        <Button
          label="Clear all pending reminders"
          variant="ghost"
          onPress={() => void cancelAllReminders().catch(logError)}
        />
      </View>
    </Card>
  );
}

function Row({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body">{label}</Text>
        <Text variant="footnote" color="tertiary">
          {hint}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
      />
    </View>
  );
}
