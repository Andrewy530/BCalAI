import { describe, expect, it } from 'vitest';

import { expandOccurrences, type RecurringEventInput } from './expand';

const NY = 'America/New_York';

/** Render occurrences as local wall-clock strings — the property under test. */
function localTimes(
  event: RecurringEventInput,
  window: { start: string; end: string },
  timeZone = NY,
): string[] {
  return expandOccurrences(event, {
    start: new Date(window.start),
    end: new Date(window.end),
  }).map((occurrence) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .format(new Date(occurrence.start))
      .replace(', ', ' '),
  );
}

// A 09:00–09:30 standup in New York, starting Monday 31 August 2026.
const standup = (recurrenceRule: string | null): RecurringEventInput => ({
  start: new Date('2026-08-31T13:00:00Z'),
  end: new Date('2026-08-31T13:30:00Z'),
  timeZone: NY,
  recurrenceRule,
});

describe('expandOccurrences — non-recurring', () => {
  it('returns the single event when it overlaps the window', () => {
    const result = expandOccurrences(standup(null), {
      start: new Date('2026-08-31T00:00:00Z'),
      end: new Date('2026-09-01T00:00:00Z'),
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.index).toBe(0);
    expect(new Date(result[0]!.end).toISOString()).toBe('2026-08-31T13:30:00.000Z');
  });

  it('returns nothing when it falls outside the window', () => {
    expect(
      expandOccurrences(standup(null), {
        start: new Date('2026-09-05T00:00:00Z'),
        end: new Date('2026-09-06T00:00:00Z'),
      }),
    ).toHaveLength(0);
  });

  it('treats a rule it cannot fully parse as a single occurrence', () => {
    // BYSETPOS is unsupported: better one event than a wrong series.
    const result = expandOccurrences(standup('FREQ=MONTHLY;BYSETPOS=-1;BYDAY=FR'), {
      start: new Date('2026-08-01T00:00:00Z'),
      end: new Date('2026-12-01T00:00:00Z'),
    });

    expect(result).toHaveLength(1);
  });

  it('preserves a zero-length event', () => {
    const result = expandOccurrences(
      { ...standup(null), end: new Date('2026-08-31T13:00:00Z') },
      { start: new Date('2026-08-31T00:00:00Z'), end: new Date('2026-09-01T00:00:00Z') },
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.end).toBe(result[0]!.start);
  });
});

describe('expandOccurrences — daily', () => {
  it('produces consecutive days', () => {
    expect(
      localTimes(standup('FREQ=DAILY'), {
        start: '2026-08-31T00:00:00Z',
        end: '2026-09-04T00:00:00Z',
      }),
    ).toEqual(['2026-08-31 09:00', '2026-09-01 09:00', '2026-09-02 09:00', '2026-09-03 09:00']);
  });

  it('honours INTERVAL', () => {
    expect(
      localTimes(standup('FREQ=DAILY;INTERVAL=3'), {
        start: '2026-08-31T00:00:00Z',
        end: '2026-09-10T00:00:00Z',
      }),
    ).toEqual(['2026-08-31 09:00', '2026-09-03 09:00', '2026-09-06 09:00', '2026-09-09 09:00']);
  });

  it('stops after COUNT occurrences', () => {
    expect(
      localTimes(standup('FREQ=DAILY;COUNT=3'), {
        start: '2026-08-01T00:00:00Z',
        end: '2026-12-01T00:00:00Z',
      }),
    ).toEqual(['2026-08-31 09:00', '2026-09-01 09:00', '2026-09-02 09:00']);
  });

  it('stops at UNTIL', () => {
    expect(
      localTimes(standup('FREQ=DAILY;UNTIL=20260902T235959Z'), {
        start: '2026-08-01T00:00:00Z',
        end: '2026-12-01T00:00:00Z',
      }),
    ).toEqual(['2026-08-31 09:00', '2026-09-01 09:00', '2026-09-02 09:00']);
  });

  it('never emits an occurrence before the series start', () => {
    const result = localTimes(standup('FREQ=DAILY'), {
      start: '2026-08-01T00:00:00Z',
      end: '2026-09-02T00:00:00Z',
    });

    expect(result[0]).toBe('2026-08-31 09:00');
  });
});

describe('expandOccurrences — DST stability', () => {
  // The single most important property: a 09:00 meeting stays at 09:00 local
  // even though the UTC instant shifts by an hour.
  it('keeps the wall-clock time across the autumn DST change', () => {
    const times = localTimes(standup('FREQ=DAILY'), {
      start: '2026-10-31T00:00:00Z',
      end: '2026-11-03T00:00:00Z',
    });

    expect(times).toEqual(['2026-10-31 09:00', '2026-11-01 09:00', '2026-11-02 09:00']);
  });

  it('shifts the underlying UTC instant across that boundary', () => {
    const occurrences = expandOccurrences(standup('FREQ=DAILY'), {
      start: new Date('2026-10-31T00:00:00Z'),
      end: new Date('2026-11-03T00:00:00Z'),
    });

    // EDT (UTC-4) before the change, EST (UTC-5) after.
    expect(new Date(occurrences[0]!.start).toISOString()).toBe('2026-10-31T13:00:00.000Z');
    expect(new Date(occurrences[2]!.start).toISOString()).toBe('2026-11-02T14:00:00.000Z');
  });

  it('preserves duration rather than end wall-clock across a change', () => {
    const occurrences = expandOccurrences(standup('FREQ=DAILY'), {
      start: new Date('2026-10-31T00:00:00Z'),
      end: new Date('2026-11-03T00:00:00Z'),
    });

    for (const occurrence of occurrences) {
      expect(occurrence.end - occurrence.start).toBe(30 * 60_000);
    }
  });
});

describe('expandOccurrences — weekly', () => {
  it('repeats on the anchor weekday when BYDAY is absent', () => {
    expect(
      localTimes(standup('FREQ=WEEKLY'), {
        start: '2026-08-31T00:00:00Z',
        end: '2026-09-22T00:00:00Z',
      }),
    ).toEqual(['2026-08-31 09:00', '2026-09-07 09:00', '2026-09-14 09:00', '2026-09-21 09:00']);
  });

  it('expands BYDAY in weekday order', () => {
    expect(
      localTimes(standup('FREQ=WEEKLY;BYDAY=MO,WE,FR'), {
        start: '2026-08-31T00:00:00Z',
        end: '2026-09-08T00:00:00Z',
      }),
    ).toEqual(['2026-08-31 09:00', '2026-09-02 09:00', '2026-09-04 09:00', '2026-09-07 09:00']);
  });

  it('skips whole weeks with INTERVAL', () => {
    expect(
      localTimes(standup('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO'), {
        start: '2026-08-31T00:00:00Z',
        end: '2026-10-01T00:00:00Z',
      }),
    ).toEqual(['2026-08-31 09:00', '2026-09-14 09:00', '2026-09-28 09:00']);
  });

  it('does not emit BYDAY days that precede the series start', () => {
    // Series starts Monday; asking for Sun+Mon must not yield the Sunday before.
    expect(
      localTimes(standup('FREQ=WEEKLY;BYDAY=SU,MO'), {
        start: '2026-08-25T00:00:00Z',
        end: '2026-09-08T00:00:00Z',
      }),
    ).toEqual(['2026-08-31 09:00', '2026-09-06 09:00', '2026-09-07 09:00']);
  });

  it('fast-forwards correctly into a far window', () => {
    const times = localTimes(standup('FREQ=WEEKLY;BYDAY=MO'), {
      start: '2027-03-01T00:00:00Z',
      end: '2027-03-16T00:00:00Z',
    });

    expect(times).toEqual(['2027-03-01 09:00', '2027-03-08 09:00', '2027-03-15 09:00']);
  });
});

describe('expandOccurrences — monthly', () => {
  it('repeats on the anchor day of month', () => {
    expect(
      localTimes(standup('FREQ=MONTHLY'), {
        start: '2026-08-01T00:00:00Z',
        end: '2026-12-01T00:00:00Z',
      }),
    ).toEqual(['2026-08-31 09:00', '2026-10-31 09:00']);
  });

  // RFC 5545: skip months that lack the day, never clamp to the month end.
  it('skips months without the anchor day rather than clamping', () => {
    const jan31: RecurringEventInput = {
      start: new Date('2027-01-31T14:00:00Z'), // 09:00 EST
      end: new Date('2027-01-31T14:30:00Z'),
      timeZone: NY,
      recurrenceRule: 'FREQ=MONTHLY',
    };

    expect(
      localTimes(jan31, { start: '2027-01-01T00:00:00Z', end: '2027-06-01T00:00:00Z' }),
    ).toEqual(['2027-01-31 09:00', '2027-03-31 09:00', '2027-05-31 09:00']);
  });

  it('expands BYMONTHDAY in ascending order', () => {
    const first: RecurringEventInput = {
      start: new Date('2026-09-01T13:00:00Z'),
      end: new Date('2026-09-01T13:30:00Z'),
      timeZone: NY,
      recurrenceRule: 'FREQ=MONTHLY;BYMONTHDAY=1,15',
    };

    expect(
      localTimes(first, { start: '2026-09-01T00:00:00Z', end: '2026-11-01T00:00:00Z' }),
    ).toEqual(['2026-09-01 09:00', '2026-09-15 09:00', '2026-10-01 09:00', '2026-10-15 09:00']);
  });
});

describe('expandOccurrences — yearly', () => {
  it('repeats annually', () => {
    expect(
      localTimes(standup('FREQ=YEARLY'), {
        start: '2026-01-01T00:00:00Z',
        end: '2029-01-01T00:00:00Z',
      }),
    ).toEqual(['2026-08-31 09:00', '2027-08-31 09:00', '2028-08-31 09:00']);
  });

  it('only recurs on leap years for 29 February', () => {
    const leapDay: RecurringEventInput = {
      start: new Date('2028-02-29T14:00:00Z'),
      end: new Date('2028-02-29T15:00:00Z'),
      timeZone: NY,
      recurrenceRule: 'FREQ=YEARLY',
    };

    expect(
      localTimes(leapDay, { start: '2028-01-01T00:00:00Z', end: '2037-01-01T00:00:00Z' }),
    ).toEqual(['2028-02-29 09:00', '2032-02-29 09:00', '2036-02-29 09:00']);
  });
});

describe('expandOccurrences — bounds', () => {
  it('respects the caller-supplied limit', () => {
    const result = expandOccurrences(
      standup('FREQ=DAILY'),
      { start: new Date('2026-08-31T00:00:00Z'), end: new Date('2030-01-01T00:00:00Z') },
      { limit: 10 },
    );

    expect(result).toHaveLength(10);
  });

  it('terminates on an unbounded rule over a wide window', () => {
    const result = expandOccurrences(standup('FREQ=DAILY'), {
      start: new Date('2026-08-31T00:00:00Z'),
      end: new Date('2050-01-01T00:00:00Z'),
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(750);
  });

  it('includes an occurrence that starts before the window but overlaps it', () => {
    const overnight: RecurringEventInput = {
      start: new Date('2026-08-31T02:00:00Z'), // 22:00 local on the 30th
      end: new Date('2026-08-31T10:00:00Z'),
      timeZone: NY,
      recurrenceRule: 'FREQ=DAILY',
    };

    const result = expandOccurrences(overnight, {
      start: new Date('2026-08-31T06:00:00Z'),
      end: new Date('2026-08-31T08:00:00Z'),
    });

    expect(result).toHaveLength(1);
  });
});
