import { describe, expect, it } from 'vitest';

import { calendarDaysBetween, formatDueDate, formatDuration, formatTimeOfDay } from './formatting';

const NY = 'America/New_York';
const BERLIN = 'Europe/Berlin';
// Monday 31 Aug 2026, 14:00 in New York.
const NOW = new Date('2026-08-31T18:00:00Z');

describe('formatTimeOfDay', () => {
  it('renders 24-hour time zero-padded', () => {
    expect(formatTimeOfDay(new Date('2026-08-31T18:05:00Z'), NY, 'h23')).toBe('14:05');
    expect(formatTimeOfDay(new Date('2026-08-31T11:00:00Z'), NY, 'h23')).toBe('07:00');
  });

  it('renders 12-hour time with midnight and noon as 12', () => {
    expect(formatTimeOfDay(new Date('2026-08-31T18:05:00Z'), NY, 'h12')).toBe('2:05 PM');
    expect(formatTimeOfDay(new Date('2026-08-31T04:00:00Z'), NY, 'h12')).toBe('12:00 AM');
    expect(formatTimeOfDay(new Date('2026-08-31T16:00:00Z'), NY, 'h12')).toBe('12:00 PM');
  });

  it('reads the time in the given zone, not the host zone', () => {
    const instant = new Date('2026-08-31T18:00:00Z');
    expect(formatTimeOfDay(instant, NY, 'h23')).toBe('14:00');
    expect(formatTimeOfDay(instant, BERLIN, 'h23')).toBe('20:00');
  });
});

describe('calendarDaysBetween', () => {
  it('counts calendar days, not elapsed 24-hour periods', () => {
    // 23:00 today to 01:00 tomorrow is two hours but one calendar day.
    const late = new Date('2026-09-01T03:00:00Z'); // 23:00 Mon in NY
    const early = new Date('2026-09-01T05:00:00Z'); // 01:00 Tue in NY
    expect(calendarDaysBetween(late, early, NY)).toBe(1);
  });

  it('is zero for two instants on the same local day', () => {
    expect(calendarDaysBetween(NOW, new Date('2026-08-31T23:00:00Z'), NY)).toBe(0);
  });

  it('is negative for past days', () => {
    expect(calendarDaysBetween(NOW, new Date('2026-08-29T18:00:00Z'), NY)).toBe(-2);
  });

  it('survives a DST transition', () => {
    // US DST ends 1 Nov 2026. 31 Oct → 2 Nov is two calendar days despite the
    // extra hour in between.
    const before = new Date('2026-10-31T16:00:00Z');
    const after = new Date('2026-11-02T17:00:00Z');
    expect(calendarDaysBetween(before, after, NY)).toBe(2);
  });
});

describe('formatDueDate', () => {
  const base = { now: NOW, timeZone: NY, hourCycle: 'h23' as const };

  it('labels a timed task later today', () => {
    expect(formatDueDate(new Date('2026-08-31T22:00:00Z'), { ...base, hasTime: true })).toEqual({
      text: 'Today, 18:00',
      tone: 'today',
    });
  });

  it('labels a date-only task due today without inventing a time', () => {
    expect(formatDueDate(new Date('2026-08-31T12:00:00Z'), { ...base, hasTime: false })).toEqual({
      text: 'Today',
      tone: 'today',
    });
  });

  it('treats a passed time today as overdue', () => {
    const label = formatDueDate(new Date('2026-08-31T13:00:00Z'), { ...base, hasTime: true });
    expect(label.tone).toBe('overdue');
    expect(label.text).toBe('Today, 09:00');
  });

  it('does not call a date-only task overdue until its day has passed', () => {
    // 09:00 local on the due day, with "now" at 14:00 local.
    expect(formatDueDate(new Date('2026-08-31T13:00:00Z'), { ...base, hasTime: false }).tone).toBe(
      'today',
    );
  });

  it('names the weekday inside the coming week', () => {
    expect(formatDueDate(new Date('2026-09-04T12:00:00Z'), { ...base, hasTime: false })).toEqual({
      text: 'Friday',
      tone: 'soon',
    });
  });

  it('falls back to a date beyond a week out', () => {
    expect(formatDueDate(new Date('2026-09-20T12:00:00Z'), { ...base, hasTime: false })).toEqual({
      text: '20 Sep',
      tone: 'later',
    });
  });

  it('includes the year only when it differs from the current one', () => {
    expect(formatDueDate(new Date('2027-01-14T12:00:00Z'), { ...base, hasTime: false }).text).toBe(
      '14 Jan 2027',
    );
  });

  it('counts overdue days', () => {
    expect(formatDueDate(new Date('2026-08-26T12:00:00Z'), { ...base, hasTime: false })).toEqual({
      text: '5 days overdue',
      tone: 'overdue',
    });
  });
});

describe('formatDuration', () => {
  it('formats minutes, whole hours, and mixed durations', () => {
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(90)).toBe('1h 30m');
    expect(formatDuration(150)).toBe('2h 30m');
  });
});
