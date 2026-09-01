import { assertEquals, assertRejects } from 'jsr:@std/assert@^1.0.0';

import { EdgeError } from '../../errors/index.ts';
import type { ProviderContext, WatchTarget } from '../types.ts';

import { createMicrosoftProvider } from './provider.ts';
import type { MicrosoftFetch, MicrosoftRequest } from './client.ts';

const NOW = Date.parse('2026-01-01T00:00:00.000Z');
const context: ProviderContext = {
  providerAccountId: '11111111-1111-1111-1111-111111111111',
  userId: '22222222-2222-2222-2222-222222222222',
  accessToken: 'access-token',
};

function event(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    subject: 'Planning',
    start: { dateTime: '2026-01-02T09:00:00.0000000', timeZone: 'UTC' },
    end: { dateTime: '2026-01-02T10:00:00.0000000', timeZone: 'UTC' },
    isAllDay: false,
    isCancelled: false,
    ...overrides,
  };
}

function recorder(handler: (request: MicrosoftRequest, calls: MicrosoftRequest[]) => unknown): {
  fetch: MicrosoftFetch;
  calls: MicrosoftRequest[];
} {
  const calls: MicrosoftRequest[] = [];
  return {
    calls,
    fetch: async (request) => {
      calls.push(request);
      return handler(request, calls);
    },
  };
}

Deno.test('lists Microsoft calendars across Graph pages', async () => {
  const { fetch, calls } = recorder((_request, currentCalls) =>
    currentCalls.length === 1
      ? {
          value: [
            {
              id: 'calendar-1',
              name: 'Work',
              hexColor: '#123abc',
              isDefaultCalendar: true,
              canEdit: true,
              timeZone: 'Eastern Standard Time',
            },
          ],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/calendars?$skiptoken=next',
        }
      : {
          value: [{ id: 'calendar-2', name: 'Read only', canEdit: false }],
        },
  );
  const provider = createMicrosoftProvider({ fetch });

  assertEquals(await provider.listCalendars(context), [
    {
      providerCalendarId: 'calendar-1',
      name: 'Work',
      color: '#123abc',
      isPrimary: true,
      isReadOnly: false,
      timezone: 'America/New_York',
    },
    {
      providerCalendarId: 'calendar-2',
      name: 'Read only',
      color: '#6E8BFF',
      isPrimary: false,
      isReadOnly: true,
      timezone: null,
    },
  ]);
  assertEquals(calls.length, 2);
  assertEquals(calls[0]?.operation, 'calendar');
  assertEquals(calls[1]?.url, 'https://graph.microsoft.com/v1.0/me/calendars?$skiptoken=next');
});

Deno.test(
  'performs an initial delta sync with the configured window and final cursor',
  async () => {
    const { fetch, calls } = recorder((_request, currentCalls) =>
      currentCalls.length === 1
        ? {
            value: [event('event-1')],
            '@odata.nextLink':
              'https://graph.microsoft.com/v1.0/me/calendars/c1/calendarView/delta?$skiptoken=next',
          }
        : {
            value: [{ ...event('event-2'), showAs: 'tentative' }],
            '@odata.deltaLink':
              'https://graph.microsoft.com/v1.0/me/calendars/c1/calendarView/delta?$deltatoken=cursor',
          },
    );
    const provider = createMicrosoftProvider({ fetch });

    const result = await provider.initialSync(context, 'calendar-1', {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
    });

    assertEquals(
      result.cursor,
      'https://graph.microsoft.com/v1.0/me/calendars/c1/calendarView/delta?$deltatoken=cursor',
    );
    assertEquals(result.events.length, 2);
    assertEquals(result.events[1]?.status, 'tentative');
    assertEquals(calls[0]?.url.includes('startDateTime=2026-01-01T00%3A00%3A00.000Z'), true);
    assertEquals(calls[0]?.prefer, 'odata.maxpagesize=250');
  },
);

Deno.test('returns a resync result when Graph identifies an invalid delta cursor', async () => {
  const { fetch } = recorder(() =>
    Promise.reject(new EdgeError('PROVIDER_SYNC_CURSOR_INVALID', 'expired', 410)),
  );
  const provider = createMicrosoftProvider({ fetch });

  assertEquals(
    await provider.incrementalSync(
      context,
      'calendar-1',
      'https://graph.microsoft.com/v1.0/me/calendars/calendar-1/calendarView/delta?$deltatoken=old',
    ),
    { events: [], cursor: null, cursorInvalid: true },
  );
});

Deno.test('creates, updates, and deletes provider events', async () => {
  const calls: MicrosoftRequest[] = [];
  const fetch: MicrosoftFetch = async (request) => {
    calls.push(request);
    if (request.method === 'DELETE') return null;
    return event(request.method === 'POST' ? 'created' : 'updated', {
      '@odata.etag': 'W/"etag"',
      lastModifiedDateTime: '2026-01-01T12:00:00Z',
    });
  };
  const provider = createMicrosoftProvider({ fetch });
  const input = {
    title: 'Planning',
    description: null,
    location: null,
    startAt: '2026-01-02T09:00:00.000Z',
    endAt: '2026-01-02T10:00:00.000Z',
    allDay: false,
    timezone: 'UTC',
    recurrenceRule: null,
    alerts: [],
  };
  const updateInput = { ...input, providerEtag: 'W/"old-etag"' };

  assertEquals(
    (await provider.createEvent(context, 'calendar-1', input)).providerEventId,
    'created',
  );
  assertEquals(
    (await provider.updateEvent(context, 'calendar-1', 'created', updateInput)).providerEventId,
    'updated',
  );
  await provider.deleteEvent(context, 'calendar-1', 'created');

  assertEquals(
    calls.map((call) => `${call.method}:${call.operation}`),
    ['POST:event', 'PATCH:event', 'DELETE:event'],
  );
  const createBody = calls[0]?.body as Record<string, unknown>;
  assertEquals(createBody.subject, 'Planning');
  assertEquals((createBody.start as Record<string, unknown>).timeZone, 'UTC');
  assertEquals(calls[1]?.etag, 'W/"old-etag"');
});

Deno.test('registers, renews, and tears down one account-scoped Graph subscription', async () => {
  let clientState = '';
  const { fetch, calls } = recorder((request) => {
    if (request.method === 'POST') {
      const body = request.body as Record<string, unknown>;
      clientState = body.clientState as string;
      return {
        id: 'subscription-1',
        resource: '/me/events',
        changeType: 'created,updated,deleted',
        notificationUrl: body.notificationUrl,
        lifecycleNotificationUrl: body.lifecycleNotificationUrl,
        expirationDateTime: new Date(NOW + 5 * 24 * 60 * 60 * 1000).toISOString(),
        clientState: body.clientState,
      };
    }
    if (request.method === 'PATCH') {
      return {
        id: 'subscription-1',
        resource: '/me/events',
        expirationDateTime: new Date(NOW + 6 * 24 * 60 * 60 * 1000).toISOString(),
        clientState,
      };
    }
    return null;
  });
  const provider = createMicrosoftProvider({ fetch, now: () => NOW });

  const registration = await provider.watch(
    context,
    { scope: 'account' },
    'https://app.example.com/webhook',
  );
  assertEquals(registration.subscriptionId, 'subscription-1');
  assertEquals(registration.resourceId, null);
  assertEquals(registration.expiresAt, '2026-01-06T00:00:00.000Z');

  const renewed = await provider.renewWatch!(context, registration);
  assertEquals(renewed.expiresAt, '2026-01-07T00:00:00.000Z');
  await provider.unwatch(context, renewed);

  assertEquals(
    calls.map((call) => `${call.method}:${call.operation}`),
    ['POST:watch', 'PATCH:watch', 'DELETE:watch'],
  );
  assertEquals((calls[0]?.body as Record<string, unknown>).resource, '/me/events');
  assertEquals(calls[1]?.url, 'https://graph.microsoft.com/v1.0/subscriptions/subscription-1');
});

Deno.test('rejects calendar-scoped watches and unsafe continuation URLs', async () => {
  const provider = createMicrosoftProvider({ fetch: async () => ({}) });
  const target: WatchTarget = { scope: 'calendar', providerCalendarId: 'calendar-1' };
  await assertRejects(
    () => provider.watch(context, target, 'https://app.example.com/webhook'),
    EdgeError,
  );
  await assertRejects(
    () => provider.incrementalSync(context, 'calendar-1', 'https://evil.example.com/delta'),
    EdgeError,
  );
});
