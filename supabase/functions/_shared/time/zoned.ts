/**
 * Wall-clock ↔ instant conversion for the Edge runtime.
 *
 * This mirrors `packages/domain/src/time/timezone.ts` rather than importing it:
 * Deno resolves modules by URL and the domain package uses extensionless
 * relative imports, so it cannot be consumed here without a bundling step.
 * The surface is kept deliberately tiny — only what provider normalisation
 * needs — so the two copies cannot drift in any way that matters.
 *
 * It exists because Google expresses an all-day event as a pair of calendar
 * dates with no offset. "2026-03-29" in Europe/Berlin is a different instant
 * than in UTC, and on a DST boundary it is not even 24 hours long.
 */

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
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

/** Offset of `timeZone` from UTC at `instant`, in minutes. East is positive. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const lookup: Record<string, string> = {};
  for (const part of formatterFor(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') lookup[part.type] = part.value;
  }

  const asIfUtc = Date.UTC(
    Number(lookup.year),
    Number(lookup.month) - 1,
    Number(lookup.day),
    Number(lookup.hour) % 24,
    Number(lookup.minute),
    Number(lookup.second),
  );

  return (asIfUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000;
}

/**
 * The instant at which a wall-clock time in `timeZone` occurs.
 *
 * Resolved in two passes because the offset that applies at the naive UTC
 * reading may not be the offset that applies at the corrected instant — which
 * is exactly what happens on the two days a year a zone shifts.
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

  const firstOffset = offsetMinutes(new Date(naive), timeZone);
  const firstGuess = naive - firstOffset * 60_000;
  const secondOffset = offsetMinutes(new Date(firstGuess), timeZone);
  if (secondOffset === firstOffset) return new Date(firstGuess);

  const secondGuess = naive - secondOffset * 60_000;
  return offsetMinutes(new Date(secondGuess), timeZone) === secondOffset
    ? new Date(secondGuess)
    : new Date(firstGuess);
}

/** "2026-03-29" in `timeZone` → the instant that local day begins. */
export function zonedDateToUtc(isoDate: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new Error('Expected YYYY-MM-DD');

  return zonedWallClockToUtc(
    { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) },
    timeZone,
  );
}

/** A time zone we are willing to hand to `Intl`, or UTC. */
export function safeTimeZone(candidate: string | null | undefined): string {
  if (!candidate) return 'UTC';
  try {
    formatterFor(candidate);
    return candidate;
  } catch {
    return 'UTC';
  }
}
