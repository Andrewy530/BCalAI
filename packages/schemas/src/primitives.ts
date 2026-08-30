import { z } from 'zod';

/**
 * Shared scalar building blocks. Every domain schema composes these so that
 * "what a valid id / timestamp / colour looks like" is defined exactly once.
 */

export const uuidSchema = z.string().uuid();

/** ISO-8601 instant, always stored and transported in UTC. */
export const isoDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .describe('ISO-8601 timestamp with offset');

/** Calendar date with no time component, e.g. "2026-08-30". */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

/** IANA time zone identifier, e.g. "America/New_York". */
export const timeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => value.includes('/') || value === 'UTC', {
    message: 'Expected an IANA time zone identifier such as America/New_York',
  });

/** Minutes from local midnight, used for working hours. 0..1440 */
export const minuteOfDaySchema = z.number().int().min(0).max(24 * 60);

export const hexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Expected a hex colour such as #4F8DF7');

/** 0 = Sunday … 6 = Saturday, matching JavaScript's Date#getDay. */
export const weekdaySchema = z.number().int().min(0).max(6);

export const hourCycleSchema = z.enum(['h12', 'h23']);

export const sourceTypeSchema = z.enum(['internal', 'google', 'microsoft', 'device']);

export type SourceType = z.infer<typeof sourceTypeSchema>;
export type HourCycle = z.infer<typeof hourCycleSchema>;
