import { describe, expect, it } from 'vitest';

import { calculateFreeTime } from './today';
import { addZonedDays, zonedWallClockToUtc } from '../time/timezone';

const time = (hour: number, minute = 0): Date =>
  zonedWallClockToUtc({ year: 2026, month: 9, day: 14, hour, minute }, 'America/New_York');

describe('calculateFreeTime', () => {
  const dayStart = time(0);
  const dayEnd = addZonedDays(dayStart, 1, 'America/New_York');
  const workingHours = [{ weekday: 1 as const, startMinute: 9 * 60, endMinute: 17 * 60 }];

  it('subtracts busy events from remaining working hours', () => {
    const result = calculateFreeTime({
      dayStart,
      dayEnd,
      now: time(8),
      timeZone: 'America/New_York',
      workingHours,
      busy: [{ start: time(10).getTime(), end: time(11).getTime() }],
    });

    expect(result.freeMinutes).toBe(420);
    expect(result.intervals).toEqual([
      { start: time(9).getTime(), end: time(10).getTime() },
      { start: time(11).getTime(), end: time(17).getTime() },
    ]);
  });

  it('starts the summary at now and handles a day with no work left', () => {
    expect(
      calculateFreeTime({
        dayStart,
        dayEnd,
        now: time(13, 30),
        timeZone: 'America/New_York',
        workingHours,
        busy: [],
      }).freeMinutes,
    ).toBe(210);

    expect(
      calculateFreeTime({
        dayStart,
        dayEnd,
        now: time(18),
        timeZone: 'America/New_York',
        workingHours,
        busy: [],
      }),
    ).toEqual({ freeMinutes: 0, intervals: [] });
  });
});
