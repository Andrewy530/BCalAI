import { addZonedDays, toZonedDateKey } from '@cal/domain';
import { ErrorState, IconButton, LoadingState, SegmentedControl, Text, useTheme } from '@cal/ui';
import { ScrollView, View } from 'react-native';

import { type CalendarViewMode, useCalendarViewStore } from '../../../store/calendar-view.store';
import { useEventEditorStore } from '../../../store/event-editor.store';
import { AgendaList } from '../components/agenda-view/AgendaList';
import { DayTimeline } from '../components/day-view/DayTimeline';
import { MonthGrid } from '../components/month-view/MonthGrid';
import { WeekGrid } from '../components/week-view/WeekGrid';
import { useCalendarWindow } from '../hooks/useCalendarWindow';
import { dateKeyToInstant } from '../utils/window';

const MODES: { value: CalendarViewMode; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'agenda', label: 'Agenda' },
];

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

/**
 * Composes the four calendar views over one shared data window.
 *
 * Per the repository's screen rule this file only reads store state, calls the
 * feature hook, and picks a view — the expansion, layout, and formatting all
 * live below it.
 */
export function CalendarScreen() {
  const theme = useTheme();
  const mode = useCalendarViewStore((state) => state.mode);
  const setMode = useCalendarViewStore((state) => state.setMode);
  const selectedDateKey = useCalendarViewStore((state) => state.selectedDateKey);
  const setSelectedDateKey = useCalendarViewStore((state) => state.setSelectedDateKey);

  const openEvent = useEventEditorStore((state) => state.openEvent);
  const openNewEvent = useEventEditorStore((state) => state.openNew);

  const { window, byDateKey, timeZone, hourCycle, weekStartsOn, isLoading, isError, refetch } =
    useCalendarWindow();

  const now = new Date();
  const anchor = dateKeyToInstant(selectedDateKey, timeZone);
  const [year, month] = selectedDateKey.split('-').map(Number);

  /** Step by one view's worth: a day, a week, or a month. */
  const shift = (direction: 1 | -1) => {
    const days = mode === 'day' ? 1 : mode === 'week' ? 7 : mode === 'agenda' ? 28 : 0;

    if (days > 0) {
      setSelectedDateKey(
        toZonedDateKey(addZonedDays(anchor, days * direction, timeZone), timeZone),
      );
      return;
    }

    // Month view steps whole months, clamped so 31 Jan → 28 Feb rather than March.
    const absolute = (year ?? 1970) * 12 + ((month ?? 1) - 1) + direction;
    const nextYear = Math.floor(absolute / 12);
    const nextMonth = (absolute % 12) + 1;
    const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
    const day = Math.min(Number(selectedDateKey.split('-')[2]), lastDay);

    setSelectedDateKey(
      `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    );
  };

  const goToToday = () => setSelectedDateKey(toZonedDateKey(now, timeZone));

  const heading =
    mode === 'day'
      ? `${MONTHS[(month ?? 1) - 1]} ${Number(selectedDateKey.split('-')[2])}`
      : `${MONTHS[(month ?? 1) - 1]} ${year}`;

  return (
    <View style={{ flex: 1, gap: theme.spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Text variant="title1">{heading}</Text>
        </View>

        <IconButton name="chevron-back" accessibilityLabel="Previous" onPress={() => shift(-1)} />
        <IconButton name="today-outline" accessibilityLabel="Go to today" onPress={goToToday} />
        <IconButton name="chevron-forward" accessibilityLabel="Next" onPress={() => shift(1)} />
        <IconButton
          name="add"
          tone="accent"
          filled
          accessibilityLabel="New event"
          onPress={() => openNewEvent(anchor)}
        />
      </View>

      <SegmentedControl options={MODES} value={mode} onChange={setMode} />

      {isLoading ? (
        <LoadingState label="Loading your calendar" />
      ) : isError ? (
        <ErrorState
          title="We could not load your calendar"
          message="Check your connection and try again."
          onRetry={refetch}
        />
      ) : mode === 'day' ? (
        <DayTimeline
          dateKey={selectedDateKey}
          dayStart={anchor}
          occurrences={byDateKey.get(selectedDateKey) ?? []}
          timeZone={timeZone}
          hourCycle={hourCycle}
          now={now}
          onPressOccurrence={(occurrence) => openEvent(occurrence.event.id)}
          onPressSlot={(start) => openNewEvent(start)}
        />
      ) : mode === 'week' ? (
        <WeekGrid
          dateKeys={window.dateKeys}
          byDateKey={byDateKey}
          timeZone={timeZone}
          hourCycle={hourCycle}
          now={now}
          selectedDateKey={selectedDateKey}
          onSelectDate={setSelectedDateKey}
          onPressOccurrence={(occurrence) => openEvent(occurrence.event.id)}
        />
      ) : mode === 'month' ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <MonthGrid
            dateKeys={window.dateKeys}
            byDateKey={byDateKey}
            focusedMonth={month ?? 1}
            timeZone={timeZone}
            now={now}
            selectedDateKey={selectedDateKey}
            weekStartsOn={weekStartsOn}
            onSelectDate={(dateKey) => {
              setSelectedDateKey(dateKey);
              setMode('day');
            }}
          />
        </ScrollView>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: theme.spacing.xxl }}
        >
          <AgendaList
            dateKeys={window.dateKeys}
            byDateKey={byDateKey}
            timeZone={timeZone}
            hourCycle={hourCycle}
            now={now}
            onPressOccurrence={(occurrence) => openEvent(occurrence.event.id)}
          />
        </ScrollView>
      )}
    </View>
  );
}
