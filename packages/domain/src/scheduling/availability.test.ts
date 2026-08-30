import type { ScheduleConstraints } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import { type Interval, toInterval } from '../time/interval';
import { getZonedParts } from '../time/timezone';

import {
  expandWorkingHours,
  findFreeIntervals,
  generateCandidateSlots,
  hasConflict,
  rankSlotsHeuristically,
} from './availability';

const NY = 'America/New_York';

/** Mon-Fri 09:00-17:00 local. */
const NINE_TO_FIVE = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
}));

function constraints(overrides: Partial<ScheduleConstraints> = {}): ScheduleConstraints {
  return {
    durationMinutes: 60,
    // Monday 2026-08-31 through Tuesday 2026-09-01, local time.
    windowStart: '2026-08-31T04:00:00.000Z',
    windowEnd: '2026-09-01T04:00:00.000Z',
    workingHours: NINE_TO_FIVE,
    timezone: NY,
    bufferMinutes: 0,
    granularityMinutes: 30,
    splittable: false,
    minSplitMinutes: 30,
    preferredTimeOfDay: 'any',
    ...overrides,
  };
}

const localTimeOf = (ms: number): string => {
  const p = getZonedParts(new Date(ms), NY);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
};

describe('expandWorkingHours', () => {
  it('produces one window for a single working day', () => {
    const window: Interval = toInterval('2026-08-31T04:00:00Z', '2026-09-01T04:00:00Z');
    const windows = expandWorkingHours(window, NINE_TO_FIVE, NY);

    expect(windows).toHaveLength(1);
    expect(new Date(windows[0]!.start).toISOString()).toBe('2026-08-31T13:00:00.000Z');
    expect(new Date(windows[0]!.end).toISOString()).toBe('2026-08-31T21:00:00.000Z');
  });

  it('skips days with no configured working hours', () => {
    // Saturday 2026-08-29 local.
    const window: Interval = toInterval('2026-08-29T04:00:00Z', '2026-08-30T04:00:00Z');
    expect(expandWorkingHours(window, NINE_TO_FIVE, NY)).toEqual([]);
  });

  it('keeps local start times stable across a DST boundary', () => {
    const window: Interval = toInterval('2026-03-06T05:00:00Z', '2026-03-10T05:00:00Z');
    const windows = expandWorkingHours(window, NINE_TO_FIVE, NY);

    // Friday before the change and Monday after it both start at 09:00 local.
    expect(windows.map((w) => localTimeOf(w.start))).toEqual(['09:00', '09:00']);
    expect(new Date(windows[0]!.start).toISOString()).toBe('2026-03-06T14:00:00.000Z');
    expect(new Date(windows[1]!.start).toISOString()).toBe('2026-03-09T13:00:00.000Z');
  });
});

describe('findFreeIntervals', () => {
  it('returns the whole working day when nothing is booked', () => {
    const free = findFreeIntervals({ constraints: constraints(), busy: [] });
    expect(free).toHaveLength(1);
    expect(localTimeOf(free[0]!.start)).toBe('09:00');
    expect(localTimeOf(free[0]!.end)).toBe('17:00');
  });

  it('removes busy time and never returns an overlapping interval', () => {
    const busy = [toInterval('2026-08-31T15:00:00Z', '2026-08-31T16:00:00Z')]; // 11:00-12:00
    const free = findFreeIntervals({ constraints: constraints(), busy });

    expect(free.map((f) => [localTimeOf(f.start), localTimeOf(f.end)])).toEqual([
      ['09:00', '11:00'],
      ['12:00', '17:00'],
    ]);
    expect(free.some((f) => hasConflict(f, busy))).toBe(false);
  });

  it('honours the buffer on both sides of a meeting', () => {
    const busy = [toInterval('2026-08-31T15:00:00Z', '2026-08-31T16:00:00Z')];
    const free = findFreeIntervals({ constraints: constraints({ bufferMinutes: 15 }), busy });

    expect(free.map((f) => [localTimeOf(f.start), localTimeOf(f.end)])).toEqual([
      ['09:00', '10:45'],
      ['12:15', '17:00'],
    ]);
  });

  it('clips to an earliest/latest local minute band', () => {
    const free = findFreeIntervals({
      constraints: constraints({ earliestMinute: 10 * 60, latestMinute: 15 * 60 }),
      busy: [],
    });

    expect(free.map((f) => [localTimeOf(f.start), localTimeOf(f.end)])).toEqual([
      ['10:00', '15:00'],
    ]);
  });

  it('returns nothing when the day is fully booked', () => {
    const busy = [toInterval('2026-08-31T12:00:00Z', '2026-08-31T22:00:00Z')];
    expect(findFreeIntervals({ constraints: constraints(), busy })).toEqual([]);
  });
});

describe('generateCandidateSlots', () => {
  it('offers slots on the granularity grid that all fit the duration', () => {
    const c = constraints({ durationMinutes: 60, granularityMinutes: 60 });
    const slots = generateCandidateSlots({ constraints: c, busy: [] });

    expect(slots.map((s) => localTimeOf(s.start))).toEqual([
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
    ]);
    expect(slots.every((s) => s.end - s.start === 60 * 60_000)).toBe(true);
  });

  it('never proposes a slot that collides with a busy interval', () => {
    const busy = [toInterval('2026-08-31T15:00:00Z', '2026-08-31T16:30:00Z')];
    const slots = generateCandidateSlots({ constraints: constraints(), busy });

    expect(slots).not.toHaveLength(0);
    expect(slots.some((slot) => hasConflict(slot, busy))).toBe(false);
  });

  it('returns nothing when the task is longer than any gap', () => {
    const busy = [toInterval('2026-08-31T16:00:00Z', '2026-08-31T17:00:00Z')]; // 12:00-13:00
    const slots = generateCandidateSlots({
      constraints: constraints({ durationMinutes: 5 * 60 }),
      busy,
    });
    expect(slots).toEqual([]);
  });

  it('gives every slot a distinct id', () => {
    const slots = generateCandidateSlots({ constraints: constraints(), busy: [] });
    expect(new Set(slots.map((s) => s.id)).size).toBe(slots.length);
  });
});

describe('rankSlotsHeuristically', () => {
  it('prefers the requested part of the day, then earliest', () => {
    const c = constraints({ granularityMinutes: 60, preferredTimeOfDay: 'afternoon' });
    const ranked = rankSlotsHeuristically(generateCandidateSlots({ constraints: c, busy: [] }), c);

    expect(localTimeOf(ranked[0]!.start)).toBe('12:00');
    expect(localTimeOf(ranked[1]!.start)).toBe('13:00');
  });

  it('falls back to earliest-first when no preference is set', () => {
    const c = constraints({ granularityMinutes: 60 });
    const ranked = rankSlotsHeuristically(generateCandidateSlots({ constraints: c, busy: [] }), c);
    expect(localTimeOf(ranked[0]!.start)).toBe('09:00');
  });
});
