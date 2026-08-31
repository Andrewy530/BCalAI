import { layoutOverlappingEvents, MIN_VISUAL_MINUTES, minuteOfDay } from '@cal/domain';
import type { HourCycle } from '@cal/schemas';
import { Text, useTheme } from '@cal/ui';
import { useEffect, useRef } from 'react';
import { ScrollView, View } from 'react-native';

import type { EventOccurrence } from '../../hooks/useCalendarWindow';
import { EventChip } from '../EventChip';

export const HOUR_HEIGHT = 56;
const GUTTER_WIDTH = 52;

export interface DayTimelineProps {
  dateKey: string;
  /** Start of the local day, as an instant. */
  dayStart: Date;
  occurrences: readonly EventOccurrence[];
  timeZone: string;
  hourCycle: HourCycle;
  now: Date;
  onPressOccurrence: (occurrence: EventOccurrence) => void;
  /** Tapping empty space creates an event at that time. */
  onPressSlot?: (start: Date) => void;
}

/**
 * A single scrollable 24-hour column.
 *
 * Timed events are absolutely positioned against the hour grid; all-day events
 * sit in a fixed band above it, because giving them a slot on the timeline
 * would either misrepresent their length or swallow the whole column.
 */
export function DayTimeline({
  dayStart,
  occurrences,
  timeZone,
  hourCycle,
  now,
  onPressOccurrence,
  onPressSlot,
}: DayTimelineProps) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);

  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayStartMs + 24 * 3_600_000;

  const allDay = occurrences.filter((o) => o.event.allDay);
  const timed = occurrences.filter((o) => !o.event.allDay);

  const laidOut = layoutOverlappingEvents(timed, (occurrence) => ({
    start: occurrence.start,
    // Give very short events a floor so they stay readable and tappable.
    end: Math.max(occurrence.end, occurrence.start + MIN_VISUAL_MINUTES * 60_000),
  }));

  const isToday = now.getTime() >= dayStartMs && now.getTime() < dayEndMs;
  const nowOffset = isToday ? (minuteOfDay(now, timeZone) / 60) * HOUR_HEIGHT : null;

  // Open on the working day rather than at midnight.
  useEffect(() => {
    const target = nowOffset !== null ? nowOffset - HOUR_HEIGHT * 2 : HOUR_HEIGHT * 7;
    scrollRef.current?.scrollTo({ y: Math.max(0, target), animated: false });
  }, [nowOffset]);

  const formatHour = (hour: number) => {
    if (hourCycle === 'h23') return `${String(hour).padStart(2, '0')}:00`;
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
  };

  return (
    <View style={{ flex: 1 }}>
      {allDay.length > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            gap: theme.spacing.xs,
            paddingLeft: GUTTER_WIDTH,
            paddingRight: theme.spacing.lg,
            paddingBottom: theme.spacing.sm,
          }}
        >
          {allDay.map((occurrence) => (
            <View key={occurrence.key} style={{ flex: 1 }}>
              <EventChip
                occurrence={occurrence}
                timeZone={timeZone}
                hourCycle={hourCycle}
                compact
                onPress={() => onPressOccurrence(occurrence)}
              />
            </View>
          ))}
        </View>
      ) : null}

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}>
        <View style={{ height: 24 * HOUR_HEIGHT, paddingRight: theme.spacing.lg }}>
          {Array.from({ length: 24 }, (_, hour) => (
            <View
              key={hour}
              style={{
                position: 'absolute',
                top: hour * HOUR_HEIGHT,
                left: 0,
                right: 0,
                height: HOUR_HEIGHT,
                flexDirection: 'row',
              }}
            >
              <View
                style={{
                  width: GUTTER_WIDTH,
                  alignItems: 'flex-end',
                  paddingRight: theme.spacing.sm,
                }}
              >
                <Text variant="caption" color="tertiary" style={{ marginTop: -7 }}>
                  {formatHour(hour)}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.gridLine,
                }}
                onStartShouldSetResponder={() => !!onPressSlot}
                onResponderRelease={() => onPressSlot?.(new Date(dayStartMs + hour * 3_600_000))}
              />
            </View>
          ))}

          <View style={{ position: 'absolute', left: GUTTER_WIDTH, right: 0, top: 0, bottom: 0 }}>
            {laidOut.map((placed) => {
              const top = ((placed.interval.start - dayStartMs) / 3_600_000) * HOUR_HEIGHT;
              const height =
                ((placed.interval.end - placed.interval.start) / 3_600_000) * HOUR_HEIGHT;

              return (
                <EventChip
                  key={placed.item.key}
                  occurrence={placed.item}
                  timeZone={timeZone}
                  hourCycle={hourCycle}
                  compact={height < 34}
                  onPress={() => onPressOccurrence(placed.item)}
                  layout={{
                    top,
                    height: Math.max(height - 2, 18),
                    left: `${placed.left * 100}%`,
                    width: `${placed.width * 100 - 1}%`,
                  }}
                />
              );
            })}
          </View>

          {nowOffset !== null ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: nowOffset,
                left: GUTTER_WIDTH - 4,
                right: 0,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: theme.colors.nowIndicator,
                }}
              />
              <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.nowIndicator }} />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
