import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from '../text/Text';
import { useTheme } from '../theme/ThemeProvider';

interface BaseProps {
  label?: string;
  /** Null renders the placeholder and the clear affordance stays hidden. */
  value: Date | null;
  onChange: (value: Date | null) => void;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  disabled?: boolean;
  /** Shows an inline clear button when a value is set. */
  clearable?: boolean;
  error?: string;
  style?: ViewStyle;
}

export interface DatePickerFieldProps extends BaseProps {
  /** How the chosen date is rendered in the trigger. */
  format: (value: Date) => string;
}

export type TimePickerFieldProps = DatePickerFieldProps;

/**
 * Shared trigger + native picker plumbing.
 *
 * The two platforms behave differently and the difference is contained here:
 * Android's picker is a one-shot dialog that reports `dismissed`, while iOS
 * renders inline and stays open until the user collapses it.
 */
function PickerField({
  mode,
  label,
  value,
  onChange,
  placeholder,
  format,
  minimumDate,
  maximumDate,
  disabled = false,
  clearable = false,
  error,
  style,
  icon,
}: DatePickerFieldProps & { mode: 'date' | 'time'; icon: 'calendar-outline' | 'time-outline' }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'dismissed') return;
    if (selected) onChange(selected);
  };

  return (
    <View style={[{ gap: theme.spacing.xs }, style]}>
      {label ? (
        <Text variant="subhead" color="secondary">
          {label}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? placeholder ?? mode}
        accessibilityValue={{ text: value ? format(value) : 'Not set' }}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen((previous) => !previous)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          minHeight: 48,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.md,
          borderWidth: error ? 1 : StyleSheet.hairlineWidth,
          borderColor: error ? theme.colors.danger : theme.colors.border,
          backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface,
          opacity: disabled ? 0.5 : 1,
        })}
      >
        <Ionicons name={icon} size={18} color={theme.colors.textSecondary} />

        <Text variant="body" color={value ? 'primary' : 'tertiary'} style={{ flex: 1 }}>
          {value ? format(value) : (placeholder ?? 'Not set')}
        </Text>

        {clearable && value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label ?? mode}`}
            hitSlop={12}
            onPress={() => {
              setOpen(false);
              onChange(null);
            }}
          >
            <Ionicons name="close-circle" size={18} color={theme.colors.textTertiary} />
          </Pressable>
        ) : null}
      </Pressable>

      {error ? (
        <Text variant="footnote" color="danger">
          {error}
        </Text>
      ) : null}

      {open ? (
        <DateTimePicker
          value={value ?? defaultFor(mode, minimumDate)}
          mode={mode}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          themeVariant={theme.scheme}
          onChange={handleChange}
        />
      ) : null}
    </View>
  );
}

/** Opening on a sensible value beats opening on 00:00 of the epoch. */
function defaultFor(mode: 'date' | 'time', minimumDate?: Date): Date {
  const now = new Date();
  if (minimumDate && minimumDate > now) return minimumDate;
  if (mode === 'time') {
    // Round up to the next quarter hour so the common case is one scroll away.
    const rounded = new Date(now);
    rounded.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
    return rounded;
  }
  return now;
}

export function DatePickerField(props: DatePickerFieldProps) {
  return <PickerField {...props} mode="date" icon="calendar-outline" />;
}

export function TimePickerField(props: TimePickerFieldProps) {
  return <PickerField {...props} mode="time" icon="time-outline" />;
}
