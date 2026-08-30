import { describe, expect, it } from 'vitest';

import {
  addZonedDays,
  getOffsetMinutes,
  getZonedParts,
  minuteOfDay,
  startOfZonedDay,
  toZonedDateKey,
  zonedWallClockToUtc,
} from './timezone';

const NY = 'America/New_York';

describe('getOffsetMinutes', () => {
  it('reports standard and daylight offsets for New York', () => {
    expect(getOffsetMinutes(new Date('2026-01-15T12:00:00Z'), NY)).toBe(-300);
    expect(getOffsetMinutes(new Date('2026-07-15T12:00:00Z'), NY)).toBe(-240);
  });

  it('reports zero for UTC', () => {
    expect(getOffsetMinutes(new Date('2026-07-15T12:00:00Z'), 'UTC')).toBe(0);
  });
});

describe('getZonedParts', () => {
  it('converts an instant into local wall-clock parts', () => {
    const parts = getZonedParts(new Date('2026-08-30T02:30:00Z'), NY);
    expect(parts).toMatchObject({ year: 2026, month: 8, day: 29, hour: 22, minute: 30 });
    expect(parts.weekday).toBe(6); // Saturday
  });

  it('reports midnight as hour 0, not 24', () => {
    expect(getZonedParts(new Date('2026-08-30T04:00:00Z'), NY).hour).toBe(0);
  });
});

describe('zonedWallClockToUtc', () => {
  it('round-trips an unambiguous local time', () => {
    const instant = zonedWallClockToUtc(
      { year: 2026, month: 8, day: 30, hour: 9, minute: 0 },
      NY,
    );
    expect(instant.toISOString()).toBe('2026-08-30T13:00:00.000Z');
  });

  it('keeps 09:00 local across the spring DST boundary', () => {
    // US DST begins 2026-03-08. 09:00 local is 14:00Z before and 13:00Z after.
    expect(
      zonedWallClockToUtc({ year: 2026, month: 3, day: 7, hour: 9 }, NY).toISOString(),
    ).toBe('2026-03-07T14:00:00.000Z');
    expect(
      zonedWallClockToUtc({ year: 2026, month: 3, day: 8, hour: 9 }, NY).toISOString(),
    ).toBe('2026-03-08T13:00:00.000Z');
  });

  it('resolves a non-existent spring-forward time to the shifted instant', () => {
    // 02:30 on 2026-03-08 never happens in New York.
    const instant = zonedWallClockToUtc({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, NY);
    expect(getZonedParts(instant, NY).hour).toBe(3);
  });

  it('resolves an ambiguous fall-back time to the earlier occurrence', () => {
    // 01:30 on 2026-11-01 happens twice; the first is 05:30Z (EDT).
    const instant = zonedWallClockToUtc({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, NY);
    expect(instant.toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });
});

describe('day helpers', () => {
  it('finds the start of the local day', () => {
    expect(startOfZonedDay(new Date('2026-08-30T02:30:00Z'), NY).toISOString()).toBe(
      '2026-08-29T04:00:00.000Z',
    );
  });

  it('keys a day by local date, not UTC date', () => {
    expect(toZonedDateKey(new Date('2026-08-30T02:30:00Z'), NY)).toBe('2026-08-29');
  });

  it('advances a whole local day across the DST boundary', () => {
    const dayBefore = startOfZonedDay(new Date('2026-03-07T18:00:00Z'), NY);
    const next = addZonedDays(dayBefore, 1, NY);
    expect(toZonedDateKey(next, NY)).toBe('2026-03-08');
    expect(minuteOfDay(next, NY)).toBe(0);
  });
});
