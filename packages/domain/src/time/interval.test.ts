import { describe, expect, it } from 'vitest';

import { type Interval, normalize, overlaps, pad, subtract } from './interval';

const at = (hour: number, minute = 0): number => Date.UTC(2026, 7, 30, hour, minute);
const span = (fromHour: number, toHour: number): Interval => ({ start: at(fromHour), end: at(toHour) });

describe('overlaps', () => {
  it('treats back-to-back intervals as non-overlapping', () => {
    expect(overlaps(span(9, 10), span(10, 11))).toBe(false);
  });

  it('detects partial overlap in both directions', () => {
    expect(overlaps(span(9, 11), span(10, 12))).toBe(true);
    expect(overlaps(span(10, 12), span(9, 11))).toBe(true);
  });
});

describe('normalize', () => {
  it('merges overlapping and touching intervals and drops empties', () => {
    expect(normalize([span(10, 11), span(9, 10), span(12, 12), span(10, 12)])).toEqual([
      span(9, 12),
    ]);
  });
});

describe('subtract', () => {
  it('cuts a hole out of the middle', () => {
    expect(subtract([span(9, 17)], [span(12, 13)])).toEqual([span(9, 12), span(13, 17)]);
  });

  it('returns nothing when fully covered', () => {
    expect(subtract([span(9, 17)], [span(8, 18)])).toEqual([]);
  });

  it('handles several cuts, including ones that extend past the edges', () => {
    expect(subtract([span(9, 17)], [span(8, 10), span(12, 13), span(16, 20)])).toEqual([
      span(10, 12),
      span(13, 16),
    ]);
  });

  it('leaves the base untouched when cuts do not intersect it', () => {
    expect(subtract([span(9, 12)], [span(13, 14)])).toEqual([span(9, 12)]);
  });
});

describe('pad', () => {
  it('grows intervals on both sides and merges the results', () => {
    expect(pad([span(10, 11), span(11, 12)], 15)).toEqual([
      { start: at(9, 45), end: at(12, 15) },
    ]);
  });
});
