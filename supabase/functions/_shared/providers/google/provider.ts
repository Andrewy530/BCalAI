import { EdgeError } from '../../errors/index.ts';
import type {
  CalendarProvider,
  ExternalCalendar,
  NormalisedEvent,
  ProviderContext,
  ProviderEventInput,
  SyncResult,
  WatchRegistration,
} from '../types.ts';

import { randomToken } from './auth.ts';
import { googleFetch } from './client.ts';
import { GOOGLE_CALENDAR_API } from './config.ts';
import { normaliseCalendar, normaliseEvent, toGoogleEvent } from './normalise.ts';
import {
  googleCalendarListSchema,
  googleEventSchema,
  googleEventsListSchema,
  googleWatchResponseSchema,
} from './schemas.ts';

/**
 * The Google implementation of `CalendarProvider`.
 *
 * Two Google-specific behaviours are worth knowing before changing anything
 * here:
 *
 * 1. `syncToken` and `timeMin`/`timeMax` are mutually exclusive. The window
 *    is therefore fixed at the initial sync and inherited by every incremental
 *    run — which is why an initial sync stores its window alongside the cursor.
 * 2. We list with `singleEvents=false`, so a recurring series arrives as one
 *    master event plus separate rows for modified occurrences. That matches how
 *    `events` stores recurrence and lets `expandOccurrences` do the work on the
 *    client, rather than importing thousands of expanded rows.
 */

/** Google caps `maxResults` at 2500; smaller pages keep each run well inside the CPU budget. */
const PAGE_SIZE = 250;
/** Refuse to loop forever if a cursor somehow never settles. */
const MAX_PAGES = 40;

export const googleProvider: CalendarProvider = {
  kind: 'google',

  async listCalendars(ctx: ProviderContext): Promise<ExternalCalendar[]> {
    const calendars: ExternalCalendar[] = [];
    let pageToken: string | null = null;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = new URL(`${GOOGLE_CALENDAR_API}/users/me/calendarList`);
      url.searchParams.set('maxResults', '250');
      url.searchParams.set('showHidden', 'false');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const parsed = googleCalendarListSchema.safeParse(
        await googleFetch({ accessToken: ctx.accessToken, url: url.toString() }),
      );
      if (!parsed.success) {
        throw new EdgeError('UNKNOWN', 'Google returned an unexpected calendar list.', 502);
      }

      for (const entry of parsed.data.items ?? []) {
        if (entry.deleted) continue;
        calendars.push(normaliseCalendar(entry));
      }

      pageToken = parsed.data.nextPageToken ?? null;
      if (!pageToken) break;
    }

    return calendars;
  },

  initialSync(ctx, providerCalendarId, window): Promise<SyncResult> {
    return listEvents(ctx, providerCalendarId, {
      timeMin: window.from,
      timeMax: window.to,
    });
  },

  incrementalSync(ctx, providerCalendarId, cursor): Promise<SyncResult> {
    return listEvents(ctx, providerCalendarId, { syncToken: cursor });
  },

  async createEvent(ctx, providerCalendarId, input): Promise<NormalisedEvent> {
    const body = await googleFetch({
      accessToken: ctx.accessToken,
      method: 'POST',
      url: `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(providerCalendarId)}/events`,
      body: toGoogleEvent(input),
    });

    return parseSingleEvent(body, input.timezone);
  },

  async updateEvent(ctx, providerCalendarId, providerEventId, input): Promise<NormalisedEvent> {
    // PATCH rather than PUT: a full replace would drop attendees, conferencing,
    // and every other field this app does not model.
    const body = await googleFetch({
      accessToken: ctx.accessToken,
      method: 'PATCH',
      url:
        `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(providerCalendarId)}` +
        `/events/${encodeURIComponent(providerEventId)}`,
      body: toGoogleEvent(input),
    });

    return parseSingleEvent(body, input.timezone);
  },

  async deleteEvent(ctx, providerCalendarId, providerEventId): Promise<void> {
    try {
      await googleFetch({
        accessToken: ctx.accessToken,
        method: 'DELETE',
        url:
          `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(providerCalendarId)}` +
          `/events/${encodeURIComponent(providerEventId)}`,
      });
    } catch (error) {
      // Already gone is the outcome we wanted, so treat it as success rather
      // than leaving the local row stuck in `pending` forever.
      if (error instanceof EdgeError && error.code === 'NOT_FOUND') return;
      throw error;
    }
  },

  async watch(ctx, providerCalendarId, callbackUrl): Promise<WatchRegistration> {
    const channelId = crypto.randomUUID();
    const token = randomToken();

    const body = await googleFetch({
      accessToken: ctx.accessToken,
      method: 'POST',
      url: `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(providerCalendarId)}/events/watch`,
      body: {
        id: channelId,
        type: 'web_hook',
        address: callbackUrl,
        // Echoed back on every delivery; the webhook rejects anything else.
        token,
        // Google's maximum for calendar channels is ~1 month; ask for a week so
        // the hourly renewal cron has many chances before anything lapses.
        params: { ttl: String(7 * 24 * 60 * 60) },
      },
    });

    const parsed = googleWatchResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new EdgeError('UNKNOWN', 'Google returned an unexpected watch response.', 502);
    }

    const expiration = Number(parsed.data.expiration ?? '');
    const expiresAt = Number.isFinite(expiration)
      ? new Date(expiration).toISOString()
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    return {
      channelId: parsed.data.id,
      resourceId: parsed.data.resourceId,
      subscriptionId: null,
      token,
      expiresAt,
    };
  },

  async unwatch(ctx, registration): Promise<void> {
    if (!registration.resourceId) return;

    try {
      await googleFetch({
        accessToken: ctx.accessToken,
        method: 'POST',
        url: 'https://www.googleapis.com/calendar/v3/channels/stop',
        body: { id: registration.channelId, resourceId: registration.resourceId },
      });
    } catch (cause) {
      // A channel we cannot stop expires on its own within the week. Never let
      // this fail a disconnect.
      console.error(JSON.stringify({ code: 'GOOGLE_UNWATCH_FAILED', detail: String(cause) }));
    }
  },
};

// ---------------------------------------------------------------------------

interface ListParams {
  syncToken?: string;
  timeMin?: string;
  timeMax?: string;
}

/**
 * Drain `events.list` to completion.
 *
 * The sync token only appears on the *last* page, so partial results must never
 * be committed with a cursor — an interrupted run has to be replayed from the
 * previous cursor rather than resumed from a page token.
 */
async function listEvents(
  ctx: ProviderContext,
  providerCalendarId: string,
  params: ListParams,
): Promise<SyncResult> {
  const events: NormalisedEvent[] = [];
  let pageToken: string | null = null;
  let cursor: string | null = null;
  let calendarTimeZone = 'UTC';

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(providerCalendarId)}/events`,
    );
    url.searchParams.set('maxResults', String(PAGE_SIZE));
    // Store series as masters; the client expands occurrences.
    url.searchParams.set('singleEvents', 'false');
    // Required for incremental sync to report deletions at all.
    url.searchParams.set('showDeleted', 'true');

    if (params.syncToken) url.searchParams.set('syncToken', params.syncToken);
    if (params.timeMin) url.searchParams.set('timeMin', params.timeMin);
    if (params.timeMax) url.searchParams.set('timeMax', params.timeMax);
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    let body: unknown;
    try {
      body = await googleFetch({ accessToken: ctx.accessToken, url: url.toString() });
    } catch (error) {
      // The caller's contract is a SyncResult, not an exception, for the one
      // failure that has a defined recovery: drop the cursor and resync.
      if (error instanceof EdgeError && error.code === 'GOOGLE_SYNC_CURSOR_INVALID') {
        return { events: [], cursor: null, cursorInvalid: true };
      }
      throw error;
    }

    const parsed = googleEventsListSchema.safeParse(body);
    if (!parsed.success) {
      throw new EdgeError('UNKNOWN', 'Google returned an unexpected event list.', 502);
    }

    calendarTimeZone = parsed.data.timeZone ?? calendarTimeZone;

    for (const item of parsed.data.items ?? []) {
      events.push(normaliseEvent(item, calendarTimeZone));
    }

    cursor = parsed.data.nextSyncToken ?? cursor;
    pageToken = parsed.data.nextPageToken ?? null;
    if (!pageToken) break;
  }

  return { events, cursor };
}

function parseSingleEvent(body: unknown, fallbackTimeZone: string): NormalisedEvent {
  const parsed = googleEventSchema.safeParse(body);
  if (!parsed.success) {
    throw new EdgeError('UNKNOWN', 'Google returned an unexpected event.', 502);
  }
  return normaliseEvent(parsed.data, fallbackTimeZone);
}
