/**
 * Half-open time intervals `[start, end)` in epoch milliseconds.
 *
 * Half-open is deliberate: an event ending at 10:00 and one starting at 10:00
 * do not overlap, which is what users expect from back-to-back meetings.
 */
export interface Interval {
  start: number;
  end: number;
}

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export const durationMinutes = (interval: Interval): number =>
  (interval.end - interval.start) / MINUTE_MS;

export const isEmpty = (interval: Interval): boolean => interval.end <= interval.start;

export const overlaps = (a: Interval, b: Interval): boolean => a.start < b.end && b.start < a.end;

export const contains = (outer: Interval, inner: Interval): boolean =>
  outer.start <= inner.start && inner.end <= outer.end;

export function intersect(a: Interval, b: Interval): Interval | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : null;
}

const byStart = (a: Interval, b: Interval): number => a.start - b.start || a.end - b.end;

/** Sort, drop empties, and merge anything that touches or overlaps. */
export function normalize(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals.filter((i) => !isEmpty(i)).sort(byStart);

  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

/** Everything in `base` that is not covered by `cuts`. */
export function subtract(base: readonly Interval[], cuts: readonly Interval[]): Interval[] {
  const blocked = normalize(cuts);
  const result: Interval[] = [];

  for (const segment of normalize(base)) {
    let cursor = segment.start;

    for (const cut of blocked) {
      if (cut.end <= cursor) continue;
      if (cut.start >= segment.end) break;

      if (cut.start > cursor) result.push({ start: cursor, end: Math.min(cut.start, segment.end) });
      cursor = Math.max(cursor, cut.end);
      if (cursor >= segment.end) break;
    }

    if (cursor < segment.end) result.push({ start: cursor, end: segment.end });
  }

  return result;
}

/** Grow (or, with a negative value, shrink) every interval on both sides. */
export function pad(intervals: readonly Interval[], minutes: number): Interval[] {
  const delta = minutes * MINUTE_MS;
  return normalize(intervals.map((i) => ({ start: i.start - delta, end: i.end + delta })));
}

export const toInterval = (start: Date | string, end: Date | string): Interval => ({
  start: new Date(start).getTime(),
  end: new Date(end).getTime(),
});

export const toIsoInterval = (interval: Interval): { startAt: string; endAt: string } => ({
  startAt: new Date(interval.start).toISOString(),
  endAt: new Date(interval.end).toISOString(),
});
