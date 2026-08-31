import {
  type CalendarSyncHealth,
  type ExternalCalendar,
  type ProviderAccount,
  calendarSyncHealthSchema,
  externalCalendarSchema,
  providerAccountSchema,
} from '@cal/schemas';
import { z } from 'zod';

import { toAppError } from '../../../lib/errors/app-error';
import { supabase } from '../../../lib/supabase/client';

/**
 * The only module that knows how calendar connections are read and changed.
 *
 * Almost everything here is an Edge Function call rather than a table write,
 * and that asymmetry is the point: the client may *see* that an account is
 * connected and may ask for it to be disconnected, but it has no insert or
 * update policy on `provider_accounts` at all. Connections are established by
 * a function that holds the OAuth secrets.
 */

const accountRowSchema = z
  .object({
    id: z.string(),
    user_id: z.string(),
    provider: z.string(),
    email: z.string().nullable(),
    status: z.string(),
    scopes: z.array(z.string()).nullable(),
    connected_at: z.string(),
    last_sync_at: z.string().nullable(),
  })
  .transform((row) => ({
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    email: row.email,
    status: row.status,
    scopes: row.scopes ?? [],
    connectedAt: row.connected_at,
    lastSyncAt: row.last_sync_at,
  }))
  .pipe(providerAccountSchema);

const healthRowSchema = z
  .object({
    calendar_id: z.string().nullable(),
    provider_account_id: z.string(),
    provider: z.string(),
    account_status: z.string(),
    last_full_sync_at: z.string().nullable(),
    last_incremental_sync_at: z.string().nullable(),
    webhook_expires_at: z.string().nullable(),
    needs_full_resync: z.boolean(),
    has_error: z.boolean(),
    retry_count: z.number(),
  })
  .transform((row) => ({
    calendarId: row.calendar_id,
    providerAccountId: row.provider_account_id,
    provider: row.provider,
    accountStatus: row.account_status,
    lastFullSyncAt: row.last_full_sync_at,
    lastIncrementalSyncAt: row.last_incremental_sync_at,
    webhookExpiresAt: row.webhook_expires_at,
    needsFullResync: row.needs_full_resync,
    hasError: row.has_error,
    retryCount: row.retry_count,
  }))
  .pipe(calendarSyncHealthSchema);

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Reads the client-safe view, which excludes every token column. */
export async function fetchConnections(): Promise<ProviderAccount[]> {
  const { data, error } = await supabase
    .from('provider_accounts_public')
    .select('*')
    .order('connected_at');

  if (error) throw toAppError(error);
  return (data ?? []).map((row) => accountRowSchema.parse(row));
}

export async function fetchSyncHealth(): Promise<CalendarSyncHealth[]> {
  const { data, error } = await supabase.from('calendar_sync_health').select('*');

  if (error) throw toAppError(error);
  return (data ?? []).map((row) => healthRowSchema.parse(row));
}

/**
 * The calendars an account offers.
 *
 * A provider read, not a database read: the picker has to show calendars the
 * user has not imported yet, and those exist only on the provider's side.
 */
export async function fetchProviderCalendars(
  providerAccountId: string,
): Promise<ExternalCalendar[]> {
  const data = await invoke<{ calendars: unknown[] }>('integrations-calendars', {
    providerAccountId,
  });

  return (data.calendars ?? []).map((entry) => externalCalendarSchema.parse(entry));
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Returns the consent URL for the app to open in a system browser. */
export async function startGoogleConnect(): Promise<string> {
  const data = await invoke<{ authorizationUrl: string }>('oauth-google-start', {});
  return z.string().url().parse(data.authorizationUrl);
}

export async function setCalendarImported(input: {
  providerAccountId: string;
  providerCalendarId: string;
  imported: boolean;
}): Promise<{ calendarId: string | null }> {
  const data = await invoke<{ calendarId: string | null }>('integrations-import', input);
  return { calendarId: data.calendarId ?? null };
}

export async function disconnectAccount(providerAccountId: string): Promise<void> {
  await invoke('integrations-disconnect', { providerAccountId });
}

/** Pull-to-refresh. Omit the calendar to sync everything connected. */
export async function requestSync(calendarId?: string): Promise<void> {
  await invoke('sync-run', { calendarId: calendarId ?? null });
}

/**
 * Write an event on a synced calendar.
 *
 * Called *instead of* a direct table write whenever the target calendar belongs
 * to a provider. The draft is sent rather than saved first because the provider
 * has to accept the change before a local copy means anything
 * (`docs/sync-engine.md` § Writes) — so a rejected edit leaves no phantom row
 * behind for the user to discover later.
 */
export type ProviderEventDraft = {
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string;
  recurrenceRule?: string | null;
  alerts: number[];
};

export type ProviderEventWrite =
  | { operation: 'create'; calendarId: string; draft: ProviderEventDraft }
  | { operation: 'update'; eventId: string; draft: ProviderEventDraft }
  | { operation: 'delete'; eventId: string };

export async function writeProviderEvent(
  input: ProviderEventWrite,
): Promise<{ eventId: string | null }> {
  const data = await invoke<{ eventId: string | null }>('provider-event-write', input);
  return { eventId: data.eventId ?? null };
}

// ---------------------------------------------------------------------------

/**
 * Call an Edge Function and unwrap our error envelope.
 *
 * `functions.invoke` reports a non-2xx as a generic FunctionsHttpError whose
 * message is the status line, which would lose the stable code the function
 * took care to return. Reading the body back is what keeps
 * `GOOGLE_AUTH_EXPIRED` distinguishable from a network blip at the call site.
 */
async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T | { error?: unknown }>(name, { body });

  if (error) {
    const envelope = await readErrorEnvelope(error);
    throw toAppError(envelope ?? error);
  }

  const failure = errorEnvelopeSchema.safeParse(data);
  if (failure.success) throw toAppError(failure.data.error);

  return data as T;
}

const errorEnvelopeSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

async function readErrorEnvelope(error: unknown): Promise<{ code: string; message: string } | null> {
  const response = (error as { context?: Response }).context;
  if (!(response instanceof Response)) return null;

  try {
    const parsed = errorEnvelopeSchema.safeParse(await response.clone().json());
    return parsed.success ? parsed.data.error : null;
  } catch {
    return null;
  }
}
