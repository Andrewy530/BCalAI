import { formatTimeOfDay, toZonedDateKey } from '@cal/domain';
import type { HourCycle } from '@cal/schemas';
import { Card, Divider, EmptyState, ListRow, Text, useTheme } from '@cal/ui';
import { Fragment } from 'react';
import { View } from 'react-native';

import type { EventOccurrence } from '../../hooks/useCalendarWindow';
import { dateKeyToInstant } from '../../utils/window';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export interface AgendaListProps {
  dateKeys: readonly string[];
  byDateKey: Map<string, EventOccurrence[]>;
  timeZone: string;
  hourCycle: HourCycle;
  now: Date;
  onPressOccurrence: (occurrence: EventOccurrence) => void;
}

/**
 * A chronological list that skips empty days.
 *
 * This is the view that scales to a sparse calendar: rather than scrolling
 * through blank grids, the user sees only days that have something on them.
 */
export function AgendaList({
  dateKeys,
  byDateKey,
  timeZone,
  hourCycle,
  now,
  onPressOccurrence,
}: AgendaListProps) {
  const theme = useTheme();
  const todayKey = toZonedDateKey(now, timeZone);

  const populated = dateKeys.filter((dateKey) => (byDateKey.get(dateKey) ?? []).length > 0);

  if (populated.length === 0) {
    return (
      <Card padded={false}>
        <EmptyState
          icon="calendar-outline"
          title="Nothing in the next four weeks"
          message="Events you add will appear here in order."
        />
      </Card>
    );
  }

  return (
    <View style={{ gap: theme.spacing.xl }}>
      {populated.map((dateKey) => {
        const instant = dateKeyToInstant(dateKey, timeZone);
        const date = new Date(instant);
        const isToday = dateKey === todayKey;
        const occurrences = byDateKey.get(dateKey) ?? [];

        return (
          <View key={dateKey} style={{ gap: theme.spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm }}>
              <Text variant="title3" color={isToday ? 'accent' : 'primary'}>
                {isToday ? 'Today' : WEEKDAYS[date.getUTCDay()]}
              </Text>
              <Text variant="footnote" color="tertiary">
                {date.getUTCDate()} {MONTHS[date.getUTCMonth()]}
              </Text>
            </View>

            <Card padded={false}>
              {occurrences.map((occurrence, index) => (
                <Fragment key={occurrence.key}>
                  {index > 0 ? <Divider inset /> : null}
                  <ListRow
                    title={occurrence.event.title}
                    subtitle={occurrence.event.location ?? undefined}
                    meta={
                      occurrence.event.allDay
                        ? 'All day'
                        : formatTimeOfDay(new Date(occurrence.start), timeZone, hourCycle)
                    }
                    accentColor={occurrence.calendar?.color}
                    onPress={() => onPressOccurrence(occurrence)}
                  />
                </Fragment>
              ))}
            </Card>
          </View>
        );
      })}
    </View>
  );
}
