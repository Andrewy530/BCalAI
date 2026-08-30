import { useMemo } from 'react';
import { View } from 'react-native';

import {
  addZonedDays,
  formatDueDate,
  formatTimeOfDay,
  startOfZonedDay,
  zonedWallClockToUtc,
  getZonedParts,
} from '@cal/domain';
import type { HourCycle } from '@cal/schemas';
import { Chip, DatePickerField, Text, TimePickerField, useTheme } from '@cal/ui';

export interface DueDateValue {
  dueAt: Date | null;
  hasTime: boolean;
}

export interface DueDateFieldProps {
  value: DueDateValue;
  onChange: (value: DueDateValue) => void;
  timeZone: string;
  hourCycle: HourCycle;
  now?: Date;
}

/**
 * Setting a due date is two decisions, not one: *which day*, and *whether the
 * time matters*. Keeping them separate is what lets the rest of the app treat
 * "Friday" differently from "Friday at 5pm" — in overdue logic, in sorting,
 * and in which reminder gets scheduled.
 */
export function DueDateField({
  value,
  onChange,
  timeZone,
  hourCycle,
  now = new Date(),
}: DueDateFieldProps) {
  const theme = useTheme();

  const presets = useMemo(() => {
    const startOfToday = startOfZonedDay(now, timeZone);
    const atHour = (base: Date, hour: number) => {
      const parts = getZonedParts(base, timeZone);
      return zonedWallClockToUtc(
        { year: parts.year, month: parts.month, day: parts.day, hour, minute: 0 },
        timeZone,
      );
    };

    // A date-only preset lands at local noon: far enough from either midnight
    // that a later zone change cannot silently shift it to another day.
    return [
      { label: 'Today', date: atHour(startOfToday, 12) },
      { label: 'Tomorrow', date: atHour(addZonedDays(startOfToday, 1, timeZone), 12) },
      { label: 'Next week', date: atHour(addZonedDays(startOfToday, 7, timeZone), 12) },
    ];
  }, [now, timeZone]);

  const isSameDay = (a: Date, b: Date) =>
    getZonedParts(a, timeZone).day === getZonedParts(b, timeZone).day &&
    getZonedParts(a, timeZone).month === getZonedParts(b, timeZone).month;

  const handleDateChange = (next: Date | null) => {
    if (!next) return onChange({ dueAt: null, hasTime: false });

    // The picker reports a full instant; keep whatever time is already set.
    const parts = getZonedParts(next, timeZone);
    const existing = value.dueAt ? getZonedParts(value.dueAt, timeZone) : null;
    const merged = zonedWallClockToUtc(
      {
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: value.hasTime && existing ? existing.hour : 12,
        minute: value.hasTime && existing ? existing.minute : 0,
      },
      timeZone,
    );

    onChange({ dueAt: merged, hasTime: value.hasTime });
  };

  const handleTimeChange = (next: Date | null) => {
    if (!next) return onChange({ dueAt: value.dueAt, hasTime: false });
    if (!value.dueAt) return;

    const day = getZonedParts(value.dueAt, timeZone);
    const time = getZonedParts(next, timeZone);
    onChange({
      dueAt: zonedWallClockToUtc(
        { year: day.year, month: day.month, day: day.day, hour: time.hour, minute: time.minute },
        timeZone,
      ),
      hasTime: true,
    });
  };

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="subhead" color="secondary">
        Due
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {presets.map((preset) => (
          <Chip
            key={preset.label}
            label={preset.label}
            selected={!!value.dueAt && isSameDay(value.dueAt, preset.date)}
            onPress={() =>
              onChange({
                dueAt:
                  value.dueAt && isSameDay(value.dueAt, preset.date) ? null : preset.date,
                hasTime: false,
              })
            }
          />
        ))}
      </View>

      <DatePickerField
        value={value.dueAt}
        onChange={handleDateChange}
        placeholder="No due date"
        clearable
        format={(date) =>
          formatDueDate(date, { now, timeZone, hourCycle, hasTime: false }).text
        }
      />

      {value.dueAt ? (
        <TimePickerField
          value={value.hasTime ? value.dueAt : null}
          onChange={handleTimeChange}
          placeholder="Any time that day"
          clearable
          format={(date) => formatTimeOfDay(date, timeZone, hourCycle)}
        />
      ) : null}
    </View>
  );
}
