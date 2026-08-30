import type { WorkingHours } from '@cal/schemas';

import { expandWorkingHours } from '../scheduling/availability';
import { durationMinutes, intersect, subtract, type Interval } from '../time/interval';

/** Inputs needed to calculate the part of today's workday that is still open. */
export interface FreeTimeInput {
  dayStart: Date;
  dayEnd: Date;
  now: Date;
  workingHours: WorkingHours;
  timeZone: string;
  /** Busy calendar intervals. All intervals use epoch milliseconds. */
  busy: readonly Interval[];
}

export interface FreeTimeSummary {
  /** Remaining free working time, rounded to the nearest whole minute. */
  freeMinutes: number;
  /** The actual free intervals, useful for a future Find Time surface. */
  intervals: Interval[];
}

/**
 * Calculate remaining free working time for a local day.
 *
 * Working hours are expanded in the user's wall-clock zone and calendar
 * events are subtracted with half-open interval math. This keeps the Today
 * card honest across DST changes and prevents UI code from inventing a
 * "free-time" estimate with fixed 24-hour arithmetic.
 */
export function calculateFreeTime(input: FreeTimeInput): FreeTimeSummary {
  const day: Interval = {
    start: input.dayStart.getTime(),
    end: input.dayEnd.getTime(),
  };
  const remaining: Interval = {
    start: Math.max(day.start, input.now.getTime()),
    end: day.end,
  };

  if (remaining.end <= remaining.start) return { freeMinutes: 0, intervals: [] };

  const working = expandWorkingHours(day, input.workingHours, input.timeZone);
  const free = subtract(working, input.busy)
    .map((interval) => intersect(interval, remaining))
    .filter((interval): interval is Interval => interval !== null);

  return {
    freeMinutes: Math.max(
      0,
      Math.round(free.reduce((minutes, interval) => minutes + durationMinutes(interval), 0)),
    ),
    intervals: free,
  };
}
