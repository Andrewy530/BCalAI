import { z } from 'zod';

import {
  hexColorSchema,
  isoDateTimeSchema,
  sourceTypeSchema,
  timeZoneSchema,
  uuidSchema,
} from './primitives';

export const calendarSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  name: z.string().min(1).max(120),
  color: hexColorSchema,
  sourceType: sourceTypeSchema,
  providerAccountId: uuidSchema.nullable(),
  providerCalendarId: z.string().nullable(),
  isVisible: z.boolean(),
  isDefault: z.boolean(),
  isReadOnly: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const createCalendarSchema = z.object({
  name: z.string().trim().min(1, 'Name your calendar').max(120),
  color: hexColorSchema,
  isVisible: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});

export const updateCalendarSchema = createCalendarSchema.partial();

export const eventStatusSchema = z.enum(['confirmed', 'tentative', 'cancelled']);
export const syncStatusSchema = z.enum(['synced', 'pending', 'failed', 'conflict']);

/**
 * Minutes before `startAt` at which to fire an alert. -1 is not allowed; use an
 * empty array for "no alert". Matches how both Google and Graph express popup
 * reminders, which keeps provider normalisation lossless.
 */
export const eventAlertSchema = z.number().int().min(0).max(60 * 24 * 28);

export const eventSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  calendarId: uuidSchema,
  title: z.string().min(1).max(300),
  description: z.string().max(10_000).nullable(),
  location: z.string().max(500).nullable(),
  startAt: isoDateTimeSchema,
  endAt: isoDateTimeSchema,
  allDay: z.boolean(),
  timezone: timeZoneSchema,
  status: eventStatusSchema,
  recurrenceRule: z.string().nullable(),
  alerts: z.array(eventAlertSchema).max(5),
  sourceType: sourceTypeSchema,
  providerEventId: z.string().nullable(),
  providerEtag: z.string().nullable(),
  providerUpdatedAt: isoDateTimeSchema.nullable(),
  syncStatus: syncStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

/** End must not precede start. Undefined ends are left to the other schema rules. */
const endsAfterStart = (startAt?: string, endAt?: string): boolean =>
  startAt === undefined ||
  endAt === undefined ||
  new Date(endAt).getTime() >= new Date(startAt).getTime();

export const createEventSchema = z
  .object({
    calendarId: uuidSchema,
    title: z.string().trim().min(1, 'Give the event a title').max(300),
    description: z.string().max(10_000).nullish(),
    location: z.string().max(500).nullish(),
    startAt: isoDateTimeSchema,
    endAt: isoDateTimeSchema,
    allDay: z.boolean().default(false),
    timezone: timeZoneSchema,
    recurrenceRule: z.string().nullish(),
    alerts: z.array(eventAlertSchema).max(5).default([]),
  })
  .refine((value) => endsAfterStart(value.startAt, value.endAt), {
    message: 'The event must end after it starts',
    path: ['endAt'],
  });

export const updateEventSchema = z
  .object({
    id: uuidSchema,
    calendarId: uuidSchema.optional(),
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().max(10_000).nullish(),
    location: z.string().max(500).nullish(),
    startAt: isoDateTimeSchema.optional(),
    endAt: isoDateTimeSchema.optional(),
    allDay: z.boolean().optional(),
    timezone: timeZoneSchema.optional(),
    status: eventStatusSchema.optional(),
    recurrenceRule: z.string().nullish(),
    alerts: z.array(eventAlertSchema).max(5).optional(),
  })
  .refine((value) => endsAfterStart(value.startAt, value.endAt), {
    message: 'The event must end after it starts',
    path: ['endAt'],
  });

export type Calendar = z.infer<typeof calendarSchema>;
export type CreateCalendarInput = z.infer<typeof createCalendarSchema>;
export type UpdateCalendarInput = z.infer<typeof updateCalendarSchema>;
export type CalendarEvent = z.infer<typeof eventSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type EventStatus = z.infer<typeof eventStatusSchema>;
export type SyncStatus = z.infer<typeof syncStatusSchema>;
