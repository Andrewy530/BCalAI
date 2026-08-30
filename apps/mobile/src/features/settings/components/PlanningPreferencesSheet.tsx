import { deviceTimeZone, getZonedParts } from '@cal/domain';
import type { HourCycle, Profile, WorkingHours } from '@cal/schemas';
import { BottomSheet, Button, Divider, ListRow, TimePickerField, Text, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';

import { useUpdateProfile } from '../hooks/useProfile';

export type PlanningPreference =
  'timezone' | 'weekStartsOn' | 'hourCycle' | 'workingHours' | 'defaultTaskMinutes';

export interface PlanningPreferencesSheetProps {
  visible: boolean;
  preference: PlanningPreference | null;
  profile: Profile | undefined;
  onClose: () => void;
}

const COMMON_TIME_ZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
] as const;

const TASK_DURATION_OPTIONS = [15, 30, 45, 60, 90, 120] as const;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const PREFERENCE_TITLES: Record<PlanningPreference, string> = {
  timezone: 'Time zone',
  weekStartsOn: 'Week starts on',
  hourCycle: 'Clock',
  workingHours: 'Working hours',
  defaultTaskMinutes: 'Default task duration',
};

/** Edits profile-backed planning preferences without putting form state in a store. */
export function PlanningPreferencesSheet({
  visible,
  preference,
  profile,
  onClose,
}: PlanningPreferencesSheetProps) {
  const updateProfile = useUpdateProfile();
  const [workingHours, setWorkingHours] = useState<WorkingHours>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && preference === 'workingHours' && profile) {
      setWorkingHours(profile.workingHours.map((window) => ({ ...window })));
      setError(null);
    }
  }, [preference, profile, visible]);

  const timeZones = useMemo(() => {
    const current = profile?.timezone;
    const preferred = [deviceTimeZone(), ...COMMON_TIME_ZONES];
    return [...new Set([current, ...preferred].filter((zone): zone is string => !!zone))];
  }, [profile?.timezone]);

  if (!preference || !profile) return null;

  const save = async (patch: Parameters<typeof updateProfile.mutateAsync>[0]) => {
    setError(null);
    try {
      await updateProfile.mutateAsync(patch);
      void Haptics.selectionAsync();
      onClose();
    } catch {
      setError('Could not save that preference. Please try again.');
    }
  };

  const updateWorkingHours = async () => {
    const normalized = [...workingHours].sort((a, b) => a.weekday - b.weekday);
    if (normalized.some((window) => window.endMinute <= window.startMinute)) {
      setError('Each working-hours window must end after it starts.');
      return;
    }
    await save({ workingHours: normalized });
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={PREFERENCE_TITLES[preference]}
      footer={
        preference === 'workingHours' ? (
          <Button
            label="Save working hours"
            loading={updateProfile.isPending}
            fullWidth
            onPress={() => void updateWorkingHours()}
          />
        ) : null
      }
    >
      {preference === 'timezone' ? (
        <OptionList
          options={timeZones.map((zone) => ({ label: zone, value: zone }))}
          value={profile.timezone}
          onSelect={(value) => void save({ timezone: value })}
          saving={updateProfile.isPending}
        />
      ) : preference === 'weekStartsOn' ? (
        <OptionList
          options={[
            { label: 'Sunday', value: 0 },
            { label: 'Monday', value: 1 },
          ]}
          value={profile.weekStartsOn}
          onSelect={(value) => void save({ weekStartsOn: value })}
          saving={updateProfile.isPending}
        />
      ) : preference === 'hourCycle' ? (
        <OptionList<HourCycle>
          options={[
            { label: '12-hour', value: 'h12' },
            { label: '24-hour', value: 'h23' },
          ]}
          value={profile.hourCycle}
          onSelect={(value) => void save({ hourCycle: value })}
          saving={updateProfile.isPending}
        />
      ) : preference === 'defaultTaskMinutes' ? (
        <OptionList
          options={TASK_DURATION_OPTIONS.map((minutes) => ({
            label: `${minutes} minutes`,
            value: minutes,
          }))}
          value={profile.defaultTaskMinutes}
          onSelect={(value) => void save({ defaultTaskMinutes: value })}
          saving={updateProfile.isPending}
        />
      ) : (
        <WorkingHoursEditor
          value={workingHours}
          hourCycle={profile.hourCycle}
          onChange={setWorkingHours}
        />
      )}

      {error ? (
        <Text variant="footnote" color="danger">
          {error}
        </Text>
      ) : null}

      {preference !== 'workingHours' ? (
        <Text variant="footnote" color="tertiary" align="center">
          Changes save automatically.
        </Text>
      ) : (
        <Text variant="footnote" color="tertiary">
          These hours guide the future Find Time scheduler. They do not change your calendar events.
        </Text>
      )}
    </BottomSheet>
  );
}

function OptionList<T extends string | number>({
  options,
  value,
  onSelect,
  saving,
}: {
  options: readonly { label: string; value: T }[];
  value: T;
  onSelect: (value: T) => void;
  saving: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.xs }}>
      {options.map((option, index) => (
        <View key={String(option.value)}>
          {index > 0 ? <Divider inset /> : null}
          <ListRow
            title={option.label}
            trailing={
              option.value === value ? (
                <Ionicons name="checkmark" size={20} color={theme.colors.accent} />
              ) : null
            }
            disabled={saving}
            onPress={() => onSelect(option.value)}
          />
        </View>
      ))}
    </View>
  );
}

function WorkingHoursEditor({
  value,
  hourCycle,
  onChange,
}: {
  value: WorkingHours;
  hourCycle: HourCycle;
  onChange: (value: WorkingHours) => void;
}) {
  const theme = useTheme();
  const byWeekday = new Map(value.map((window) => [window.weekday, window]));

  const setDayEnabled = (weekday: number, enabled: boolean) => {
    if (enabled) {
      if (byWeekday.has(weekday)) return;
      onChange(
        [
          ...value,
          {
            weekday: weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6,
            startMinute: 9 * 60,
            endMinute: 17 * 60,
          },
        ].sort((a, b) => a.weekday - b.weekday),
      );
    } else {
      onChange(value.filter((window) => window.weekday !== weekday));
    }
  };

  const setTime = (weekday: number, field: 'startMinute' | 'endMinute', date: Date | null) => {
    if (!date) return;
    const parts = getZonedParts(date, deviceTimeZone());
    const minute = parts.hour * 60 + parts.minute;
    onChange(
      value.map((window) =>
        window.weekday === weekday ? { ...window, [field]: minute } : window,
      ) as WorkingHours,
    );
  };

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={{ maxHeight: 470 }}
      contentContainerStyle={{ gap: theme.spacing.sm, paddingBottom: theme.spacing.sm }}
    >
      {WEEKDAYS.map((label, weekday) => {
        const window = byWeekday.get(weekday);
        return (
          <View key={label} style={{ gap: theme.spacing.sm }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text variant="bodyStrong">{label}</Text>
              <Switch
                value={!!window}
                onValueChange={(enabled) => setDayEnabled(weekday, enabled)}
                accessibilityLabel={`${label} working hours`}
                trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
              />
            </View>

            {window ? (
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <TimePickerField
                  value={dateForMinute(window.startMinute)}
                  onChange={(date) => setTime(weekday, 'startMinute', date)}
                  label="Starts"
                  style={{ flex: 1 }}
                  format={(date) => formatMinute(date, hourCycle)}
                />
                <TimePickerField
                  value={dateForMinute(window.endMinute)}
                  onChange={(date) => setTime(weekday, 'endMinute', date)}
                  label="Ends"
                  style={{ flex: 1 }}
                  format={(date) => formatMinute(date, hourCycle)}
                />
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

function dateForMinute(minutes: number): Date {
  const date = new Date();
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

function formatMinute(date: Date, hourCycle: HourCycle): string {
  const parts = getZonedParts(date, deviceTimeZone());
  const minute = String(parts.minute).padStart(2, '0');
  if (hourCycle === 'h23') return `${String(parts.hour).padStart(2, '0')}:${minute}`;
  const suffix = parts.hour < 12 ? 'AM' : 'PM';
  const hour = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  return `${hour}:${minute} ${suffix}`;
}
