import { addZonedDays, expandOccurrences, startOfZonedDay, toZonedDateKey } from '@cal/domain';
import type { Calendar, CalendarEvent } from '@cal/schemas';
import { useMemo } from 'react';

import { useCalendarViewStore } from '../../../store/calendar-view.store';
import { useCalendars } from '../../events/hooks/useCalendars';
import { useEventsInWindow } from '../../events/hooks/useEvents';
import { useProfile, useUserTimeZone } from '../../settings/hooks/useProfile';
import { windowForView, type CalendarWindow } from '../utils/window';

/**
 * A single occurrence of an event, ready to draw.
 *
 * A recurring event is one row in the database but many entries here — which
 * is why `key` combines the event id with the occurrence index rather than
 * using the id alone.
 */
export interface EventOccurrence {
  key: string;
  event: CalendarEvent;
  calendar: Calendar | undefined;
  /** Epoch milliseconds. */
  start: number;
  end: number;
  occurrenceIndex: number;
}

export interface CalendarWindowResult {
  window: CalendarWindow;
  /** Occurrences overlapping the window, chronological. */
  occurrences: EventOccurrence[];
  /** Occurrences bucketed by local date key. Multi-day events appear in each. */
  byDateKey: Map<string, EventOccurrence[]>;
  calendars: Calendar[];
  timeZone: string;
  weekStartsOn: number;
  hourCycle: 'h12' | 'h23';
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Everything the calendar views need for the currently focused range.
 *
 * Expansion happens here, once, rather than inside each view — the day, week,
 * month, and agenda views all consume the same computed occurrence list.
 */
export function useCalendarWindow(): CalendarWindowResult {
  const mode = useCalendarViewStore((state) => state.mode);
  const selectedDateKey = useCalendarViewStore((state) => state.selectedDateKey);
  const hiddenCalendarIds = useCalendarViewStore((state) => state.hiddenCalendarIds);

  const timeZone = useUserTimeZone();
  const { data: profile } = useProfile();
  const weekStartsOn = profile?.weekStartsOn ?? 1;

  const window = useMemo(
    () => windowForView(mode, selectedDateKey, timeZone, weekStartsOn),
    [mode, selectedDateKey, timeZone, weekStartsOn],
  );

  const calendarsQuery = useCalendars();
  const eventsQuery = useEventsInWindow(window.start, window.end);

  const { occurrences, byDateKey } = useMemo(() => {
    const calendarById = new Map((calendarsQuery.data ?? []).map((c) => [c.id, c]));
    const hidden = new Set(hiddenCalendarIds);

    const expanded: EventOccurrence[] = [];

    for (const event of eventsQuery.data ?? []) {
      const calendar = calendarById.get(event.calendarId);
      // Respect both the per-device toggle and the calendar's own visibility.
      if (hidden.has(event.calendarId) || calendar?.isVisible === false) continue;

      const slices = expandOccurrences(
        {
          start: new Date(event.startAt),
          end: new Date(event.endAt),
          timeZone: event.timezone,
          recurrenceRule: event.recurrenceRule,
        },
        { start: window.start, end: window.end },
      );

      for (const slice of slices) {
        expanded.push({
          key: `${event.id}:${slice.index}`,
          event,
          calendar,
          start: slice.start,
          end: slice.end,
          occurrenceIndex: slice.index,
        });
      }
    }

    expanded.sort((a, b) => a.start - b.start || a.end - b.end);

    // Bucket into days. An event crossing midnight belongs to every day it
    // touches, so a Monday-night-to-Tuesday-morning event shows up on both.
    const buckets = new Map<string, EventOccurrence[]>();
    for (const key of window.dateKeys) buckets.set(key, []);

    for (const occurrence of expanded) {
      // `end` is exclusive: an event finishing exactly at midnight belongs to
      // the day it ran in, not the one it touches for zero minutes.
      const lastInstant = new Date(Math.max(occurrence.start, occurrence.end - 1));
      const lastKey = toZonedDateKey(lastInstant, timeZone);

      // Step in *local* days. Advancing by a fixed 86,400,000 ms would drift
      // across a DST change and could skip or repeat a day.
      let cursor = startOfZonedDay(new Date(occurrence.start), timeZone);
      let dateKey = toZonedDateKey(cursor, timeZone);

      for (let guard = 0; guard < 400; guard += 1) {
        buckets.get(dateKey)?.push(occurrence);
        if (dateKey >= lastKey) break;

        cursor = startOfZonedDay(addZonedDays(cursor, 1, timeZone), timeZone);
        dateKey = toZonedDateKey(cursor, timeZone);
      }
    }

    return { occurrences: expanded, byDateKey: buckets };
  }, [eventsQuery.data, calendarsQuery.data, hiddenCalendarIds, window, timeZone]);

  return {
    window,
    occurrences,
    byDateKey,
    calendars: calendarsQuery.data ?? [],
    timeZone,
    weekStartsOn,
    hourCycle: profile?.hourCycle ?? 'h23',
    isLoading: eventsQuery.isLoading || calendarsQuery.isLoading,
    isError: eventsQuery.isError || calendarsQuery.isError,
    refetch: () => void eventsQuery.refetch(),
  };
}
