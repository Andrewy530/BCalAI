/**
 * The provider contract from `docs/sync-engine.md`.
 *
 * Everything Google- or Microsoft-specific lives *below* this file. The sync
 * worker, the webhook, and the write path all speak only these shapes, which is
 * what lets Sprint 5 add Microsoft by writing one more module rather than by
 * threading a second code path through the queue.
 *
 * Deviation from the sketch in the design doc: every method takes an explicit
 * `ProviderContext` instead of resolving an account id internally. Edge
 * Functions are stateless and an access token is only valid for minutes, so the
 * caller resolves the token once per invocation and passes it down rather than
 * each adapter method re-reading Vault.
 */

export type ProviderKind = 'google' | 'microsoft';

export type EventStatus = 'confirmed' | 'tentative' | 'cancelled';

/** A calendar as the provider describes it, before the user chooses to import it. */
export interface ExternalCalendar {
  providerCalendarId: string;
  name: string;
  /** Hex, when the provider supplies one. The import step falls back to our palette. */
  color: string | null;
  isPrimary: boolean;
  /** True when the user's access role cannot write. Import it, but never push to it. */
  isReadOnly: boolean;
  timezone: string | null;
}

/**
 * One provider event, already in our vocabulary.
 *
 * `deleted` is separate from `status: 'cancelled'` on purpose: Google reports a
 * removed event as a tombstone with almost no other fields, so the sync worker
 * needs to distinguish "this event was cancelled and still has a title" from
 * "this row is gone and only its id is meaningful".
 */
export interface NormalisedEvent {
  providerEventId: string;
  providerEtag: string | null;
  providerUpdatedAt: string | null;
  title: string;
  description: string | null;
  location: string | null;
  /** UTC ISO instants. All-day events are normalised to local-midnight boundaries. */
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string;
  status: EventStatus;
  /** A single RFC 5545 RRULE line, or null for a one-off. */
  recurrenceRule: string | null;
  /** Minutes before start. Empty means no alert. */
  alerts: number[];
  /** Set when this row is a modified occurrence of a series. */
  recurringEventId: string | null;
  deleted: boolean;
}

/** What we send outward when the user edits a provider-owned event. */
export interface ProviderEventInput {
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string;
  recurrenceRule: string | null;
  alerts: number[];
  status?: EventStatus;
}

export interface SyncResult {
  events: NormalisedEvent[];
  /** Persist into `calendar_sync_states.sync_cursor` for the next run. */
  cursor: string | null;
  /**
   * The provider rejected the cursor we presented (Google 410, Graph expired
   * token). The caller must discard local state for this calendar and resync.
   */
  cursorInvalid?: boolean;
}

export interface WatchRegistration {
  /** Our identifier for the channel; the provider echoes it on delivery. */
  channelId: string;
  /** Google's opaque resource id, needed to stop the channel. Null on Graph. */
  resourceId: string | null;
  /** Graph's subscription id. Null on Google. */
  subscriptionId: string | null;
  /** Shared secret echoed on every delivery and verified before work is queued. */
  token: string;
  expiresAt: string;
}

/** Resolved once per invocation and passed down. Never persisted. */
export interface ProviderContext {
  providerAccountId: string;
  userId: string;
  accessToken: string;
}

/** The window an initial sync covers. Unbounded history is not worth importing. */
export interface SyncWindow {
  from: string;
  to: string;
}

export interface CalendarProvider {
  readonly kind: ProviderKind;

  listCalendars(ctx: ProviderContext): Promise<ExternalCalendar[]>;

  initialSync(
    ctx: ProviderContext,
    providerCalendarId: string,
    window: SyncWindow,
  ): Promise<SyncResult>;

  incrementalSync(
    ctx: ProviderContext,
    providerCalendarId: string,
    cursor: string,
  ): Promise<SyncResult>;

  createEvent(
    ctx: ProviderContext,
    providerCalendarId: string,
    input: ProviderEventInput,
  ): Promise<NormalisedEvent>;

  updateEvent(
    ctx: ProviderContext,
    providerCalendarId: string,
    providerEventId: string,
    input: ProviderEventInput,
  ): Promise<NormalisedEvent>;

  deleteEvent(
    ctx: ProviderContext,
    providerCalendarId: string,
    providerEventId: string,
  ): Promise<void>;

  /** Register (or re-register) the change channel. Called on connect and by cron. */
  watch(
    ctx: ProviderContext,
    providerCalendarId: string,
    callbackUrl: string,
  ): Promise<WatchRegistration>;

  /** Best-effort teardown. A failure here must not block a disconnect. */
  unwatch(ctx: ProviderContext, registration: WatchRegistration): Promise<void>;
}

/** OAuth surface. Kept separate: the connect flow runs before any context exists. */
export interface ProviderAuth {
  readonly kind: ProviderKind;
  /** The consent URL to open, given a PKCE challenge and CSRF state. */
  authorizationUrl(params: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
  }): string;
  exchangeCode(params: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  /** Identify who just connected, so a re-connect updates rather than duplicates. */
  identify(accessToken: string): Promise<{ providerUserId: string; email: string | null }>;
  revoke(token: string): Promise<void>;
}

export interface TokenSet {
  accessToken: string;
  /** Absent on refresh responses — the original refresh token stays valid. */
  refreshToken: string | null;
  expiresAt: string;
  scopes: string[];
}
