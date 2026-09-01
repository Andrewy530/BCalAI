import { describe, expect, it } from 'vitest';

import { describeRRule, formatRRule, parseRRule, RECURRENCE_PRESETS } from './rrule';

describe('parseRRule', () => {
  it('parses a bare frequency with sensible defaults', () => {
    expect(parseRRule('FREQ=DAILY')).toEqual({
      freq: 'DAILY',
      interval: 1,
      count: undefined,
      until: undefined,
      byDay: [],
      byMonthDay: [],
      byMonth: [],
      wkst: 1,
    });
  });

  it('tolerates the RRULE: prefix, whitespace, and lower case', () => {
    const parsed = parseRRule('  rrule:freq=weekly;interval=2  ');
    expect(parsed?.freq).toBe('WEEKLY');
    expect(parsed?.interval).toBe(2);
  });

  it('parses BYDAY into structured weekdays', () => {
    expect(parseRRule('FREQ=WEEKLY;BYDAY=MO,WE,FR')?.byDay).toEqual([
      { weekday: 1 },
      { weekday: 3 },
      { weekday: 5 },
    ]);
  });

  it('parses COUNT and UNTIL', () => {
    expect(parseRRule('FREQ=DAILY;COUNT=5')?.count).toBe(5);
    expect(parseRRule('FREQ=DAILY;UNTIL=20261231T235959Z')?.until).toEqual({
      kind: 'instant',
      value: new Date('2026-12-31T23:59:59Z'),
    });
  });

  it('preserves date-only UNTIL as a calendar date', () => {
    expect(parseRRule('FREQ=DAILY;UNTIL=20261231')?.until).toEqual({
      kind: 'date',
      year: 2026,
      month: 12,
      day: 31,
    });
  });

  it('parses Graph-shaped ordinal, month, and week-start selectors', () => {
    expect(parseRRule('FREQ=MONTHLY;BYDAY=2MO')?.byDay).toEqual([{ weekday: 1, ordinal: 2 }]);
    expect(parseRRule('FREQ=YEARLY;BYMONTH=11;BYDAY=-1WE')).toEqual({
      freq: 'YEARLY',
      interval: 1,
      count: undefined,
      until: undefined,
      byDay: [{ weekday: 3, ordinal: -1 }],
      byMonthDay: [],
      byMonth: [11],
      wkst: 1,
    });
    expect(parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO;WKST=SU')?.wkst).toBe(0);
  });

  // The safety property: anything we do not fully implement must be rejected
  // outright, because silently dropping a part invents occurrences.
  it('rejects parts it does not implement rather than dropping them', () => {
    expect(parseRRule('FREQ=MONTHLY;BYSETPOS=-1;BYDAY=MO')).toBeNull();
    expect(parseRRule('FREQ=WEEKLY;BYWEEKNO=3')).toBeNull();
    expect(parseRRule('FREQ=YEARLY;BYMONTH=3')).toBeNull();
  });

  it('rejects unsupported positional and misplaced BY parts', () => {
    expect(parseRRule('FREQ=MONTHLY;BYDAY=2MO,3TU')).toBeNull();
    expect(parseRRule('FREQ=YEARLY;BYMONTH=3;BYDAY=MO')).toBeNull();
    expect(parseRRule('FREQ=DAILY;BYDAY=MO')).toBeNull();
    expect(parseRRule('FREQ=WEEKLY;BYMONTHDAY=15')).toBeNull();
    expect(parseRRule('FREQ=MONTHLY;BYMONTH=3')).toBeNull();
    expect(parseRRule('FREQ=YEARLY;BYMONTHDAY=15')).toBeNull();
    expect(parseRRule('FREQ=YEARLY;BYMONTH=11;BYDAY=-1WE;BYMONTHDAY=15')).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(parseRRule('')).toBeNull();
    expect(parseRRule('FREQ=FORTNIGHTLY')).toBeNull();
    expect(parseRRule('FREQ=DAILY;INTERVAL=0')).toBeNull();
    expect(parseRRule('FREQ=DAILY;INTERVAL=-2')).toBeNull();
    expect(parseRRule('FREQ=DAILY;COUNT=0')).toBeNull();
    expect(parseRRule('FREQ=DAILY;UNTIL=notadate')).toBeNull();
    expect(parseRRule('FREQ=DAILY;UNTIL=20260230')).toBeNull();
    expect(parseRRule('FREQ=DAILY;UNTIL=20261231T235959')).toBeNull();
    expect(parseRRule('FREQ=MONTHLY;BYMONTHDAY=32')).toBeNull();
    expect(parseRRule('FREQ=MONTHLY;BYMONTHDAY=-1')).toBeNull();
    expect(parseRRule('FREQ=MONTHLY;BYDAY=0MO')).toBeNull();
    expect(parseRRule('FREQ=MONTHLY;BYDAY=-2MO')).toBeNull();
    expect(parseRRule('FREQ=DAILY;FREQ=WEEKLY')).toBeNull();
    expect(parseRRule('FREQ=WEEKLY;WKST=MO;WKST=SU')).toBeNull();
    expect(parseRRule('JUSTGARBAGE')).toBeNull();
  });

  it('rejects COUNT and UNTIL together, per RFC 5545', () => {
    expect(parseRRule('FREQ=DAILY;COUNT=3;UNTIL=20261231T000000Z')).toBeNull();
  });
});

describe('formatRRule', () => {
  it('round-trips every preset the editor can produce', () => {
    for (const preset of RECURRENCE_PRESETS) {
      if (!preset.rrule) continue;
      const parsed = parseRRule(preset.rrule);
      expect(parsed, preset.label).not.toBeNull();
      expect(formatRRule(parsed!)).toBe(preset.rrule);
    }
  });

  it('omits INTERVAL when it is 1', () => {
    expect(formatRRule(parseRRule('FREQ=DAILY;INTERVAL=1')!)).toBe('FREQ=DAILY');
  });

  it('round-trips COUNT and UNTIL', () => {
    for (const rule of ['FREQ=WEEKLY;BYDAY=TU,TH;COUNT=10', 'FREQ=DAILY;UNTIL=20270101T120000Z']) {
      expect(formatRRule(parseRRule(rule)!)).toBe(rule);
    }
  });

  it('formats enriched rules canonically', () => {
    expect(formatRRule(parseRRule('FREQ=YEARLY;BYDAY=-1WE;BYMONTH=11')!)).toBe(
      'FREQ=YEARLY;BYMONTH=11;BYDAY=-1WE',
    );
    expect(formatRRule(parseRRule('FREQ=WEEKLY;BYDAY=SU,MO;WKST=SU;INTERVAL=2')!)).toBe(
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO;WKST=SU',
    );
    expect(formatRRule(parseRRule('FREQ=DAILY;UNTIL=20261231')!)).toBe('FREQ=DAILY;UNTIL=20261231');
  });

  it('accepts absolute yearly rules and rejects ambiguous combinations', () => {
    expect(formatRRule(parseRRule('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29')!)).toBe(
      'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29',
    );
    expect(parseRRule('FREQ=YEARLY;BYMONTH=2,3;BYMONTHDAY=1')).toBeNull();
    expect(parseRRule('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=1,2')).toBeNull();
    expect(parseRRule('FREQ=MONTHLY;BYDAY=2MO;BYMONTHDAY=15')).toBeNull();
  });
});

describe('describeRRule', () => {
  it('describes the common rules in plain English', () => {
    const describe_ = (rule: string) => describeRRule(parseRRule(rule)!);

    expect(describe_('FREQ=DAILY')).toBe('Every day');
    expect(describe_('FREQ=WEEKLY')).toBe('Every week');
    expect(describe_('FREQ=WEEKLY;INTERVAL=2')).toBe('Every 2nd week');
    expect(describe_('FREQ=WEEKLY;BYDAY=MO,WE')).toBe('Every week on Monday, Wednesday');
    expect(describe_('FREQ=MONTHLY')).toBe('Every month');
    expect(describe_('FREQ=YEARLY')).toBe('Every year');
  });

  it('mentions the limit when there is one', () => {
    expect(describeRRule(parseRRule('FREQ=DAILY;COUNT=5')!)).toBe('Every day, 5 times');
    expect(describeRRule(parseRRule('FREQ=DAILY;UNTIL=20261231T235959Z')!)).toBe(
      'Every day, until 31 Dec 2026',
    );
  });

  it('uses the right ordinal suffixes', () => {
    expect(describeRRule(parseRRule('FREQ=DAILY;INTERVAL=3')!)).toBe('Every 3rd day');
    expect(describeRRule(parseRRule('FREQ=DAILY;INTERVAL=11')!)).toBe('Every 11th day');
    expect(describeRRule(parseRRule('FREQ=DAILY;INTERVAL=21')!)).toBe('Every 21st day');
  });

  it('includes the selected month in yearly descriptions', () => {
    expect(describeRRule(parseRRule('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29')!)).toBe(
      'Every year on 29 Feb',
    );
    expect(describeRRule(parseRRule('FREQ=YEARLY;BYMONTH=11;BYDAY=-1WE')!)).toBe(
      'Every year on the last Wednesday in Nov',
    );
  });
});
