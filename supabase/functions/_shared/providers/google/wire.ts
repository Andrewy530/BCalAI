/**
 * Small shared readings of Google's wire shapes, kept out of `normalise.ts` so
 * the adapter and the normaliser agree on what "all day" means.
 */

export interface GoogleEventDate {
  date?: string | null;
  dateTime?: string | null;
  timeZone?: string | null;
}

/** Google signals an all-day event by sending `date` instead of `dateTime`. */
export function isAllDay(value: GoogleEventDate | null | undefined): boolean {
  return Boolean(value?.date) && !value?.dateTime;
}
