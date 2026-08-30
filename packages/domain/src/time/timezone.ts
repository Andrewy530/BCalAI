/**
 * Time-zone conversion built on `Intl`, with no external dependency.
 *
 * The whole app stores instants in UTC. Users think in wall-clock time in their
 * own zone. These helpers are the only sanctioned bridge between the two, so
 * that DST bugs have exactly one place to live.
 */

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

/** Split an instant into wall-clock parts as seen in `timeZone`. */
export function getZonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') lookup[part.type] = part.value;
  }

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour) % 24,
    minute: Number(lookup.minute),
    second: Number(lookup.second),
    weekday: WEEKDAY_INDEX[lookup.weekday ?? 'Sun'] ?? 0,
  };
}

/**
 * Offset of `timeZone` from UTC at `instant`, in minutes.
 * Positive east of Greenwich (Berlin in summer = +120).
 */
export function getOffsetMinutes(instant: Date, timeZone: string): number {
  const p = getZonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Drop sub-second precision on both sides before differencing.
  return (asIfUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000;
}

/**
 * Convert a wall-clock time in `timeZone` to the instant it refers to.
 *
 * DST edges are resolved the way calendars conventionally do:
 * - "Spring forward" gap (02:30 on a day where 02:00→03:00 never happens):
 *   returns the instant one offset-shift later, i.e. 03:30 local.
 * - "Fall back" overlap (01:30 occurring twice): returns the *first*, earlier
 *   occurrence.
 */
export function zonedWallClockToUtc(
  parts: { year: number; month: number; day: number; hour?: number; minute?: number },
  timeZone: string,
): Date {
  const naive = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    0,
  );

  // First guess using the offset that applies at the naive instant, then
  // re-resolve once because the offset itself may differ at the corrected time.
  const firstOffset = getOffsetMinutes(new Date(naive), timeZone);
  const firstGuess = naive - firstOffset * 60_000;
  const secondOffset = getOffsetMinutes(new Date(firstGuess), timeZone);
  if (secondOffset === firstOffset) return new Date(firstGuess);

  const secondGuess = naive - secondOffset * 60_000;
  // If the second guess round-trips, the wall-clock time is unambiguous there.
  return getOffsetMinutes(new Date(secondGuess), timeZone) === secondOffset
    ? new Date(secondGuess)
    : new Date(firstGuess);
}

/** Minutes elapsed since local midnight in `timeZone`. */
export function minuteOfDay(instant: Date, timeZone: string): number {
  const p = getZonedParts(instant, timeZone);
  return p.hour * 60 + p.minute;
}

/** The instant at which the local day containing `instant` begins. */
export function startOfZonedDay(instant: Date, timeZone: string): Date {
  const p = getZonedParts(instant, timeZone);
  return zonedWallClockToUtc({ year: p.year, month: p.month, day: p.day }, timeZone);
}

/** "2026-08-30" for the local day containing `instant`. */
export function toZonedDateKey(instant: Date, timeZone: string): string {
  const p = getZonedParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Start of the local day `days` after the local day containing `instant`. */
export function addZonedDays(instant: Date, days: number, timeZone: string): Date {
  const p = getZonedParts(instant, timeZone);
  return zonedWallClockToUtc(
    { year: p.year, month: p.month, day: p.day + days, hour: p.hour, minute: p.minute },
    timeZone,
  );
}

/** The device's IANA zone, falling back to UTC where unavailable. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
