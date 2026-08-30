import { z } from 'zod';

/**
 * Google Calendar wire formats.
 *
 * AGENTS.md requires every external input to be validated, and a provider
 * response is external input. These schemas are intentionally *permissive*
 * about fields we do not use — Google adds fields over time and a strict schema
 * would turn a harmless API addition into a sync outage — but strict about the
 * fields we do read.
 */

export const googleTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
  id_token: z.string().optional(),
});

export const googleUserInfoSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email().nullish(),
});

export const googleCalendarListEntrySchema = z.object({
  id: z.string().min(1),
  summary: z.string().nullish(),
  summaryOverride: z.string().nullish(),
  description: z.string().nullish(),
  backgroundColor: z.string().nullish(),
  primary: z.boolean().nullish(),
  deleted: z.boolean().nullish(),
  timeZone: z.string().nullish(),
  /** owner | writer | reader | freeBusyReader */
  accessRole: z.string().nullish(),
});

export const googleCalendarListSchema = z.object({
  items: z.array(googleCalendarListEntrySchema).nullish(),
  nextPageToken: z.string().nullish(),
});

/** Either `date` (all-day) or `dateTime`; Google never sends both. */
export const googleEventDateSchema = z.object({
  date: z.string().nullish(),
  dateTime: z.string().nullish(),
  timeZone: z.string().nullish(),
});

export const googleReminderSchema = z.object({
  method: z.string().nullish(),
  minutes: z.number().int().nullish(),
});

export const googleEventSchema = z.object({
  id: z.string().min(1),
  etag: z.string().nullish(),
  status: z.string().nullish(),
  summary: z.string().nullish(),
  description: z.string().nullish(),
  location: z.string().nullish(),
  updated: z.string().nullish(),
  created: z.string().nullish(),
  start: googleEventDateSchema.nullish(),
  end: googleEventDateSchema.nullish(),
  recurrence: z.array(z.string()).nullish(),
  recurringEventId: z.string().nullish(),
  transparency: z.string().nullish(),
  reminders: z
    .object({
      useDefault: z.boolean().nullish(),
      overrides: z.array(googleReminderSchema).nullish(),
    })
    .nullish(),
});

export const googleEventsListSchema = z.object({
  items: z.array(googleEventSchema).nullish(),
  nextPageToken: z.string().nullish(),
  nextSyncToken: z.string().nullish(),
  timeZone: z.string().nullish(),
});

export const googleWatchResponseSchema = z.object({
  id: z.string().min(1),
  resourceId: z.string().min(1),
  /** Milliseconds since epoch, as a string. Google's own encoding. */
  expiration: z.string().nullish(),
});

export type GoogleEvent = z.infer<typeof googleEventSchema>;
export type GoogleCalendarListEntry = z.infer<typeof googleCalendarListEntrySchema>;
export type GoogleTokenResponse = z.infer<typeof googleTokenResponseSchema>;
