import { z } from 'zod';

import { hexColorSchema, isoDateTimeSchema, uuidSchema } from './primitives';

/**
 * Connected calendar accounts, as the client is allowed to see them.
 *
 * Note what is absent: no token, no secret reference, no sync cursor, and no
 * provider error text. Those columns are revoked from client roles in the
 * database (migration 0004) and this schema is the second expression of the
 * same boundary — if a future policy change ever widened the projection, the
 * parse would fail rather than quietly surfacing a secret.
 */

export const providerKindSchema = z.enum(['google', 'microsoft']);

export const providerStatusSchema = z.enum(['active', 'expired', 'revoked', 'error']);

export const providerAccountSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  provider: providerKindSchema,
  email: z.string().nullable(),
  status: providerStatusSchema,
  scopes: z.array(z.string()),
  connectedAt: isoDateTimeSchema,
  lastSyncAt: isoDateTimeSchema.nullable(),
});

/** A calendar offered by a connected account, plus whether we import it. */
export const externalCalendarSchema = z.object({
  providerCalendarId: z.string().min(1),
  name: z.string().min(1),
  color: hexColorSchema.nullable(),
  isPrimary: z.boolean(),
  /** The provider grants read-only access — importable, but never writable. */
  isReadOnly: z.boolean(),
  timezone: z.string().nullable(),
  isImported: z.boolean(),
  /** The local `calendars` row, once imported. */
  calendarId: uuidSchema.nullable(),
  isVisible: z.boolean(),
});

/**
 * Per-calendar sync health.
 *
 * `hasError` is a boolean rather than a message on purpose: the underlying
 * column holds provider text, which can quote an event title.
 */
export const calendarSyncHealthSchema = z.object({
  calendarId: uuidSchema.nullable(),
  providerAccountId: uuidSchema,
  provider: providerKindSchema,
  accountStatus: providerStatusSchema,
  lastFullSyncAt: isoDateTimeSchema.nullable(),
  lastIncrementalSyncAt: isoDateTimeSchema.nullable(),
  webhookExpiresAt: isoDateTimeSchema.nullable(),
  needsFullResync: z.boolean(),
  hasError: z.boolean(),
  retryCount: z.number().int().min(0),
});

/** The outcome the connect flow reports back through the deep link. */
export const connectResultSchema = z.enum([
  'connected',
  'cancelled',
  'expired',
  'failed',
  'invalid_request',
]);

export type ProviderKind = z.infer<typeof providerKindSchema>;
export type ProviderStatus = z.infer<typeof providerStatusSchema>;
export type ProviderAccount = z.infer<typeof providerAccountSchema>;
export type ExternalCalendar = z.infer<typeof externalCalendarSchema>;
export type CalendarSyncHealth = z.infer<typeof calendarSyncHealthSchema>;
export type ConnectResult = z.infer<typeof connectResultSchema>;
