import { z } from 'zod';

/** Microsoft identity platform token success payload. */
export const microsoftTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  token_type: z.string().min(1).optional(),
});

/** Machine-readable token error fields; descriptions are intentionally ignored. */
export const microsoftTokenErrorSchema = z.object({
  error: z.string().min(1).optional(),
  error_description: z.string().optional(),
});

/** The small identity projection requested from Microsoft Graph `/me`. */
export const microsoftUserInfoSchema = z.object({
  id: z.string().min(1),
  mail: z.string().min(1).nullable().optional(),
  userPrincipalName: z.string().min(1).nullable().optional(),
});

const graphWeekdaySchema = z.enum([
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]);

const recurrenceIndexSchema = z.enum(['first', 'second', 'third', 'fourth', 'last']);

/** Graph's local date/time pair. The value may be an IANA or Windows zone. */
export const microsoftDateTimeTimeZoneSchema = z
  .object({
    dateTime: z.string().min(1),
    timeZone: z.string().min(1).nullish(),
  })
  .passthrough();

export const microsoftRecurrencePatternSchema = z
  .object({
    type: z.enum([
      'daily',
      'weekly',
      'absoluteMonthly',
      'relativeMonthly',
      'absoluteYearly',
      'relativeYearly',
    ]),
    interval: z.number().int().nonnegative().nullish(),
    month: z.number().int().nonnegative().nullish(),
    dayOfMonth: z.number().int().nonnegative().nullish(),
    daysOfWeek: z.array(graphWeekdaySchema).nullish(),
    firstDayOfWeek: graphWeekdaySchema.nullish(),
    index: recurrenceIndexSchema.nullish(),
  })
  .passthrough();

export const microsoftRecurrenceRangeSchema = z
  .object({
    type: z.enum(['endDate', 'noEnd', 'numbered']),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullish(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullish(),
    recurrenceTimeZone: z.string().min(1).nullish(),
    numberOfOccurrences: z.number().int().nonnegative().nullish(),
  })
  .passthrough();

export const microsoftRecurrenceSchema = z
  .object({
    pattern: microsoftRecurrencePatternSchema,
    range: microsoftRecurrenceRangeSchema,
  })
  .passthrough();

export const microsoftCalendarSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().nullish(),
    color: z.string().nullish(),
    hexColor: z.string().nullish(),
    isDefaultCalendar: z.boolean().nullish(),
    canEdit: z.boolean().nullish(),
    timeZone: z.string().nullish(),
  })
  .passthrough();

export const microsoftCalendarListSchema = z
  .object({
    value: z.array(microsoftCalendarSchema),
    '@odata.nextLink': z.string().url().nullish(),
  })
  .passthrough();

/** A tombstone is an event-shaped object with only an id and `@removed`. */
export const microsoftRemovedSchema = z
  .object({ reason: z.string().min(1).nullish() })
  .passthrough();

export const microsoftEventSchema = z
  .object({
    id: z.string().min(1),
    '@odata.etag': z.string().min(1).nullish(),
    changeKey: z.string().min(1).nullish(),
    subject: z.string().nullish(),
    bodyPreview: z.string().nullish(),
    body: z
      .object({
        contentType: z.string().min(1).nullish(),
        content: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
    location: z.object({ displayName: z.string().nullish() }).passthrough().nullish(),
    start: microsoftDateTimeTimeZoneSchema.nullish(),
    end: microsoftDateTimeTimeZoneSchema.nullish(),
    isAllDay: z.boolean().nullish(),
    isCancelled: z.boolean().nullish(),
    showAs: z.enum(['free', 'tentative', 'busy', 'oof', 'workingElsewhere', 'unknown']).nullish(),
    type: z.enum(['singleInstance', 'occurrence', 'exception', 'seriesMaster']).nullish(),
    seriesMasterId: z.string().min(1).nullish(),
    originalStart: z.string().nullish(),
    originalStartTimeZone: z.string().min(1).nullish(),
    recurrence: microsoftRecurrenceSchema.nullish(),
    reminderMinutesBeforeStart: z.number().int().nonnegative().nullish(),
    isReminderOn: z.boolean().nullish(),
    lastModifiedDateTime: z.string().nullish(),
    '@removed': microsoftRemovedSchema.nullish(),
  })
  .passthrough();

export const microsoftEventsDeltaSchema = z
  .object({
    value: z.array(microsoftEventSchema),
    '@odata.nextLink': z.string().url().nullish(),
    '@odata.deltaLink': z.string().url().nullish(),
  })
  .passthrough();

export const microsoftSubscriptionSchema = z
  .object({
    id: z.string().min(1),
    resource: z.string().min(1),
    changeType: z.string().min(1).nullish(),
    notificationUrl: z.string().url().nullish(),
    lifecycleNotificationUrl: z.string().url().nullish(),
    expirationDateTime: z.string().min(1),
    clientState: z.string().min(1).nullish(),
  })
  .passthrough();

export const microsoftWebhookNotificationSchema = z
  .object({
    subscriptionId: z.string().min(1),
    clientState: z.string().min(1).nullish(),
    changeType: z.string().min(1).nullish(),
    resource: z.string().min(1).nullish(),
    subscriptionExpirationDateTime: z.string().min(1).nullish(),
    lifecycleEvent: z.enum(['reauthorizationRequired', 'subscriptionRemoved', 'missed']).nullish(),
    resourceData: z.unknown().nullish(),
  })
  .passthrough();

export const microsoftWebhookSchema = z
  .object({ value: z.array(microsoftWebhookNotificationSchema) })
  .passthrough();

export type MicrosoftCalendar = z.infer<typeof microsoftCalendarSchema>;
export type MicrosoftEvent = z.infer<typeof microsoftEventSchema>;
export type MicrosoftRecurrence = z.infer<typeof microsoftRecurrenceSchema>;
export type MicrosoftRecurrencePattern = z.infer<typeof microsoftRecurrencePatternSchema>;
export type MicrosoftRecurrenceRange = z.infer<typeof microsoftRecurrenceRangeSchema>;
export type MicrosoftSubscription = z.infer<typeof microsoftSubscriptionSchema>;
export type MicrosoftWebhookNotification = z.infer<typeof microsoftWebhookNotificationSchema>;
