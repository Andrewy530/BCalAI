import type { Interval } from '../time/interval';
import { getZonedParts, zonedWallClockToUtc } from '../time/timezone';

import { parseRRule, type RecurrenceRule, type Weekday } from './rrule';

/**
 * Expanding a recurring event into the occurrences that fall in a window.
 *
 * Two properties matter more than anything else here:
 *
 * 1. **Wall-clock stability.** A 09:00 standup stays at 09:00 local across a
 *    DST boundary. That is why occurrences are generated as *date parts in the
 *    event's own zone* and converted to instants afterwards, rather than by
 *    adding 86,400,000 ms repeatedly.
 * 2. **Duration preservation.** The end is `start + duration`, so an event that
 *    straddles a clock change keeps its length rather than its end wall-clock.
 */

export interface RecurringEventInput {
  start: Date;
  end: Date;
  /** The zone the event's wall-clock time is anchored to. */
  timeZone: string;
  /** RFC 5545 RRULE, or null for a one-off. */
  recurrenceRule: string | null;
}

export interface Occurrence extends Interval {
  /** 0 for the first occurrence, incrementing in chronological order. */
  index: number;
}

/** Belt-and-braces bound so a malformed rule can never hang the UI. */
const MAX_ITERATIONS = 5_000;

export function expandOccurrences(
  event: RecurringEventInput,
  window: { start: Date; end: Date },
  options?: { limit?: number },
): Occurrence[] {
  const limit = options?.limit ?? 750;
  const durationMs = Math.max(0, event.end.getTime() - event.start.getTime());

  const rule = event.recurrenceRule ? parseRRule(event.recurrenceRule) : null;

  // No rule, or one we do not fully implement: treat it as a single event
  // rather than guessing at semantics we might get wrong.
  if (!rule) {
    const single: Occurrence = {
      start: event.start.getTime(),
      end: event.start.getTime() + durationMs,
      index: 0,
    };
    return overlapsWindow(single, window) ? [single] : [];
  }

  const anchor = getZonedParts(event.start, event.timeZone);
  const results: Occurrence[] = [];
  let index = 0;
  let iterations = 0;

  for (const parts of generateDates(rule, anchor, window, event.timeZone)) {
    if (++iterations > MAX_ITERATIONS) break;

    const start = zonedWallClockToUtc(
      {
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: anchor.hour,
        minute: anchor.minute,
      },
      event.timeZone,
    );

    // COUNT counts occurrences from the series start, including ones before
    // the window — so the index has to keep incrementing regardless.
    if (rule.count !== undefined && index >= rule.count) break;
    if (rule.until && start.getTime() > rule.until.getTime()) break;

    const occurrence: Occurrence = {
      start: start.getTime(),
      end: start.getTime() + durationMs,
      index,
    };
    index += 1;

    if (occurrence.start >= window.end.getTime()) break;
    if (overlapsWindow(occurrence, window)) {
      results.push(occurrence);
      if (results.length >= limit) break;
    }
  }

  return results;
}

const overlapsWindow = (occurrence: Interval, window: { start: Date; end: Date }): boolean =>
  occurrence.end > window.start.getTime() && occurrence.start < window.end.getTime();

interface DateParts {
  year: number;
  month: number; // 1-12
  day: number;
}

/**
 * Yield candidate dates in chronological order.
 *
 * The generator is lazy so `expandOccurrences` can stop the moment it passes
 * the window, and it fast-forwards past whole periods that precede the window
 * instead of stepping through years of history one day at a time.
 */
function* generateDates(
  rule: RecurrenceRule,
  anchor: { year: number; month: number; day: number; weekday: number },
  window: { start: Date; end: Date },
  timeZone: string,
): Generator<DateParts> {
  const windowStartParts = getZonedParts(window.start, timeZone);

  switch (rule.freq) {
    case 'DAILY': {
      const anchorDay = daysFromEpoch(anchor);
      const windowDay = daysFromEpoch(windowStartParts);
      // Skip whole intervals that end before the window, keeping one period of
      // slack so an occurrence straddling the boundary is not lost.
      const skip =
        windowDay > anchorDay
          ? Math.max(0, Math.floor((windowDay - anchorDay) / rule.interval) - 1)
          : 0;

      // COUNT is relative to the series start, so a fast-forward is only safe
      // when the caller does not need the earlier indices.
      if (rule.count !== undefined) {
        for (let step = 0; step < rule.count; step += 1) {
          yield fromEpochDays(anchorDay + step * rule.interval);
        }
        return;
      }

      for (let step = skip; ; step += 1) {
        yield fromEpochDays(anchorDay + step * rule.interval);
      }
    }

    case 'WEEKLY': {
      const days: Weekday[] =
        rule.byDay.length > 0 ? [...rule.byDay].sort((a, b) => a - b) : [anchor.weekday as Weekday];

      const anchorDay = daysFromEpoch(anchor);
      const anchorWeek = weekIndexOf(anchorDay);
      const windowWeek = weekIndexOf(daysFromEpoch(windowStartParts));

      const skipWeeks =
        rule.count === undefined && windowWeek > anchorWeek
          ? Math.max(0, Math.floor((windowWeek - anchorWeek) / rule.interval) - 1)
          : 0;

      for (let step = skipWeeks; ; step += 1) {
        const weekStart = anchorDay - mondayOffset(anchorDay) + step * rule.interval * 7;
        for (const weekday of days) {
          // Monday-based offset, so the emitted days stay in weekday order.
          const dayNumber = weekStart + ((weekday + 6) % 7);
          if (dayNumber < anchorDay) continue; // Never before the series start.
          yield fromEpochDays(dayNumber);
        }
      }
    }

    case 'MONTHLY': {
      const monthDays = rule.byMonthDay.length > 0 ? [...rule.byMonthDay].sort((a, b) => a - b) : [anchor.day];
      const anchorMonths = anchor.year * 12 + (anchor.month - 1);
      const windowMonths = windowStartParts.year * 12 + (windowStartParts.month - 1);

      const skip =
        rule.count === undefined && windowMonths > anchorMonths
          ? Math.max(0, Math.floor((windowMonths - anchorMonths) / rule.interval) - 1)
          : 0;

      for (let step = skip; ; step += 1) {
        const absolute = anchorMonths + step * rule.interval;
        const year = Math.floor(absolute / 12);
        const month = (absolute % 12) + 1;

        for (const day of monthDays) {
          // RFC 5545: a date that does not exist in this month is skipped, not
          // clamped. 31 Jan monthly means Jan, Mar, May… never 28 Feb.
          if (day > daysInMonth(year, month)) continue;
          if (year < anchor.year || (year === anchor.year && month === anchor.month && day < anchor.day)) {
            continue;
          }
          yield { year, month, day };
        }
      }
    }

    case 'YEARLY': {
      const skip =
        rule.count === undefined && windowStartParts.year > anchor.year
          ? Math.max(0, Math.floor((windowStartParts.year - anchor.year) / rule.interval) - 1)
          : 0;

      for (let step = skip; ; step += 1) {
        const year = anchor.year + step * rule.interval;
        // 29 February only recurs in leap years.
        if (anchor.day > daysInMonth(year, anchor.month)) continue;
        yield { year, month: anchor.month, day: anchor.day };
      }
    }
  }
}

const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

const daysFromEpoch = (parts: DateParts): number =>
  Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000);

function fromEpochDays(days: number): DateParts {
  const date = new Date(days * 86_400_000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

/** 1 Jan 1970 was a Thursday, so Monday-of-that-week is 3 days earlier. */
const mondayOffset = (epochDay: number): number => ((epochDay + 3) % 7 + 7) % 7;

const weekIndexOf = (epochDay: number): number => Math.floor((epochDay + 3) / 7);
