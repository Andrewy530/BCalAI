/**
 * A deliberately small RFC 5545 RRULE subset.
 *
 * Supported patterns are the six shapes that Microsoft Graph can represent:
 * daily, weekly (plain BYDAY and WKST), absolute monthly/yearly, and one
 * ordinal weekday in a monthly/yearly period. Unsupported combinations return
 * null. Callers must never drop an unsupported part and pretend that the event
 * is a different series.
 */

export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

/** 0 = Sunday … 6 = Saturday, matching Date#getUTCDay. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** The relative weekday positions supported by Graph and this domain. */
export type ByDayOrdinal = -1 | 1 | 2 | 3 | 4;

export interface ByDay {
  weekday: Weekday;
  ordinal?: ByDayOrdinal;
}

/** UNTIL must retain whether the source specified a local calendar date or UTC. */
export type RecurrenceUntil =
  { kind: 'date'; year: number; month: number; day: number } | { kind: 'instant'; value: Date };

export interface RecurrenceRule {
  freq: Frequency;
  interval: number;
  count?: number;
  /** Inclusive end, either a local calendar date or a UTC instant. */
  until?: RecurrenceUntil;
  /** WEEKLY plain weekdays, or one ordinal weekday for MONTHLY/YEARLY. */
  byDay: ByDay[];
  /** Positive day-of-month values for absolute MONTHLY/YEARLY rules. */
  byMonthDay: number[];
  /** One month (1–12) for YEARLY rules, or empty. */
  byMonth: number[];
  /** RFC week start. RFC's default is Monday. */
  wkst: Weekday;
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
  'BYMONTH',
  'WKST',
]);

/**
 * Parse an RRULE string. Returns null when the rule is malformed or uses a
 * combination this domain does not implement. Duplicate properties are
 * rejected rather than silently overwritten.
 */
export function parseRRule(input: string): RecurrenceRule | null {
  const body = input
    .trim()
    .replace(/^RRULE:/i, '')
    .trim();
  if (!body) return null;

  const parts = new Map<string, string>();
  for (const segment of body.split(';')) {
    const equals = segment.indexOf('=');
    if (equals <= 0 || equals !== segment.lastIndexOf('=')) return null;

    const key = segment.slice(0, equals).toUpperCase();
    const value = segment.slice(equals + 1).toUpperCase();
    if (!value || !SUPPORTED_PARTS.has(key) || parts.has(key)) return null;
    parts.set(key, value);
  }

  const freq = parts.get('FREQ');
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') {
    return null;
  }

  const interval = parts.has('INTERVAL') ? parsePositiveInteger(parts.get('INTERVAL')) : 1;
  if (interval === null) return null;

  const count = parts.has('COUNT') ? parsePositiveInteger(parts.get('COUNT')) : undefined;
  if (parts.has('COUNT') && count === null) return null;

  const until = parts.has('UNTIL') ? parseUntil(parts.get('UNTIL') as string) : undefined;
  if (parts.has('UNTIL') && until === null) return null;
  if (count !== undefined && until !== undefined) return null;

  const byDay = parts.has('BYDAY') ? parseByDay(parts.get('BYDAY') as string) : [];
  if (byDay === null) return null;

  const byMonthDay = parts.has('BYMONTHDAY')
    ? parsePositiveList(parts.get('BYMONTHDAY') as string, 1, 31)
    : [];
  if (byMonthDay === null) return null;

  const byMonth = parts.has('BYMONTH')
    ? parsePositiveList(parts.get('BYMONTH') as string, 1, 12)
    : [];
  if (byMonth === null || byMonth.length > 1) return null;

  const wkst = parts.has('WKST') ? DAY_CODES[parts.get('WKST') as string] : 1;
  if (wkst === undefined) return null;

  if (!isSupportedShape(freq, byDay, byMonthDay, byMonth, parts.has('WKST'))) return null;

  return {
    freq,
    interval,
    count: count ?? undefined,
    until: until ?? undefined,
    byDay,
    byMonthDay,
    byMonth,
    wkst,
  };
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parsePositiveList(value: string, min: number, max: number): number[] | null {
  const tokens = value.split(',');
  if (tokens.length === 0 || tokens.some((token) => !/^\d+$/.test(token))) return null;

  const values = tokens.map(Number);
  if (
    values.some((number) => !Number.isSafeInteger(number) || number < min || number > max) ||
    new Set(values).size !== values.length
  ) {
    return null;
  }
  return values;
}

function parseByDay(value: string): ByDay[] | null {
  const tokens = value.split(',');
  if (tokens.length === 0) return null;

  const result: ByDay[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const match = /^(-?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(token);
    if (!match) return null;

    if (seen.has(token)) return null;
    seen.add(token);

    const ordinalValue = match[1] === undefined ? undefined : Number(match[1]);
    if (
      ordinalValue !== undefined &&
      ordinalValue !== -1 &&
      ordinalValue !== 1 &&
      ordinalValue !== 2 &&
      ordinalValue !== 3 &&
      ordinalValue !== 4
    ) {
      return null;
    }

    result.push({
      weekday: DAY_CODES[match[2] as string] as Weekday,
      ...(ordinalValue === undefined ? {} : { ordinal: ordinalValue as ByDayOrdinal }),
    });
  }
  return result;
}

/** UNTIL is either YYYYMMDD or a UTC instant YYYYMMDDTHHMMSSZ. */
function parseUntil(value: string): RecurrenceUntil | null {
  const dateMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (dateMatch) {
    const [, yearText, monthText, dayText] = dateMatch;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    return isValidDate(year, month, day) ? { kind: 'date', year, month, day } : null;
  }

  const instantMatch = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (!instantMatch) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = instantMatch;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (!isValidDate(year, month, day) || hour > 23 || minute > 59 || second > 59) return null;

  return { kind: 'instant', value: new Date(Date.UTC(year, month - 1, day, hour, minute, second)) };
}

function isValidShapeDay(day: ByDay, allowOrdinal: boolean): boolean {
  return allowOrdinal ? day.ordinal !== undefined : day.ordinal === undefined;
}

function isSupportedShape(
  freq: Frequency,
  byDay: ByDay[],
  byMonthDay: number[],
  byMonth: number[],
  hasWkst: boolean,
): boolean {
  if (hasWkst && freq !== 'WEEKLY') return false;

  switch (freq) {
    case 'DAILY':
      return byDay.length === 0 && byMonthDay.length === 0 && byMonth.length === 0;
    case 'WEEKLY':
      return (
        byMonthDay.length === 0 &&
        byMonth.length === 0 &&
        byDay.every((day) => isValidShapeDay(day, false))
      );
    case 'MONTHLY':
      return (
        byMonth.length === 0 &&
        (byDay.length === 0 ||
          (byMonthDay.length === 0 &&
            byDay.length === 1 &&
            byDay[0] !== undefined &&
            isValidShapeDay(byDay[0], true)))
      );
    case 'YEARLY':
      return (
        (byMonth.length === 1 &&
          ((byDay.length === 0 && byMonthDay.length === 1) ||
            (byMonthDay.length === 0 &&
              byDay.length === 1 &&
              byDay[0] !== undefined &&
              isValidShapeDay(byDay[0], true)))) ||
        (byMonth.length === 0 && byDay.length === 0 && byMonthDay.length === 0)
      );
  }
}

function isValidDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function formatRRule(rule: RecurrenceRule): string {
  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);

  if (rule.byMonth.length > 0) {
    parts.push(`BYMONTH=${[...rule.byMonth].sort((a, b) => a - b).join(',')}`);
  }
  if (rule.byDay.length > 0) {
    parts.push(`BYDAY=${formatByDay(rule.byDay, rule.wkst)}`);
  }
  if (rule.byMonthDay.length > 0) {
    parts.push(`BYMONTHDAY=${[...rule.byMonthDay].sort((a, b) => a - b).join(',')}`);
  }
  // Monday is RFC 5545's default and omitting it preserves the app's existing
  // preset strings while still retaining a non-default Graph week start.
  if (rule.freq === 'WEEKLY' && rule.wkst !== 1) {
    parts.push(`WKST=${DAY_NAMES[rule.wkst]}`);
  }
  if (rule.count !== undefined) parts.push(`COUNT=${rule.count}`);
  if (rule.until) parts.push(`UNTIL=${formatUntil(rule.until)}`);
  return parts.join(';');
}

function formatByDay(byDay: ByDay[], wkst: Weekday): string {
  return [...byDay]
    .sort((left, right) => weekdayOffset(left.weekday, wkst) - weekdayOffset(right.weekday, wkst))
    .map((day) => `${day.ordinal ?? ''}${DAY_NAMES[day.weekday]}`)
    .join(',');
}

function weekdayOffset(day: Weekday, wkst: Weekday): number {
  return (day - wkst + 7) % 7;
}

function formatUntil(until: RecurrenceUntil): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  if (until.kind === 'date') {
    return `${until.year}${pad(until.month)}${pad(until.day)}`;
  }

  const date = until.value;
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
          ? `Every${every} week on ${rule.byDay.map((day) => weekdayName(day.weekday)).join(', ')}`
          : rule.interval === 1
            ? 'Every week'
            : `Every${every} week`;
      break;
    case 'MONTHLY':
      base = `Every${every} month${describeMonthSelector(rule)}`;
      break;
    case 'YEARLY':
      base = `Every${every} year${describeYearSelector(rule)}`;
      break;
  }

  if (rule.count !== undefined) return `${base}, ${rule.count} times`;
  if (rule.until) return `${base}, until ${describeUntil(rule.until)}`;
  return base;
}

function describeMonthSelector(rule: RecurrenceRule): string {
  if (rule.byMonthDay.length > 0) return ` on day ${rule.byMonthDay.join(', ')}`;
  const day = rule.byDay[0];
  return day?.ordinal !== undefined
    ? ` on the ${ordinalWord(day.ordinal)} ${weekdayName(day.weekday)}`
    : '';
}

function describeYearSelector(rule: RecurrenceRule): string {
  const month = rule.byMonth[0];
  const monthName = month === undefined ? '' : ` in ${MONTHS[month - 1]}`;
  const day = rule.byDay[0];
  if (day?.ordinal !== undefined) {
    return ` on the ${ordinalWord(day.ordinal)} ${weekdayName(day.weekday)}${monthName}`;
  }
  if (rule.byMonthDay.length > 0) {
    return month === undefined
      ? ` on day ${rule.byMonthDay[0]}`
      : ` on ${rule.byMonthDay[0]} ${MONTHS[month - 1]}`;
  }
  return '';
}

function describeUntil(until: RecurrenceUntil): string {
  const date = until.kind === 'date' ? until : datePartsFromUtc(until.value);
  return `${date.day} ${MONTHS[date.month - 1]} ${date.year}`;
}

function datePartsFromUtc(date: Date): { year: number; month: number; day: number } {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
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

function ordinalWord(value: ByDayOrdinal): string {
  if (value === -1) return 'last';
  return ordinal(value);
}

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
