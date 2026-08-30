/**
 * A deliberately small RFC 5545 RRULE subset.
 *
 * Supported: FREQ (DAILY|WEEKLY|MONTHLY|YEARLY), INTERVAL, COUNT, UNTIL,
 * BYDAY (weekly), BYMONTHDAY (monthly).
 *
 * That covers what the app's own recurrence editor can produce. Anything more
 * exotic arrives only from Google or Microsoft, and those are stored verbatim
 * and expanded by the provider — we never silently reinterpret a rule we do
 * not fully understand. `parseRRule` returns null for those, and the caller
 * treats the event as a single occurrence rather than guessing.
 */

export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

/** 0 = Sunday … 6 = Saturday, matching Date#getUTCDay. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface RecurrenceRule {
  freq: Frequency;
  interval: number;
  count?: number;
  /** Inclusive end instant. */
  until?: Date;
  /** Weekly only. Empty means "same weekday as the start". */
  byDay: Weekday[];
  /** Monthly only. Empty means "same day-of-month as the start". */
  byMonthDay: number[];
}

const DAY_CODES: Record<string, Weekday> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

const DAY_NAMES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

const SUPPORTED_PARTS = new Set([
  'FREQ',
  'INTERVAL',
  'COUNT',
  'UNTIL',
  'BYDAY',
  'BYMONTHDAY',
  'WKST',
]);

/**
 * Parse an RRULE string. Returns null when the rule is malformed *or* uses a
 * part we do not implement — an unknown part must never be silently dropped,
 * because dropping BYSETPOS or EXDATE would generate occurrences that should
 * not exist.
 */
export function parseRRule(input: string): RecurrenceRule | null {
  const body = input.trim().replace(/^RRULE:/i, '');
  if (!body) return null;

  const parts = new Map<string, string>();
  for (const segment of body.split(';')) {
    if (!segment) continue;
    const [rawKey, rawValue] = segment.split('=');
    if (!rawKey || rawValue === undefined) return null;

    const key = rawKey.toUpperCase();
    if (!SUPPORTED_PARTS.has(key)) return null;
    parts.set(key, rawValue.toUpperCase());
  }

  const freq = parts.get('FREQ');
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') {
    return null;
  }

  const interval = parts.has('INTERVAL') ? Number(parts.get('INTERVAL')) : 1;
  if (!Number.isInteger(interval) || interval < 1) return null;

  let count: number | undefined;
  if (parts.has('COUNT')) {
    count = Number(parts.get('COUNT'));
    if (!Number.isInteger(count) || count < 1) return null;
  }

  let until: Date | undefined;
  if (parts.has('UNTIL')) {
    const parsedUntil = parseUntil(parts.get('UNTIL') as string);
    if (!parsedUntil) return null;
    until = parsedUntil;
  }

  // COUNT and UNTIL are mutually exclusive under RFC 5545.
  if (count !== undefined && until !== undefined) return null;

  const byDay: Weekday[] = [];
  if (parts.has('BYDAY')) {
    if (freq !== 'WEEKLY') return null; // Positional BYDAY is not implemented.
    for (const token of (parts.get('BYDAY') as string).split(',')) {
      const day = DAY_CODES[token];
      if (day === undefined) return null;
      byDay.push(day);
    }
  }

  const byMonthDay: number[] = [];
  if (parts.has('BYMONTHDAY')) {
    if (freq !== 'MONTHLY') return null;
    for (const token of (parts.get('BYMONTHDAY') as string).split(',')) {
      const day = Number(token);
      if (!Number.isInteger(day) || day < 1 || day > 31) return null;
      byMonthDay.push(day);
    }
  }

  return { freq, interval, count, until, byDay, byMonthDay };
}

/** UNTIL is either `YYYYMMDD` or `YYYYMMDDTHHMMSSZ`. */
function parseUntil(value: string): Date | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour ?? 23),
      Number(minute ?? 59),
      Number(second ?? 59),
    ),
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatRRule(rule: RecurrenceRule): string {
  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.byDay.length > 0) {
    parts.push(`BYDAY=${rule.byDay.map((day) => DAY_NAMES[day]).join(',')}`);
  }
  if (rule.byMonthDay.length > 0) parts.push(`BYMONTHDAY=${rule.byMonthDay.join(',')}`);
  if (rule.count !== undefined) parts.push(`COUNT=${rule.count}`);
  if (rule.until) parts.push(`UNTIL=${toUntilString(rule.until)}`);
  return parts.join(';');
}

function toUntilString(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** Plain-English summary for the event editor. */
export function describeRRule(rule: RecurrenceRule): string {
  const every = rule.interval === 1 ? '' : ` ${ordinal(rule.interval)}`;

  let base: string;
  switch (rule.freq) {
    case 'DAILY':
      base = rule.interval === 1 ? 'Every day' : `Every${every} day`;
      break;
    case 'WEEKLY':
      base =
        rule.byDay.length > 0
          ? `Every${every} week on ${rule.byDay.map(weekdayName).join(', ')}`
          : rule.interval === 1
            ? 'Every week'
            : `Every${every} week`;
      break;
    case 'MONTHLY':
      base = rule.interval === 1 ? 'Every month' : `Every${every} month`;
      break;
    case 'YEARLY':
      base = rule.interval === 1 ? 'Every year' : `Every${every} year`;
      break;
  }

  if (rule.count !== undefined) return `${base}, ${rule.count} times`;
  if (rule.until) {
    const until = rule.until;
    return `${base}, until ${until.getUTCDate()} ${MONTHS[until.getUTCMonth()]} ${until.getUTCFullYear()}`;
  }
  return base;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const weekdayName = (day: Weekday): string => WEEKDAY_NAMES[day] ?? '';

function ordinal(value: number): string {
  const suffix =
    value % 100 >= 11 && value % 100 <= 13
      ? 'th'
      : value % 10 === 1
        ? 'st'
        : value % 10 === 2
          ? 'nd'
          : value % 10 === 3
            ? 'rd'
            : 'th';
  return `${value}${suffix}`;
}

/** Presets the event editor offers. */
export const RECURRENCE_PRESETS: { label: string; rrule: string | null }[] = [
  { label: 'Does not repeat', rrule: null },
  { label: 'Every day', rrule: 'FREQ=DAILY' },
  { label: 'Every week', rrule: 'FREQ=WEEKLY' },
  { label: 'Weekdays', rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { label: 'Every 2 weeks', rrule: 'FREQ=WEEKLY;INTERVAL=2' },
  { label: 'Every month', rrule: 'FREQ=MONTHLY' },
  { label: 'Every year', rrule: 'FREQ=YEARLY' },
];
