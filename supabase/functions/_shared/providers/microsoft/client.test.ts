import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import { EdgeError } from '../../errors/index.ts';

import { createMicrosoftClient } from './client.ts';
import type { MicrosoftRequestOperation } from './client.ts';

const NOW = Date.parse('2026-01-01T00:00:00.000Z');

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

Deno.test('authenticates Graph requests and leaves response parsing to callers', async () => {
  const { fetcher, calls } = mockFetch(jsonResponse({ id: 'event-id' }));
  const microsoftFetch = createMicrosoftClient({ fetch: fetcher });

  const body = await microsoftFetch({
    accessToken: 'access-token',
    method: 'PATCH',
    url: 'https://graph.microsoft.com/v1.0/me/events/event-id',
    body: { subject: 'Updated title' },
    etag: 'etag-value',
    operation: 'event',
  });

  assertEquals(body, { id: 'event-id' });
  const call = onlyCall(calls);
  assertEquals(call.init?.method, 'PATCH');
  assertEquals(call.init?.headers, {
    Authorization: 'Bearer access-token',
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'If-Match': 'etag-value',
  });
  assertEquals(call.init?.body, JSON.stringify({ subject: 'Updated title' }));
});

Deno.test('returns null for no-content and empty JSON-success responses', async () => {
  for (
    const response of [
      new Response(null, { status: 204 }),
      new Response(null, { status: 205 }),
      new Response('', { status: 200 }),
    ]
  ) {
    const { fetcher } = mockFetch(response);
    const microsoftFetch = createMicrosoftClient({ fetch: fetcher });

    assertEquals(
      await microsoftFetch({
        accessToken: 'access-token',
        url: 'https://graph.microsoft.com/v1.0/me/events',
        operation: 'event',
      }),
      null,
    );
  }
});

Deno.test('rejects malformed successful JSON without exposing the body', async () => {
  const { fetcher } = mockFetch(new Response('private provider body', { status: 200 }));
  const microsoftFetch = createMicrosoftClient({ fetch: fetcher });

  const error = await expectEdgeError(
    () =>
      microsoftFetch({
        accessToken: 'access-token',
        url: 'https://graph.microsoft.com/v1.0/me/events',
        operation: 'event',
      }),
    'UNKNOWN',
    502,
  );
  assertEquals(error.message.includes('private provider body'), false);
});

Deno.test('retries a 429 using Retry-After seconds before returning JSON', async () => {
  const sleeps: number[] = [];
  const { fetcher } = mockFetch(
    responseWithHeaders(429, { 'Retry-After': '2' }),
    jsonResponse({ value: [] }),
  );
  const microsoftFetch = createMicrosoftClient({
    fetch: fetcher,
    sleep: (milliseconds) => {
      sleeps.push(milliseconds);
      return Promise.resolve();
    },
  });

  assertEquals(
    await microsoftFetch({
      accessToken: 'access-token',
      url: 'https://graph.microsoft.com/v1.0/me/events',
      operation: 'event',
    }),
    { value: [] },
  );
  assertEquals(sleeps, [2000]);
});

Deno.test('retries a 5xx using an HTTP-date Retry-After value', async () => {
  const sleeps: number[] = [];
  const retryAt = new Date(NOW + 3500).toUTCString();
  const { fetcher } = mockFetch(
    responseWithHeaders(503, { 'Retry-After': retryAt }),
    jsonResponse({ value: [] }),
  );
  const microsoftFetch = createMicrosoftClient({
    fetch: fetcher,
    now: () => NOW,
    sleep: (milliseconds) => {
      sleeps.push(milliseconds);
      return Promise.resolve();
    },
  });

  assertEquals(
    await microsoftFetch({
      accessToken: 'access-token',
      url: 'https://graph.microsoft.com/v1.0/me/events',
      operation: 'delta',
    }),
    { value: [] },
  );
  assertEquals(sleeps, [3000]);
});

Deno.test('caps an excessive Retry-After delay', async () => {
  const sleeps: number[] = [];
  const { fetcher } = mockFetch(
    responseWithHeaders(429, { 'Retry-After': '999999' }),
    jsonResponse({ value: [] }),
  );
  const microsoftFetch = createMicrosoftClient({
    fetch: fetcher,
    sleep: (milliseconds) => {
      sleeps.push(milliseconds);
      return Promise.resolve();
    },
  });

  await microsoftFetch({
    accessToken: 'access-token',
    url: 'https://graph.microsoft.com/v1.0/me/events',
    operation: 'event',
  });

  assertEquals(sleeps, [8000]);
});

Deno.test('falls back when Retry-After is not an integer delay-seconds value', async () => {
  const sleeps: number[] = [];
  const { fetcher } = mockFetch(
    responseWithHeaders(429, { 'Retry-After': '2.5' }),
    jsonResponse({ value: [] }),
  );
  const microsoftFetch = createMicrosoftClient({
    fetch: fetcher,
    sleep: (milliseconds) => {
      sleeps.push(milliseconds);
      return Promise.resolve();
    },
  });

  await microsoftFetch({
    accessToken: 'access-token',
    url: 'https://graph.microsoft.com/v1.0/me/events',
    operation: 'event',
  });

  assertEquals(sleeps, [250]);
});

Deno.test('retries 5xx twice, then returns a safe unknown error', async () => {
  const sleeps: number[] = [];
  const { fetcher } = mockFetch(
    responseWithHeaders(500),
    responseWithHeaders(502),
    responseWithHeaders(503, { 'X-Provider-Message': 'private provider message' }),
  );
  const microsoftFetch = createMicrosoftClient({
    fetch: fetcher,
    sleep: (milliseconds) => {
      sleeps.push(milliseconds);
      return Promise.resolve();
    },
  });

  const error = await expectEdgeError(
    () =>
      microsoftFetch({
        accessToken: 'access-token',
        url: 'https://graph.microsoft.com/v1.0/me/events',
        operation: 'event',
      }),
    'UNKNOWN',
    502,
  );
  assertEquals(sleeps, [250, 500]);
  assertEquals(error.message.includes('private provider message'), false);
});

Deno.test('does not retry unsafe POST requests', async () => {
  const cases = [
    { name: 'transport failure', status: null, code: 'NETWORK_UNAVAILABLE', edgeStatus: 503 },
    { name: 'rate limit', status: 429, code: 'PROVIDER_RATE_LIMITED', edgeStatus: 429 },
    { name: 'server failure', status: 500, code: 'UNKNOWN', edgeStatus: 502 },
  ];

  for (const testCase of cases) {
    let calls = 0;
    const sleeps: number[] = [];
    const fetcher: typeof fetch = () => {
      calls += 1;
      if (testCase.status === null) {
        return Promise.reject(new Error('private transport detail'));
      }
      return Promise.resolve(responseWithHeaders(testCase.status));
    };
    const microsoftFetch = createMicrosoftClient({
      fetch: fetcher,
      sleep: (milliseconds) => {
        sleeps.push(milliseconds);
        return Promise.resolve();
      },
    });

    await expectEdgeError(
      () =>
        microsoftFetch({
          accessToken: 'access-token',
          method: 'POST',
          url: 'https://graph.microsoft.com/v1.0/me/events',
          body: { subject: testCase.name },
          operation: 'event',
        }),
      testCase.code,
      testCase.edgeStatus,
    );
    assertEquals(calls, 1);
    assertEquals(sleeps, []);
  }
});

Deno.test('allows an explicitly replay-safe POST to retry', async () => {
  const sleeps: number[] = [];
  const { fetcher, calls } = mockFetch(
    responseWithHeaders(503),
    jsonResponse({ id: 'event-id' }),
  );
  const microsoftFetch = createMicrosoftClient({
    fetch: fetcher,
    sleep: (milliseconds) => {
      sleeps.push(milliseconds);
      return Promise.resolve();
    },
  });

  assertEquals(
    await microsoftFetch({
      accessToken: 'access-token',
      method: 'POST',
      url: 'https://graph.microsoft.com/v1.0/me/events',
      body: { subject: 'transactional create' },
      operation: 'event',
      replaySafe: true,
    }),
    { id: 'event-id' },
  );
  assertEquals(calls.length, 2);
  assertEquals(sleeps, [250]);
});

Deno.test('maps Graph failures and keeps 410 context-sensitive', async () => {
  const cases: Array<{
    status: number;
    operation: MicrosoftRequestOperation;
    code: string;
    edgeStatus: number;
  }> = [
    { status: 401, operation: 'event', code: 'PROVIDER_AUTH_EXPIRED', edgeStatus: 401 },
    { status: 403, operation: 'event', code: 'NOT_AUTHORIZED', edgeStatus: 403 },
    { status: 404, operation: 'event', code: 'NOT_FOUND', edgeStatus: 404 },
    { status: 409, operation: 'event', code: 'EVENT_PROVIDER_CONFLICT', edgeStatus: 409 },
    { status: 412, operation: 'event', code: 'EVENT_PROVIDER_CONFLICT', edgeStatus: 409 },
    { status: 410, operation: 'delta', code: 'PROVIDER_SYNC_CURSOR_INVALID', edgeStatus: 410 },
    { status: 410, operation: 'event', code: 'UNKNOWN', edgeStatus: 502 },
    { status: 410, operation: 'watch', code: 'UNKNOWN', edgeStatus: 502 },
    { status: 418, operation: 'calendar', code: 'UNKNOWN', edgeStatus: 502 },
  ];

  for (const testCase of cases) {
    const { fetcher } = mockFetch(responseWithHeaders(testCase.status));
    const microsoftFetch = createMicrosoftClient({ fetch: fetcher });

    await expectEdgeError(
      () =>
        microsoftFetch({
          accessToken: 'access-token',
          url: 'https://graph.microsoft.com/v1.0/me/events',
          operation: testCase.operation,
        }),
      testCase.code,
      testCase.edgeStatus,
    );
  }
});

Deno.test('retries a transient transport failure with injected sleep', async () => {
  const sleeps: number[] = [];
  let calls = 0;
  const fetcher: typeof fetch = () => {
    calls += 1;
    if (calls === 1) return Promise.reject(new Error('private transport detail'));
    return Promise.resolve(jsonResponse({ value: [] }));
  };
  const microsoftFetch = createMicrosoftClient({
    fetch: fetcher,
    sleep: (milliseconds) => {
      sleeps.push(milliseconds);
      return Promise.resolve();
    },
  });

  assertEquals(
    await microsoftFetch({
      accessToken: 'access-token',
      url: 'https://graph.microsoft.com/v1.0/me/events',
      operation: 'event',
    }),
    { value: [] },
  );
  assertEquals(calls, 2);
  assertEquals(sleeps, [250]);
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function responseWithHeaders(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

function mockFetch(...responses: Response[]): { fetcher: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  let index = 0;
  const fetcher: typeof fetch = (input, init) => {
    calls.push({
      url: input instanceof Request ? input.url : String(input),
      init,
    });
    const response = responses[index] ?? responses[responses.length - 1];
    index += 1;
    if (!response) throw new Error('Mock fetch has no response.');
    return Promise.resolve(response.clone());
  };
  return { fetcher, calls };
}

function onlyCall(calls: FetchCall[]): FetchCall {
  const call = calls[0];
  if (!call || calls.length !== 1) {
    throw new Error(`Expected one fetch call, got ${calls.length}.`);
  }
  return call;
}

async function expectEdgeError(
  operation: () => Promise<unknown>,
  code: string,
  status: number,
): Promise<EdgeError> {
  let caught: unknown;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }

  if (!(caught instanceof EdgeError)) {
    throw new Error(`Expected EdgeError, got ${String(caught)}.`);
  }
  assertEquals(caught.code, code);
  assertEquals(caught.status, status);
  return caught;
}
