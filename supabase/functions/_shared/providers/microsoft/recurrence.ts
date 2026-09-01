import { EdgeError } from '../../errors/index.ts';
import type { ProviderEventInput } from '../types.ts';

import type {
  MicrosoftRecurrence,
  MicrosoftRecurrencePattern,
  MicrosoftRecurrenceRange,
} from './schemas.ts';

type Direction = 'inbound' | 'outbound';
type WeekdayCode = 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA';
type WeekdayName =
  'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
type Ordinal = -1 | 1 | 2 | 3 | 4;

const WEEKDAY_CODES: Record<WeekdayName, WeekdayCode> = {
  sunday: 'SU',
  monday: 'MO',
  tuesday: 'TU',
  wednesday: 'WE',
  thursday: 'TH',
  friday: 'FR',
  saturday: 'SA',
};

const WEEKDAY_NAMES: Record<WeekdayCode, WeekdayName> = {
  SU: 'sunday',
  MO: 'monday',
  TU: 'tuesday',
  WE: 'wednesday',
  TH: 'thursday',
  FR: 'friday',
  SA: 'saturday',
};

const WEEKDAY_ORDER: WeekdayCode[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const GRAPH_INDEXES: Record<string, Ordinal> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  last: -1,
};

const GRAPH_INDEX_NAMES: Record<Ordinal, string> = {
  '-1': 'last',
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
};

/**
 * Graph commonly returns Windows zone names, while the app's recurrence
 * engine uses IANA names. Graph also accepts IANA names for Outlook calendar
 * APIs, so writes preserve the caller's spelling and reads canonicalise the
 * common Windows aliases below. Unknown names are rejected rather than mapped
 * to UTC and silently moving an event.
 */
const WINDOWS_TO_IANA: Record<string, string> = {
  UTC: 'UTC',
  'Dateline Standard Time': 'Etc/GMT+12',
  'UTC-11': 'Etc/GMT+11',
  'Aleutian Standard Time': 'America/Adak',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
  'Alaskan Standard Time': 'America/Anchorage',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Pacific Standard Time (Mexico)': 'America/Tijuana',
  'US Mountain Standard Time': 'America/Phoenix',
  'Mountain Standard Time': 'America/Denver',
  'Mountain Standard Time (Mexico)': 'America/Mazatlan',
  'Central Standard Time': 'America/Chicago',
  'Central Standard Time (Mexico)': 'America/Mexico_City',
  'Canada Central Standard Time': 'America/Regina',
  'Eastern Standard Time': 'America/New_York',
  'US Eastern Standard Time': 'America/Indiana/Indianapolis',
  'SA Pacific Standard Time': 'America/Bogota',
  'Atlantic Standard Time': 'America/Halifax',
  'Newfoundland Standard Time': 'America/St_Johns',
  'E. South America Standard Time': 'America/Sao_Paulo',
  'Argentina Standard Time': 'America/Argentina/Buenos_Aires',
  'Greenland Standard Time': 'America/Godthab',
  'Azores Standard Time': 'Atlantic/Azores',
  'Cape Verde Standard Time': 'Atlantic/Cape_Verde',
  'GMT Standard Time': 'Europe/London',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Romance Standard Time': 'Europe/Paris',
  'Central European Standard Time': 'Europe/Warsaw',
  'South Africa Standard Time': 'Africa/Johannesburg',
  'Egypt Standard Time': 'Africa/Cairo',
  'Turkey Standard Time': 'Europe/Istanbul',
  'Russian Standard Time': 'Europe/Moscow',
  'Arab Standard Time': 'Asia/Riyadh',
  'Arabian Standard Time': 'Asia/Dubai',
  'Iran Standard Time': 'Asia/Tehran',
  'Israel Standard Time': 'Asia/Jerusalem',
  'India Standard Time': 'Asia/Kolkata',
  'Sri Lanka Standard Time': 'Asia/Colombo',
  'Nepal Standard Time': 'Asia/Kathmandu',
  'Pakistan Standard Time': 'Asia/Karachi',
  'Bangladesh Standard Time': 'Asia/Dhaka',
  'China Standard Time': 'Asia/Shanghai',
  'Singapore Standard Time': 'Asia/Singapore',
  'Taipei Standard Time': 'Asia/Taipei',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'Korea Standard Time': 'Asia/Seoul',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'E. Australia Standard Time': 'Australia/Brisbane',
  'Cen. Australia Standard Time': 'Australia/Adelaide',
  'W. Australia Standard Time': 'Australia/Perth',
  'Tasmania Standard Time': 'Australia/Hobart',
  'New Zealand Standard Time': 'Pacific/Auckland',
  'Fiji Standard Time': 'Pacific/Fiji',
  'Tonga Standard Time': 'Pacific/Tongatapu',
};

/** Return an IANA zone usable by Intl and the domain recurrence engine. */
export function microsoftTimeZoneFor(candidate: string): string {
  const mapped = WINDOWS_TO_IANA[candidate] ?? candidate;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: mapped }).format();
  } catch {
    throw new EdgeError('UNKNOWN', 'Microsoft returned an unsupported time zone.', 502);
  }
  return mapped;
}

/** Graph recurrence object → the app's deliberately small RRULE subset. */
export function graphRecurrenceToRRule(
  recurrence: MicrosoftRecurrence | null | undefined,
): string | null {
  if (!recurrence) return null;

  const pattern = recurrence.pattern;
  const range = recurrence.range;
  const interval = positiveOrDefault(pattern.interval, 'interval', 'inbound');
  const parts = [`FREQ=${frequencyForGraphPattern(pattern)}`];

  if (interval > 1) parts.push(`INTERVAL=${interval}`);

  switch (pattern.type) {
    case 'weekly': {
      const days = pattern.daysOfWeek ?? [];
      if (days.length === 0) failTranslation('inbound', 'weekly recurrence has no weekdays');
      parts.push(`BYDAY=${sortWeekdays(days.map((day) => WEEKDAY_CODES[day])).join(',')}`);
      if (pattern.firstDayOfWeek && pattern.firstDayOfWeek !== 'monday') {
        parts.push(`WKST=${WEEKDAY_CODES[pattern.firstDayOfWeek]}`);
      }
      break;
    }
    case 'absoluteMonthly':
      parts.push(`BYMONTHDAY=${boundedField(pattern.dayOfMonth, 'dayOfMonth', 1, 31, 'inbound')}`);
      break;
    case 'relativeMonthly':
      parts.push(relativeByDay(pattern, 'inbound'));
      break;
    case 'absoluteYearly':
      parts.push(`BYMONTH=${boundedField(pattern.month, 'month', 1, 12, 'inbound')}`);
      parts.push(`BYMONTHDAY=${boundedField(pattern.dayOfMonth, 'dayOfMonth', 1, 31, 'inbound')}`);
      break;
    case 'relativeYearly':
      parts.push(`BYMONTH=${boundedField(pattern.month, 'month', 1, 12, 'inbound')}`);
      parts.push(relativeByDay(pattern, 'inbound'));
      break;
    case 'daily':
      break;
  }

  appendGraphRange(parts, range);
  return parts.join(';');
}

/** App RRULE → the structured recurrence object Graph accepts on writes. */
export function rruleToGraphRecurrence(
  input: Pick<ProviderEventInput, 'recurrenceRule' | 'startAt' | 'timezone'>,
): MicrosoftRecurrence | null {
  if (!input.recurrenceRule) return null;

  let timeZone: string;
  try {
    timeZone = microsoftTimeZoneFor(input.timezone);
  } catch {
    throw new EdgeError('VALIDATION_FAILED', 'This event has an unsupported time zone.', 400);
  }

  const local = localDateParts(input.startAt, timeZone);
  const rule = parseRRuleForGraph(input.recurrenceRule);
  const pattern = graphPatternForRule(rule, local);
  const range: MicrosoftRecurrenceRange = {
    type: rule.count !== undefined ? 'numbered' : rule.untilDate ? 'endDate' : 'noEnd',
    startDate: local.date,
    recurrenceTimeZone: timeZone,
    ...(rule.count === undefined ? {} : { numberOfOccurrences: rule.count }),
    ...(rule.untilDate === undefined ? {} : { endDate: rule.untilDate }),
  };

  return { pattern, range };
}

export function localDateParts(
  iso: string,
  timeZone: string,
): { date: string; year: number; month: number; day: number; weekday: WeekdayCode } {
  const instant = new Date(iso);
  if (!Number.isFinite(instant.getTime())) {
    throw new EdgeError('VALIDATION_FAILED', 'This event has an invalid start time.', 400);
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const values: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }

  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  if (!isValidDate(year, month, day)) {
    throw new EdgeError('VALIDATION_FAILED', 'This event has an invalid start date.', 400);
  }

  const weekday = WEEKDAY_ORDER[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  if (!weekday)
    throw new EdgeError('VALIDATION_FAILED', 'This event has an invalid start date.', 400);

  return {
    date: `${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    year,
    month,
    day,
    weekday,
  };
}

function frequencyForGraphPattern(pattern: MicrosoftRecurrencePattern): Frequency {
  switch (pattern.type) {
    case 'daily':
      return 'DAILY';
    case 'weekly':
      return 'WEEKLY';
    case 'absoluteMonthly':
    case 'relativeMonthly':
      return 'MONTHLY';
    case 'absoluteYearly':
    case 'relativeYearly':
      return 'YEARLY';
  }

  failTranslation('inbound', 'recurrence pattern is unsupported');
}

function relativeByDay(pattern: MicrosoftRecurrencePattern, direction: Direction): string {
  const days = pattern.daysOfWeek ?? [];
  if (days.length !== 1) failTranslation(direction, 'relative recurrence must name one weekday');
  const day = days[0];
  if (!day) failTranslation(direction, 'relative recurrence has no weekday');
  const index = pattern.index;
  if (!index) failTranslation(direction, 'relative recurrence has no ordinal');
  const ordinal = GRAPH_INDEXES[index];
  if (ordinal === undefined)
    failTranslation(direction, 'relative recurrence has an invalid ordinal');
  return `BYDAY=${ordinal}${WEEKDAY_CODES[day]}`;
}

function appendGraphRange(parts: string[], range: MicrosoftRecurrenceRange): void {
  if (!range.startDate || !isValidDateString(range.startDate)) {
    failTranslation('inbound', 'recurrence range has an invalid start date');
  }

  switch (range.type) {
    case 'noEnd':
      return;
    case 'endDate':
      if (!range.endDate || !isValidDateString(range.endDate)) {
        failTranslation('inbound', 'recurrence range has an invalid end date');
      }
      if (range.endDate < range.startDate) {
        failTranslation('inbound', 'recurrence range ends before it starts');
      }
      parts.push(`UNTIL=${range.endDate.replaceAll('-', '')}`);
      return;
    case 'numbered':
      parts.push(
        `COUNT=${positiveField(range.numberOfOccurrences, 'numberOfOccurrences', 'inbound')}`,
      );
      return;
  }
}

interface ParsedRRule {
  freq: Frequency;
  interval: number;
  count?: number;
  untilDate?: string;
  byDay: Array<{ code: WeekdayCode; ordinal?: Ordinal }>;
  byMonthDay: number[];
  byMonth: number[];
  wkst: WeekdayCode;
}

function parseRRuleForGraph(input: string): ParsedRRule {
  const body = input
    .trim()
    .replace(/^RRULE:/i, '')
    .trim();
  if (!body) failTranslation('outbound', 'recurrence rule is empty');

  const fields = new Map<string, string>();
  for (const segment of body.split(';')) {
    const equals = segment.indexOf('=');
    if (equals <= 0 || equals !== segment.lastIndexOf('=')) {
      failTranslation('outbound', 'recurrence rule is malformed');
    }
    const key = segment.slice(0, equals).toUpperCase();
    const value = segment.slice(equals + 1).toUpperCase();
    if (!value || fields.has(key)) failTranslation('outbound', 'recurrence rule is malformed');
    if (
      !['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'WKST'].includes(
        key,
      )
    ) {
      failTranslation('outbound', 'recurrence rule uses an unsupported part');
    }
    fields.set(key, value);
  }

  const frequency = fields.get('FREQ');
  if (
    frequency !== 'DAILY' &&
    frequency !== 'WEEKLY' &&
    frequency !== 'MONTHLY' &&
    frequency !== 'YEARLY'
  ) {
    failTranslation('outbound', 'recurrence rule uses an unsupported frequency');
  }

  const interval = fields.has('INTERVAL') ? parsePositiveInteger(fields.get('INTERVAL')) : 1;
  if (interval === undefined) failTranslation('outbound', 'recurrence interval is invalid');
  const count = fields.has('COUNT') ? parsePositiveInteger(fields.get('COUNT')) : undefined;
  if (fields.has('COUNT') && count === undefined)
    failTranslation('outbound', 'recurrence count is invalid');

  const untilDate = fields.has('UNTIL') ? parseDateOnlyUntil(fields.get('UNTIL')) : undefined;
  if (fields.has('UNTIL') && !untilDate) {
    failTranslation('outbound', 'Graph only supports a date-only recurrence end');
  }
  if (count !== undefined && untilDate !== undefined) {
    failTranslation('outbound', 'Graph cannot combine a recurrence count and end date');
  }

  const byDay = fields.has('BYDAY') ? parseByDay(fields.get('BYDAY') as string) : [];
  const byMonthDay = fields.has('BYMONTHDAY')
    ? parsePositiveList(fields.get('BYMONTHDAY') as string, 1, 31)
    : [];
  const byMonth = fields.has('BYMONTH')
    ? parsePositiveList(fields.get('BYMONTH') as string, 1, 12)
    : [];
  const wkst = fields.has('WKST') ? parseWeekday(fields.get('WKST') as string) : 'MO';

  if (fields.has('WKST') && frequency !== 'WEEKLY') {
    failTranslation('outbound', 'WKST is only supported for weekly recurrence');
  }
  validateRuleShape(frequency, byDay, byMonthDay, byMonth);

  return {
    freq: frequency,
    interval,
    ...(count === undefined ? {} : { count }),
    ...(untilDate === undefined ? {} : { untilDate }),
    byDay,
    byMonthDay,
    byMonth,
    wkst,
  };
}

function graphPatternForRule(
  rule: ParsedRRule,
  local: { month: number; day: number; weekday: WeekdayCode },
): MicrosoftRecurrencePattern {
  switch (rule.freq) {
    case 'DAILY':
      return { type: 'daily', interval: rule.interval };
    case 'WEEKLY':
      return {
        type: 'weekly',
        interval: rule.interval,
        daysOfWeek: (rule.byDay.length > 0
          ? rule.byDay.map((day) => day.code)
          : [local.weekday]
        ).map((day) => WEEKDAY_NAMES[day]),
        firstDayOfWeek: WEEKDAY_NAMES[rule.wkst],
      };
    case 'MONTHLY':
      if (rule.byDay.length > 0) {
        const day = rule.byDay[0];
        if (!day?.ordinal)
          failTranslation('outbound', 'monthly weekday recurrence needs an ordinal');
        return {
          type: 'relativeMonthly',
          interval: rule.interval,
          daysOfWeek: [WEEKDAY_NAMES[day.code]],
          index: GRAPH_INDEX_NAMES[day.ordinal] as MicrosoftRecurrencePattern['index'],
        };
      }
      return {
        type: 'absoluteMonthly',
        interval: rule.interval,
        dayOfMonth: rule.byMonthDay[0] ?? local.day,
      };
    case 'YEARLY': {
      const month = rule.byMonth[0] ?? local.month;
      if (rule.byDay.length > 0) {
        const day = rule.byDay[0];
        if (!day?.ordinal)
          failTranslation('outbound', 'yearly weekday recurrence needs an ordinal');
        return {
          type: 'relativeYearly',
          interval: rule.interval,
          month,
          daysOfWeek: [WEEKDAY_NAMES[day.code]],
          index: GRAPH_INDEX_NAMES[day.ordinal] as MicrosoftRecurrencePattern['index'],
        };
      }
      return {
        type: 'absoluteYearly',
        interval: rule.interval,
        month,
        dayOfMonth: rule.byMonthDay[0] ?? local.day,
      };
    }
  }

  failTranslation('outbound', 'recurrence frequency is unsupported');
}

function validateRuleShape(
  frequency: Frequency,
  byDay: Array<{ code: WeekdayCode; ordinal?: Ordinal }>,
  byMonthDay: number[],
  byMonth: number[],
): void {
  if (frequency === 'DAILY' && (byDay.length > 0 || byMonthDay.length > 0 || byMonth.length > 0)) {
    failTranslation('outbound', 'daily recurrence has unsupported selectors');
  }
  if (frequency === 'WEEKLY') {
    if (
      byMonthDay.length > 0 ||
      byMonth.length > 0 ||
      byDay.some((day) => day.ordinal !== undefined)
    ) {
      failTranslation('outbound', 'weekly recurrence has unsupported selectors');
    }
  }
  if (frequency === 'MONTHLY') {
    const relative = byDay.length > 0;
    if (
      byMonth.length > 0 ||
      byMonthDay.length > 1 ||
      (relative &&
        (byMonthDay.length > 0 || byDay.length !== 1 || byDay[0]?.ordinal === undefined)) ||
      (!relative && byDay.length > 0)
    ) {
      failTranslation('outbound', 'monthly recurrence cannot be represented by Graph');
    }
  }
  if (frequency === 'YEARLY') {
    if (
      byMonth.length > 1 ||
      byMonthDay.length > 1 ||
      byDay.length > 1 ||
      (byDay.length > 0 && byDay[0]?.ordinal === undefined) ||
      (byDay.length > 0 && byMonthDay.length > 0)
    ) {
      failTranslation('outbound', 'yearly recurrence cannot be represented by Graph');
    }
  }
}

function parseByDay(value: string): Array<{ code: WeekdayCode; ordinal?: Ordinal }> {
  const seen = new Set<string>();
  const result: Array<{ code: WeekdayCode; ordinal?: Ordinal }> = [];
  for (const token of value.split(',')) {
    const match = /^(-?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(token);
    if (!match || seen.has(token)) failTranslation('outbound', 'recurrence weekday is invalid');
    seen.add(token);
    const ordinal = match[1] === undefined ? undefined : Number(match[1]);
    if (ordinal !== undefined && ordinal !== -1 && (ordinal < 1 || ordinal > 4)) {
      failTranslation('outbound', 'recurrence weekday ordinal is unsupported');
    }
    result.push({
      code: match[2] as WeekdayCode,
      ...(ordinal === undefined ? {} : { ordinal: ordinal as Ordinal }),
    });
  }
  return result;
}

function parsePositiveList(value: string, min: number, max: number): number[] {
  const values = value.split(',').map((part) => Number(part));
  if (
    values.length === 0 ||
    values.some((value) => !Number.isSafeInteger(value) || value < min || value > max) ||
    new Set(values).size !== values.length
  ) {
    failTranslation('outbound', 'recurrence selector is invalid');
  }
  return values;
}

function parseWeekday(value: string): WeekdayCode {
  if (!WEEKDAY_ORDER.includes(value as WeekdayCode))
    failTranslation('outbound', 'recurrence week start is invalid');
  return value as WeekdayCode;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseDateOnlyUntil(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (!match) return undefined;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  return isValidDateString(date) ? date : undefined;
}

function positiveOrDefault(
  value: number | null | undefined,
  field: string,
  direction: Direction,
): number {
  if (value === null || value === undefined) return 1;
  return positiveField(value, field, direction);
}

function positiveField(
  value: number | null | undefined,
  field: string,
  direction: Direction,
): number {
  if (value === null || value === undefined || !Number.isSafeInteger(value) || value <= 0) {
    failTranslation(direction, `${field} is invalid`);
  }
  return value;
}

function boundedField(
  value: number | null | undefined,
  field: string,
  min: number,
  max: number,
  direction: Direction,
): number {
  if (
    value === null ||
    value === undefined ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    failTranslation(direction, `${field} is invalid`);
  }
  return value;
}

function sortWeekdays(days: WeekdayCode[]): WeekdayCode[] {
  return [...new Set(days)].sort(
    (left, right) => WEEKDAY_ORDER.indexOf(left) - WEEKDAY_ORDER.indexOf(right),
  );
}

function isValidDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? isValidDate(Number(match[1]), Number(match[2]), Number(match[3])) : false;
}

function isValidDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function failTranslation(direction: Direction, _detail: string): never {
  if (direction === 'outbound') {
    throw new EdgeError(
      'VALIDATION_FAILED',
      'This recurrence cannot be represented in Microsoft.',
      400,
    );
  }
  throw new EdgeError('UNKNOWN', 'Microsoft returned an unsupported recurrence.', 502);
}
