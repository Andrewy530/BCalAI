import { layoutOverlappingEvents, MIN_VISUAL_MINUTES, toZonedDateKey } from '@cal/domain';
import type { HourCycle } from '@cal/schemas';
import { Text, useTheme } from '@cal/ui';
import { ScrollView, View } from 'react-native';

import type { EventOccurrence } from '../../hooks/useCalendarWindow';
import { dateKeyToInstant } from '../../utils/window';
import { EventChip } from '../EventChip';

const HOUR_HEIGHT = 44;
const GUTTER_WIDTH = 44;

export interface WeekGridProps {
  dateKeys: readonly string[];
  byDateKey: Map<string, EventOccurrence[]>;
  timeZone: string;
  hourCycle: HourCycle;
  now: Date;
  selectedDateKey: string;
  onSelectDate: (dateKey: string) => void;
  onPressOccurrence: (occurrence: EventOccurrence) => void;
}

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Seven day columns sharing one hour gutter.
 *
 * Each column runs its own overlap layout: events only compete for width with
 * others on the same day, which is what keeps a busy Tuesday from squeezing a
 * quiet Wednesday.
 */
export function WeekGrid({
  dateKeys,
  byDateKey,
  timeZone,
  hourCycle,
  now,
  selectedDateKey,
  onSelectDate,
  onPressOccurrence,
}: WeekGridProps) {
  const theme = useTheme();
  const todayKey = toZonedDateKey(now, timeZone);

  const formatHour = (hour: number) =>
    hourCycle === 'h23'
      ? `${String(hour).padStart(2, '0')}`
      : hour === 0
        ? '12a'
        : hour === 12
          ? '12p'
          : hour < 12
            ? `${hour}a`
            : `${hour - 12}p`;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', paddingLeft: GUTTER_WIDTH }}>
        {dateKeys.map((dateKey) => {
          const day = Number(dateKey.split('-')[2]);
          const weekdayIndex = new Date(dateKeyToInstant(dateKey, timeZone)).getUTCDay();
          const isToday = dateKey === todayKey;
          const isSelected = dateKey === selectedDateKey;

          return (
            <View
              key={dateKey}
              style={{ flex: 1, alignItems: 'center', paddingVertical: theme.spacing.sm }}
              onStartShouldSetResponder={() => true}
              onResponderRelease={() => onSelectDate(dateKey)}
            >
              <Text variant="caption" color="tertiary">
                {WEEKDAY_LETTERS[weekdayIndex]}
              </Text>
              <View
                style={{
                  marginTop: 2,
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isToday
                    ? theme.colors.accent
                    : isSelected
                      ? theme.colors.accentSubtle
                      : 'transparent',
                }}
              >
                <Text
                  variant="footnote"
                  style={{
                    color: isToday
                      ? theme.colors.onAccent
                      : isSelected
                        ? theme.colors.accent
                        : theme.colors.textPrimary,
                  }}
                >
                  {day}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentOffset={{ x: 0, y: HOUR_HEIGHT * 7 }}>
        <View style={{ height: 24 * HOUR_HEIGHT, flexDirection: 'row' }}>
          <View style={{ width: GUTTER_WIDTH }}>
            {Array.from({ length: 24 }, (_, hour) => (
              <View
                key={hour}
                style={{
                  height: HOUR_HEIGHT,
                  alignItems: 'flex-end',
                  paddingRight: theme.spacing.xs,
                }}
              >
                <Text variant="caption" color="tertiary" style={{ marginTop: -6 }}>
                  {formatHour(hour)}
                </Text>
              </View>
            ))}
          </View>

          {dateKeys.map((dateKey) => {
            const dayStartMs = dateKeyToInstant(dateKey, timeZone).getTime();
            const timed = (byDateKey.get(dateKey) ?? []).filter((o) => !o.event.allDay);

            const laidOut = layoutOverlappingEvents(timed, (occurrence) => ({
              // Clamp to this day so a multi-day event lays out per column.
              start: Math.max(occurrence.start, dayStartMs),
              end: Math.max(
                Math.min(occurrence.end, dayStartMs + 86_400_000),
                Math.max(occurrence.start, dayStartMs) + MIN_VISUAL_MINUTES * 60_000,
              ),
            }));

            return (
              <View
                key={dateKey}
                style={{
                  flex: 1,
                  borderLeftWidth: 1,
                  borderLeftColor: theme.colors.gridLine,
                }}
              >
                {Array.from({ length: 24 }, (_, hour) => (
                  <View
                    key={hour}
                    style={{
                      height: HOUR_HEIGHT,
                      borderTopWidth: 1,
                      borderTopColor: theme.colors.gridLine,
                    }}
                  />
                ))}

                <View style={{ position: 'absolute', top: 0, left: 1, right: 1, bottom: 0 }}>
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
                        compact
                        onPress={() => onPressOccurrence(placed.item)}
                        layout={{
                          top,
                          height: Math.max(height - 1, 14),
                          left: `${placed.left * 100}%`,
                          width: `${placed.width * 100}%`,
                        }}
                      />
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
