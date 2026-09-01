import { EdgeError } from '../../errors/index.ts';
import { randomToken } from '../crypto.ts';
import type {
  CalendarProvider,
  ExternalCalendar,
  NormalisedEvent,
  ProviderContext,
  ProviderEventInput,
  SyncResult,
  SyncWindow,
  WatchRegistration,
  WatchTarget,
} from '../types.ts';

import { MICROSOFT_GRAPH_API } from './config.ts';
import { microsoftFetch, type MicrosoftFetch } from './client.ts';
import { normaliseCalendar, normaliseEvent, toMicrosoftEvent } from './normalise.ts';
import {
  microsoftCalendarListSchema,
  microsoftEventSchema,
  microsoftEventsDeltaSchema,
  microsoftSubscriptionSchema,
  type MicrosoftEvent,
} from './schemas.ts';

const PAGE_SIZE = 250;
const MAX_PAGES = 40;
const SUBSCRIPTION_LIFETIME_MS = 6 * 24 * 60 * 60 * 1000;
const GRAPH_ORIGIN = new URL(MICROSOFT_GRAPH_API).origin;

export interface MicrosoftProviderDeps {
  fetch?: MicrosoftFetch;
  now?: () => number;
}

/** Injectable factory used by focused tests; production uses the shared client. */
export function createMicrosoftProvider(deps: MicrosoftProviderDeps = {}): CalendarProvider {
  const request = deps.fetch ?? microsoftFetch;
  const now = deps.now ?? (() => Date.now());

  return {
    kind: 'microsoft',
    watchScope: 'account',

    async listCalendars(ctx: ProviderContext): Promise<ExternalCalendar[]> {
      const calendars: ExternalCalendar[] = [];
      let nextUrl: string | null = `${MICROSOFT_GRAPH_API}/me/calendars?$top=${PAGE_SIZE}`;

      for (let page = 0; page < MAX_PAGES && nextUrl; page += 1) {
        const parsed = parseCalendarPage(
          await request({ accessToken: ctx.accessToken, url: nextUrl, operation: 'calendar' }),
        );
        calendars.push(...parsed.value.map(normaliseCalendar));
        nextUrl = parsed.nextLink ? trustedGraphUrl(parsed.nextLink) : null;
      }

      if (nextUrl)
        throw new EdgeError('UNKNOWN', 'Microsoft returned too many calendar pages.', 502);
      return calendars;
    },

    initialSync(ctx: ProviderContext, providerCalendarId: string, window: SyncWindow) {
      const url = new URL(
        `${MICROSOFT_GRAPH_API}/me/calendars/${encodeURIComponent(providerCalendarId)}/calendarView/delta`,
      );
      url.searchParams.set('startDateTime', window.from);
      url.searchParams.set('endDateTime', window.to);
      return syncDelta(request, ctx, url.toString(), 'UTC');
    },

    incrementalSync(ctx: ProviderContext, _providerCalendarId: string, cursor: string) {
      return syncDelta(request, ctx, trustedGraphUrl(cursor), 'UTC');
    },

    async createEvent(
      ctx: ProviderContext,
      providerCalendarId: string,
      input: ProviderEventInput,
    ): Promise<NormalisedEvent> {
      const body = await request({
        accessToken: ctx.accessToken,
        method: 'POST',
        url: calendarEventsUrl(providerCalendarId),
        body: toMicrosoftEvent(input),
        operation: 'event',
      });
      return parseSingleEvent(body, input.timezone);
    },

    async updateEvent(
      ctx: ProviderContext,
      providerCalendarId: string,
      providerEventId: string,
      input: ProviderEventInput,
    ): Promise<NormalisedEvent> {
      const body = await request({
        accessToken: ctx.accessToken,
        method: 'PATCH',
        url: `${calendarEventsUrl(providerCalendarId)}/${encodeURIComponent(providerEventId)}`,
        body: toMicrosoftEvent(input),
        etag: input.providerEtag,
        operation: 'event',
      });
      return parseSingleEvent(body, input.timezone);
    },

    async deleteEvent(
      ctx: ProviderContext,
      providerCalendarId: string,
      providerEventId: string,
    ): Promise<void> {
      try {
        await request({
          accessToken: ctx.accessToken,
          method: 'DELETE',
          url: `${calendarEventsUrl(providerCalendarId)}/${encodeURIComponent(providerEventId)}`,
          operation: 'event',
        });
      } catch (error) {
        if (error instanceof EdgeError && error.code === 'NOT_FOUND') return;
        throw error;
      }
    },

    async watch(
      ctx: ProviderContext,
      target: WatchTarget,
      callbackUrl: string,
    ): Promise<WatchRegistration> {
      if (target.scope !== 'account') {
        throw new EdgeError('VALIDATION_FAILED', 'Microsoft watches are account-scoped.', 400);
      }
      const notificationUrl = publicHttpsUrl(callbackUrl);
      const token = randomToken();
      const body = await request({
        accessToken: ctx.accessToken,
        method: 'POST',
        url: `${MICROSOFT_GRAPH_API}/subscriptions`,
        body: {
          changeType: 'created,updated,deleted',
          notificationUrl,
          lifecycleNotificationUrl: notificationUrl,
          resource: '/me/events',
          expirationDateTime: new Date(now() + SUBSCRIPTION_LIFETIME_MS).toISOString(),
          clientState: token,
          latestSupportedTlsVersion: 'v1_2',
        },
        operation: 'watch',
      });

      return registrationFromGraphResponse(body, token, undefined, now());
    },

    async renewWatch(
      ctx: ProviderContext,
      registration: WatchRegistration,
    ): Promise<WatchRegistration> {
      const subscriptionId = registration.subscriptionId ?? registration.channelId;
      if (!subscriptionId) {
        throw new EdgeError(
          'VALIDATION_FAILED',
          'Microsoft watch is missing its subscription id.',
          400,
        );
      }

      const body = await request({
        accessToken: ctx.accessToken,
        method: 'PATCH',
        url: `${MICROSOFT_GRAPH_API}/subscriptions/${encodeURIComponent(subscriptionId)}`,
        body: { expirationDateTime: new Date(now() + SUBSCRIPTION_LIFETIME_MS).toISOString() },
        operation: 'watch',
      });
      return registrationFromGraphResponse(body, registration.token, subscriptionId, now());
    },

    async unwatch(ctx: ProviderContext, registration: WatchRegistration): Promise<void> {
      const subscriptionId = registration.subscriptionId ?? registration.channelId;
      if (!subscriptionId) return;

      try {
        await request({
          accessToken: ctx.accessToken,
          method: 'DELETE',
          url: `${MICROSOFT_GRAPH_API}/subscriptions/${encodeURIComponent(subscriptionId)}`,
          operation: 'watch',
        });
      } catch (error) {
        // Graph documents 404 as an already expired/deleted subscription. The
        // desired disconnect state is already true in that case.
        if (error instanceof EdgeError && error.code === 'NOT_FOUND') return;
        throw error;
      }
    },
  };
}

export const microsoftProvider: CalendarProvider = createMicrosoftProvider();

async function syncDelta(
  request: MicrosoftFetch,
  ctx: ProviderContext,
  firstUrl: string,
  calendarTimeZone: string,
): Promise<SyncResult> {
  const events: NormalisedEvent[] = [];
  let nextUrl: string | null = firstUrl;

  try {
    for (let page = 0; page < MAX_PAGES && nextUrl; page += 1) {
      const parsed = parseDeltaPage(
        await request({
          accessToken: ctx.accessToken,
          url: nextUrl,
          operation: 'delta',
          prefer: `odata.maxpagesize=${PAGE_SIZE}`,
        }),
      );
      events.push(...parsed.value.map((event) => normaliseEvent(event, calendarTimeZone)));

      if (parsed.nextLink) {
        nextUrl = trustedGraphUrl(parsed.nextLink);
        continue;
      }
      if (!parsed.deltaLink) {
        throw new EdgeError('UNKNOWN', 'Microsoft did not return a delta cursor.', 502);
      }
      return { events, cursor: trustedGraphUrl(parsed.deltaLink) };
    }
  } catch (error) {
    if (error instanceof EdgeError && error.code === 'PROVIDER_SYNC_CURSOR_INVALID') {
      return { events: [], cursor: null, cursorInvalid: true };
    }
    throw error;
  }

  throw new EdgeError('UNKNOWN', 'Microsoft returned too many delta pages.', 502);
}

function parseCalendarPage(body: unknown): {
  value: ReturnType<typeof microsoftCalendarListSchema.parse>['value'];
  nextLink: string | null;
} {
  const parsed = microsoftCalendarListSchema.safeParse(body);
  if (!parsed.success) {
    throw new EdgeError('UNKNOWN', 'Microsoft returned an unexpected calendar list.', 502);
  }
  return { value: parsed.data.value, nextLink: parsed.data['@odata.nextLink'] ?? null };
}

function parseDeltaPage(body: unknown): {
  value: MicrosoftEvent[];
  nextLink: string | null;
  deltaLink: string | null;
} {
  const parsed = microsoftEventsDeltaSchema.safeParse(body);
  if (!parsed.success) {
    throw new EdgeError('UNKNOWN', 'Microsoft returned an unexpected event delta.', 502);
  }
  return {
    value: parsed.data.value,
    nextLink: parsed.data['@odata.nextLink'] ?? null,
    deltaLink: parsed.data['@odata.deltaLink'] ?? null,
  };
}

function parseSingleEvent(body: unknown, fallbackTimeZone: string): NormalisedEvent {
  const parsed = microsoftEventSchema.safeParse(body);
  if (!parsed.success) {
    throw new EdgeError('UNKNOWN', 'Microsoft returned an unexpected event.', 502);
  }
  return normaliseEvent(parsed.data, fallbackTimeZone);
}

function registrationFromGraphResponse(
  body: unknown,
  fallbackToken: string,
  fallbackId?: string,
  now = Date.now(),
): WatchRegistration {
  const parsed = microsoftSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    throw new EdgeError('UNKNOWN', 'Microsoft returned an unexpected subscription.', 502);
  }
  const token = parsed.data.clientState ?? fallbackToken;
  if (!token || token !== fallbackToken) {
    throw new EdgeError('UNKNOWN', 'Microsoft returned an invalid subscription secret.', 502);
  }

  const expiry = new Date(parsed.data.expirationDateTime);
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= now) {
    throw new EdgeError('UNKNOWN', 'Microsoft returned an invalid subscription expiry.', 502);
  }

  const id = parsed.data.id || fallbackId;
  if (!id) throw new EdgeError('UNKNOWN', 'Microsoft returned an invalid subscription id.', 502);

  return {
    channelId: id,
    resourceId: null,
    subscriptionId: id,
    token,
    expiresAt: expiry.toISOString(),
  };
}

function calendarEventsUrl(providerCalendarId: string): string {
  return `${MICROSOFT_GRAPH_API}/me/calendars/${encodeURIComponent(providerCalendarId)}/events`;
}

function trustedGraphUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.origin !== GRAPH_ORIGIN || !url.pathname.startsWith('/v1.0/'))
      throw new Error('untrusted');
    return url.toString();
  } catch {
    throw new EdgeError('UNKNOWN', 'Microsoft returned an unsafe continuation URL.', 502);
  }
}

function publicHttpsUrl(value: string): string {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '::1'
    ) {
      throw new Error('not public https');
    }
    return url.toString();
  } catch {
    throw new EdgeError(
      'VALIDATION_FAILED',
      'Microsoft notifications require a public HTTPS URL.',
      400,
    );
  }
}
