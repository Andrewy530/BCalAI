import { parseRRule, type ByDay, type RecurrenceRule, type Weekday } from './rrule.ts';
import type { Interval } from '../time/interval.ts';
import { getZonedParts, zonedWallClockToUtc } from '../time/timezone.ts';

/**
 * Expand a recurring event into occurrences in a window.
 *
 * Occurrences are generated as wall-clock date parts in the event's own zone
 * and converted to instants afterwards. This keeps a 09:00 meeting at 09:00
 * across DST boundaries while preserving its duration.
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

/** Belt-and-braces bound so malformed input can never hang the UI. */
const MAX_ITERATIONS = 5_000;

export function expandOccurrences(
  event: RecurringEventInput,
  window: { start: Date; end: Date },
  options?: { limit?: number },
): Occurrence[] {
  const limit = options?.limit ?? 750;
  const durationMs = Math.max(0, event.end.getTime() - event.start.getTime());
  const rule = event.recurrenceRule ? parseRRule(event.recurrenceRule) : null;

  // A rule outside the deliberate domain subset is not guessed at. The
  // provider adapter must reject such a rule before persistence; this fallback
  // keeps old local rows safe until they are repaired or replaced.
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

    if (isAfterUntil(rule, parts, start)) break;
    if (rule.count !== undefined && index >= rule.count) break;

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
  day: number; // 1-31
}

interface AnchorParts extends DateParts {
  weekday: number;
  hour: number;
  minute: number;
}

function isAfterUntil(rule: RecurrenceRule, parts: DateParts, start: Date): boolean {
  if (!rule.until) return false;
  if (rule.until.kind === 'date') return compareDate(parts, rule.until) > 0;
  return start.getTime() > rule.until.value.getTime();
}

function compareDate(left: DateParts, right: DateParts): number {
  if (left.year !== right.year) return left.year - right.year;
  if (left.month !== right.month) return left.month - right.month;
  return left.day - right.day;
}

/**
 * Yield candidate dates in chronological order. The generator is lazy so the
 * caller can stop at the window, and it skips whole periods before that window
 * when COUNT is not present.
 */
function* generateDates(
  rule: RecurrenceRule,
  anchor: AnchorParts,
  window: { start: Date; end: Date },
  timeZone: string,
): Generator<DateParts> {
  const windowStartParts = getZonedParts(window.start, timeZone);

  switch (rule.freq) {
    case 'DAILY': {
      const anchorDay = daysFromEpoch(anchor);
      const windowDay = daysFromEpoch(windowStartParts);
      const skip =
        rule.count === undefined && windowDay > anchorDay
          ? Math.max(0, Math.floor((windowDay - anchorDay) / rule.interval) - 1)
          : 0;

      for (let step = skip; ; step += 1) {
        yield fromEpochDays(anchorDay + step * rule.interval);
      }
    }

    case 'WEEKLY': {
      const days: ByDay[] =
        rule.byDay.length > 0
          ? [...rule.byDay].sort(
              (left, right) =>
                weekdayOffset(left.weekday, rule.wkst) - weekdayOffset(right.weekday, rule.wkst),
            )
          : [{ weekday: anchor.weekday as Weekday }];

      const anchorDay = daysFromEpoch(anchor);
      const anchorWeekStart = anchorDay - weekdayOffset(dateWeekday(anchorDay), rule.wkst);
      const windowDay = daysFromEpoch(windowStartParts);
      const windowWeekStart = windowDay - weekdayOffset(dateWeekday(windowDay), rule.wkst);
      const skipWeeks =
        rule.count === undefined && windowWeekStart > anchorWeekStart
          ? Math.max(0, Math.floor((windowWeekStart - anchorWeekStart) / (rule.interval * 7)) - 1)
          : 0;

      for (let step = skipWeeks; ; step += 1) {
        const weekStart = anchorWeekStart + step * rule.interval * 7;
        for (const day of days) {
          const dayNumber = weekStart + weekdayOffset(day.weekday, rule.wkst);
          if (dayNumber < anchorDay) continue;
          yield fromEpochDays(dayNumber);
        }
      }
    }

    case 'MONTHLY': {
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

        if (rule.byDay.length > 0) {
          const day = ordinalWeekdayInMonth(year, month, rule.byDay[0]!);
          if (day !== null && isOnOrAfterAnchor({ year, month, day }, anchor)) {
            yield { year, month, day };
          }
          continue;
        }

        const monthDays =
          rule.byMonthDay.length > 0 ? [...rule.byMonthDay].sort((a, b) => a - b) : [anchor.day];
        for (const day of monthDays) {
          if (day > daysInMonth(year, month)) continue;
          if (!isOnOrAfterAnchor({ year, month, day }, anchor)) continue;
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
        const month = rule.byMonth[0] ?? anchor.month;
        const day =
          rule.byDay.length > 0
            ? ordinalWeekdayInMonth(year, month, rule.byDay[0]!)
            : (rule.byMonthDay[0] ?? anchor.day);
        if (day === null || day > daysInMonth(year, month)) continue;
        if (!isOnOrAfterAnchor({ year, month, day }, anchor)) continue;
        yield { year, month, day };
      }
    }
  }
}

function isOnOrAfterAnchor(parts: DateParts, anchor: DateParts): boolean {
  return compareDate(parts, anchor) >= 0;
}

function ordinalWeekdayInMonth(year: number, month: number, byDay: ByDay): number | null {
  if (byDay.ordinal === undefined) return null;
  const length = daysInMonth(year, month);

  if (byDay.ordinal === -1) {
    const lastWeekday = dateWeekday(daysFromEpoch({ year, month, day: length }));
    return length - weekdayOffset(lastWeekday, byDay.weekday);
  }

  const firstWeekday = dateWeekday(daysFromEpoch({ year, month, day: 1 }));
  const day = 1 + weekdayOffset(byDay.weekday, firstWeekday) + (byDay.ordinal - 1) * 7;
  return day <= length ? day : null;
}

function weekdayOffset(day: Weekday, start: Weekday): number {
  return (day - start + 7) % 7;
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

function dateWeekday(epochDay: number): Weekday {
  return ((((epochDay + 4) % 7) + 7) % 7) as Weekday;
}
