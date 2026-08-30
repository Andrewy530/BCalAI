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
    });
  });

  it('tolerates the RRULE: prefix, whitespace, and lower case', () => {
    const parsed = parseRRule('  rrule:freq=weekly;interval=2  ');
    expect(parsed?.freq).toBe('WEEKLY');
    expect(parsed?.interval).toBe(2);
  });

  it('parses BYDAY into weekday numbers', () => {
    expect(parseRRule('FREQ=WEEKLY;BYDAY=MO,WE,FR')?.byDay).toEqual([1, 3, 5]);
  });

  it('parses COUNT and UNTIL', () => {
    expect(parseRRule('FREQ=DAILY;COUNT=5')?.count).toBe(5);
    expect(parseRRule('FREQ=DAILY;UNTIL=20261231T235959Z')?.until?.toISOString()).toBe(
      '2026-12-31T23:59:59.000Z',
    );
  });

  it('defaults a date-only UNTIL to the end of that day', () => {
    expect(parseRRule('FREQ=DAILY;UNTIL=20261231')?.until?.toISOString()).toBe(
      '2026-12-31T23:59:59.000Z',
    );
  });

  // The safety property: anything we do not fully implement must be rejected
  // outright, because silently dropping a part invents occurrences.
  it('rejects parts it does not implement rather than dropping them', () => {
    expect(parseRRule('FREQ=MONTHLY;BYSETPOS=-1;BYDAY=MO')).toBeNull();
    expect(parseRRule('FREQ=WEEKLY;BYWEEKNO=3')).toBeNull();
    expect(parseRRule('FREQ=YEARLY;BYMONTH=3')).toBeNull();
  });

  it('rejects positional BYDAY and misplaced BY parts', () => {
    expect(parseRRule('FREQ=MONTHLY;BYDAY=2MO')).toBeNull();
    expect(parseRRule('FREQ=DAILY;BYDAY=MO')).toBeNull();
    expect(parseRRule('FREQ=WEEKLY;BYMONTHDAY=15')).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(parseRRule('')).toBeNull();
    expect(parseRRule('FREQ=FORTNIGHTLY')).toBeNull();
    expect(parseRRule('FREQ=DAILY;INTERVAL=0')).toBeNull();
    expect(parseRRule('FREQ=DAILY;INTERVAL=-2')).toBeNull();
    expect(parseRRule('FREQ=DAILY;COUNT=0')).toBeNull();
    expect(parseRRule('FREQ=DAILY;UNTIL=notadate')).toBeNull();
    expect(parseRRule('FREQ=MONTHLY;BYMONTHDAY=32')).toBeNull();
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
});
