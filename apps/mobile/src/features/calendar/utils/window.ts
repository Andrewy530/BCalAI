import { addZonedDays, startOfZonedDay, toZonedDateKey, zonedWallClockToUtc } from '@cal/domain';

import type { CalendarViewMode } from '../../../store/calendar-view.store';

/** Midnight-to-midnight span, in the user's zone, that a view needs loaded. */
export interface CalendarWindow {
  start: Date;
  end: Date;
  /** Local date keys the view renders, in order. */
  dateKeys: string[];
}

/** "2026-08-30" → the instant that local day begins. */
export function dateKeyToInstant(dateKey: string, timeZone: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return zonedWallClockToUtc(
    { year: year ?? 1970, month: month ?? 1, day: day ?? 1, hour: 0, minute: 0 },
    timeZone,
  );
}

const daySpan = (start: Date, days: number, timeZone: string): CalendarWindow => {
  const dateKeys: string[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    dateKeys.push(toZonedDateKey(addZonedDays(start, offset, timeZone), timeZone));
  }
  return { start, end: addZonedDays(start, days, timeZone), dateKeys };
};

/** Start of the week containing `instant`, honouring the user's week start. */
export function startOfWeek(instant: Date, timeZone: string, weekStartsOn: number): Date {
  const startOfDay = startOfZonedDay(instant, timeZone);
  // The weekday must be read in the user's zone, not UTC's: at 20:00 in New
  // York the UTC date is already tomorrow, and a whole week would be off by one.
  const back = (localWeekdayOf(startOfDay, timeZone) - weekStartsOn + 7) % 7;
  return addZonedDays(startOfDay, -back, timeZone);
}

function localWeekdayOf(instant: Date, timeZone: string): number {
  const label = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(instant);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(label);
}

/**
 * The window a view needs.
 *
 * Month deliberately spans whole weeks rather than whole months so the grid's
 * leading and trailing days are populated instead of blank.
 */
export function windowForView(
  mode: CalendarViewMode,
  selectedDateKey: string,
  timeZone: string,
  weekStartsOn: number,
): CalendarWindow {
  const anchor = dateKeyToInstant(selectedDateKey, timeZone);

  switch (mode) {
    case 'day':
      return daySpan(anchor, 1, timeZone);

    case 'week':
      return daySpan(startOfWeek(anchor, timeZone, weekStartsOn), 7, timeZone);

    case 'month': {
      const parts = selectedDateKey.split('-').map(Number);
      const firstOfMonth = zonedWallClockToUtc(
        { year: parts[0] ?? 1970, month: parts[1] ?? 1, day: 1, hour: 0, minute: 0 },
        timeZone,
      );
      const gridStart = startOfWeek(firstOfMonth, timeZone, weekStartsOn);
      return daySpan(gridStart, 42, timeZone);
    }

    case 'agenda':
      // Four weeks forward is enough to feel endless without a huge fetch.
      return daySpan(anchor, 28, timeZone);
  }
}
