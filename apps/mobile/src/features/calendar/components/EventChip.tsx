import { Pressable, View } from 'react-native';

import { formatTimeOfDay } from '@cal/domain';
import type { HourCycle } from '@cal/schemas';
import { Text, useTheme } from '@cal/ui';

import type { EventOccurrence } from '../hooks/useCalendarWindow';

export interface EventChipProps {
  occurrence: EventOccurrence;
  timeZone: string;
  hourCycle: HourCycle;
  onPress: () => void;
  /** Absolute placement inside a timeline column. */
  layout?: { top: number; height: number; left: string; width: string };
  compact?: boolean;
}

/**
 * One event as drawn in a timeline. The calendar's colour is carried as a
 * leading bar plus a tinted surface rather than a solid fill, so several
 * overlapping events stay readable instead of becoming blocks of colour.
 */
export function EventChip({
  occurrence,
  timeZone,
  hourCycle,
  onPress,
  layout,
  compact = false,
}: EventChipProps) {
  const theme = useTheme();
  const color = occurrence.calendar?.color ?? theme.colors.accent;
  const cancelled = occurrence.event.status === 'cancelled';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${occurrence.event.title}, ${formatTimeOfDay(
        new Date(occurrence.start),
        timeZone,
        hourCycle,
      )}`}
      onPress={onPress}
      style={({ pressed }) => [
        layout
          ? {
              position: 'absolute',
              top: layout.top,
              height: layout.height,
              left: layout.left as unknown as number,
              width: layout.width as unknown as number,
            }
          : null,
        {
          flexDirection: 'row',
          gap: theme.spacing.sm,
          overflow: 'hidden',
          borderRadius: theme.radius.sm,
          backgroundColor: pressed ? theme.colors.surfacePressed : withAlpha(color, 0.16),
          paddingVertical: compact ? 2 : theme.spacing.xs,
          paddingRight: theme.spacing.sm,
          opacity: cancelled ? 0.5 : 1,
        },
      ]}
    >
      <View style={{ width: 3, alignSelf: 'stretch', backgroundColor: color }} />

      <View style={{ flex: 1, justifyContent: 'flex-start' }}>
        <Text
          variant={compact ? 'caption' : 'footnote'}
          numberOfLines={compact ? 1 : 2}
          style={{
            color: theme.colors.textPrimary,
            textDecorationLine: cancelled ? 'line-through' : 'none',
          }}
        >
          {occurrence.event.title}
        </Text>

        {!compact && !occurrence.event.allDay ? (
          <Text variant="caption" color="tertiary" numberOfLines={1}>
            {formatTimeOfDay(new Date(occurrence.start), timeZone, hourCycle)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Hex → rgba, so a calendar colour can tint a surface at low opacity. */
function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized;

  const red = parseInt(full.slice(0, 2), 16);
  const green = parseInt(full.slice(2, 4), 16);
  const blue = parseInt(full.slice(4, 6), 16);

  if (Number.isNaN(red) || Number.isNaN(green) || Number.isNaN(blue)) return hex;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
