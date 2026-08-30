import { Pressable, View } from 'react-native';

import { toZonedDateKey } from '@cal/domain';
import { Text, useTheme } from '@cal/ui';

import type { EventOccurrence } from '../../hooks/useCalendarWindow';

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MAX_DOTS = 4;

export interface MonthGridProps {
  /** 42 date keys: six whole weeks. */
  dateKeys: readonly string[];
  byDateKey: Map<string, EventOccurrence[]>;
  /** Month currently being viewed, 1-12, used to dim adjacent-month days. */
  focusedMonth: number;
  timeZone: string;
  now: Date;
  selectedDateKey: string;
  weekStartsOn: number;
  onSelectDate: (dateKey: string) => void;
}

/**
 * A six-week grid.
 *
 * Month view answers "how busy am I?", not "what exactly is on?" — so each day
 * shows coloured dots by calendar rather than event titles, and tapping a day
 * drops into the day view for the detail.
 */
export function MonthGrid({
  dateKeys,
  byDateKey,
  focusedMonth,
  timeZone,
  now,
  selectedDateKey,
  weekStartsOn,
  onSelectDate,
}: MonthGridProps) {
  const theme = useTheme();
  const todayKey = toZonedDateKey(now, timeZone);

  const weekdayHeaders = Array.from(
    { length: 7 },
    (_, index) => WEEKDAY_LETTERS[(weekStartsOn + index) % 7],
  );

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <View style={{ flexDirection: 'row' }}>
        {weekdayHeaders.map((letter, index) => (
          <View key={`${letter}-${index}`} style={{ flex: 1, alignItems: 'center' }}>
            <Text variant="caption" color="tertiary">
              {letter}
            </Text>
          </View>
        ))}
      </View>

      {Array.from({ length: 6 }, (_, week) => (
        <View key={week} style={{ flexDirection: 'row' }}>
          {dateKeys.slice(week * 7, week * 7 + 7).map((dateKey) => {
            const day = Number(dateKey.split('-')[2]);
            const month = Number(dateKey.split('-')[1]);
            const inFocusedMonth = month === focusedMonth;
            const isToday = dateKey === todayKey;
            const isSelected = dateKey === selectedDateKey;
            const dayEvents = byDateKey.get(dateKey) ?? [];

            // Distinct calendar colours, so five events on one calendar read as
            // one dot rather than a meaningless row of identical marks.
            const colors = [
              ...new Set(
                dayEvents.map((occurrence) => occurrence.calendar?.color ?? theme.colors.accent),
              ),
            ].slice(0, MAX_DOTS);

            return (
              <Pressable
                key={dateKey}
                accessibilityRole="button"
                accessibilityLabel={`${dateKey}, ${dayEvents.length} events`}
                accessibilityState={{ selected: isSelected }}
                onPress={() => onSelectDate(dateKey)}
                style={{
                  flex: 1,
                  aspectRatio: 0.9,
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  paddingTop: theme.spacing.xs,
                  gap: theme.spacing.xs,
                  borderRadius: theme.radius.sm,
                  backgroundColor: isSelected ? theme.colors.accentSubtle : 'transparent',
                }}
              >
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isToday ? theme.colors.accent : 'transparent',
                  }}
                >
                  <Text
                    variant="footnote"
                    style={{
                      color: isToday
                        ? theme.colors.onAccent
                        : inFocusedMonth
                          ? theme.colors.textPrimary
                          : theme.colors.textTertiary,
                    }}
                  >
                    {day}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 2, minHeight: 5 }}>
                  {colors.map((color, index) => (
                    <View
                      key={`${color}-${index}`}
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: color,
                        opacity: inFocusedMonth ? 1 : 0.4,
                      }}
                    />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
