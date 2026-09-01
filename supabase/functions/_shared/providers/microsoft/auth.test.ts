import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import { EdgeError } from '../../errors/index.ts';

import { createMicrosoftAuth } from './auth.ts';

const NOW = Date.parse('2026-01-01T00:00:00.000Z');

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

Deno.test('builds the Microsoft authorization URL with exact PKCE parameters', () => {
  const auth = createMicrosoftAuth({ clientId: 'client-id', tenant: 'common' });
  const url = new URL(
    auth.authorizationUrl({
      state: 'csrf-state',
      codeChallenge: 'pkce-challenge',
      redirectUri: 'https://project.supabase.co/functions/v1/oauth-microsoft-callback',
    }),
  );

  assertEquals(
    url.href.startsWith(
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?',
    ),
    true,
  );
  assertEquals(Object.fromEntries(url.searchParams), {
    client_id: 'client-id',
    redirect_uri: 'https://project.supabase.co/functions/v1/oauth-microsoft-callback',
    response_type: 'code',
    response_mode: 'query',
    scope: 'openid profile email offline_access User.Read Calendars.ReadWrite',
    state: 'csrf-state',
    code_challenge: 'pkce-challenge',
    code_challenge_method: 'S256',
  });
});

Deno.test('exchanges a code with client credentials, redirect URI, and PKCE verifier', async () => {
  const { fetcher, calls } = mockFetch(
    jsonResponse({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      scope: 'openid User.Read Calendars.ReadWrite',
      token_type: 'Bearer',
    }),
  );
  const auth = createMicrosoftAuth({
    fetch: fetcher,
    now: () => NOW,
    clientId: 'client-id',
    clientSecret: 'client-secret',
    tenant: 'organizations',
  });

  const token = await auth.exchangeCode({
    code: 'authorization-code',
    codeVerifier: 'verifier',
    redirectUri: 'https://project.supabase.co/functions/v1/oauth-microsoft-callback',
  });

  assertEquals(token, {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: new Date(NOW + 3540 * 1000).toISOString(),
    scopes: ['openid', 'User.Read', 'Calendars.ReadWrite'],
  });

  const call = onlyCall(calls);
  assertEquals(
    call.url,
    'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
  );
  assertEquals(call.init?.method, 'POST');
  const form = new URLSearchParams(bodyOf(call));
  assertEquals(Object.fromEntries(form), {
    client_id: 'client-id',
    client_secret: 'client-secret',
    grant_type: 'authorization_code',
    code: 'authorization-code',
    code_verifier: 'verifier',
    redirect_uri: 'https://project.supabase.co/functions/v1/oauth-microsoft-callback',
  });
});

Deno.test('retains a null refresh token when refresh omits rotation', async () => {
  const { fetcher, calls } = mockFetch(
    jsonResponse({ access_token: 'access-token', expires_in: 1800 }),
  );
  const auth = createMicrosoftAuth({
    fetch: fetcher,
    now: () => NOW,
    clientId: 'client-id',
    clientSecret: 'client-secret',
  });

  const token = await auth.refresh('stored-refresh-token');

  assertEquals(token, {
    accessToken: 'access-token',
    refreshToken: null,
    expiresAt: new Date(NOW + 1740 * 1000).toISOString(),
    scopes: [],
  });
  const form = new URLSearchParams(bodyOf(onlyCall(calls)));
  assertEquals(form.get('grant_type'), 'refresh_token');
  assertEquals(form.get('refresh_token'), 'stored-refresh-token');
});

Deno.test('returns a rotated refresh token when Microsoft supplies one', async () => {
  const { fetcher } = mockFetch(
    jsonResponse({
      access_token: 'access-token',
      refresh_token: 'rotated-refresh-token',
      expires_in: 3600,
    }),
  );
  const auth = createMicrosoftAuth({
    fetch: fetcher,
    now: () => NOW,
    clientId: 'client-id',
    clientSecret: 'client-secret',
  });

  const token = await auth.refresh('stored-refresh-token');

  assertEquals(token.refreshToken, 'rotated-refresh-token');
});

Deno.test('requires a refresh token on the initial exchange', async () => {
  const { fetcher } = mockFetch(
    jsonResponse({ access_token: 'access-token', expires_in: 3600 }),
  );
  const auth = createMicrosoftAuth({
    fetch: fetcher,
    clientId: 'client-id',
    clientSecret: 'client-secret',
  });

  await expectEdgeError(
    () =>
      auth.exchangeCode({
        code: 'authorization-code',
        codeVerifier: 'verifier',
        redirectUri: 'https://project.supabase.co/functions/v1/oauth-microsoft-callback',
      }),
    'PROVIDER_AUTH_EXPIRED',
    400,
  );
});

Deno.test('maps invalid_grant to provider auth expiration without exposing the description', async () => {
  const { fetcher } = mockFetch(
    jsonResponse(
      { error: 'invalid_grant', error_description: 'private provider details' },
      400,
    ),
  );
  const auth = createMicrosoftAuth({
    fetch: fetcher,
    clientId: 'client-id',
    clientSecret: 'client-secret',
  });

  const error = await expectEdgeError(
    () => auth.refresh('stored-refresh-token'),
    'PROVIDER_AUTH_EXPIRED',
    401,
  );
  assertEquals(error.message.includes('private provider details'), false);
});

Deno.test('rejects a malformed token success response', async () => {
  const { fetcher } = mockFetch(
    jsonResponse({ access_token: 'access-token', expires_in: '3600' }),
  );
  const auth = createMicrosoftAuth({
    fetch: fetcher,
    clientId: 'client-id',
    clientSecret: 'client-secret',
  });

  await expectEdgeError(
    () => auth.refresh('stored-refresh-token'),
    'UNKNOWN',
    502,
  );
});

Deno.test('rejects a token response with a zero lifetime', async () => {
  const { fetcher } = mockFetch(
    jsonResponse({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 0,
    }),
  );
  const auth = createMicrosoftAuth({
    fetch: fetcher,
    clientId: 'client-id',
    clientSecret: 'client-secret',
  });

  await expectEdgeError(
    () => auth.refresh('stored-refresh-token'),
    'UNKNOWN',
    502,
  );
});

Deno.test('identifies a Graph user and falls back from mail to userPrincipalName', async () => {
  const { fetcher, calls } = mockFetch(
    jsonResponse({
      id: 'graph-user-id',
      mail: null,
      userPrincipalName: 'person@example.com',
    }),
  );
  const auth = createMicrosoftAuth({ fetch: fetcher });

  const identity = await auth.identify('access-token');

  assertEquals(identity, {
    providerUserId: 'graph-user-id',
    email: 'person@example.com',
  });
  const call = onlyCall(calls);
  assertEquals(
    call.url,
    'https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName',
  );
  assertEquals(call.init?.headers, {
    Authorization: 'Bearer access-token',
    Accept: 'application/json',
  });
});

Deno.test('rejects a malformed Graph profile response', async () => {
  const { fetcher } = mockFetch(new Response('not-json', { status: 200 }));
  const auth = createMicrosoftAuth({ fetch: fetcher });

  await expectEdgeError(() => auth.identify('access-token'), 'UNKNOWN', 502);
});

Deno.test('maps Graph profile failures to stable safe error codes', async () => {
  const cases = [
    { status: 401, code: 'PROVIDER_AUTH_EXPIRED', edgeStatus: 401 },
    { status: 403, code: 'NOT_AUTHORIZED', edgeStatus: 403 },
    { status: 429, code: 'PROVIDER_RATE_LIMITED', edgeStatus: 429 },
    { status: 500, code: 'UNKNOWN', edgeStatus: 502 },
  ];

  for (const testCase of cases) {
    const { fetcher } = mockFetch(
      jsonResponse({ error: 'private provider details' }, testCase.status),
    );
    const auth = createMicrosoftAuth({ fetch: fetcher });
    const error = await expectEdgeError(
      () => auth.identify('access-token'),
      testCase.code,
      testCase.edgeStatus,
    );

    assertEquals(error.message.includes('private provider details'), false);
  }
});

Deno.test('revoke is an explicit no-op', async () => {
  const { fetcher, calls } = mockFetch();
  const auth = createMicrosoftAuth({ fetch: fetcher });

  await auth.revoke('refresh-token');

  assertEquals(calls, []);
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockFetch(
  ...responses: Response[]
): { fetcher: typeof fetch; calls: FetchCall[] } {
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

function bodyOf(call: FetchCall): string {
  if (typeof call.init?.body !== 'string') {
    throw new Error('Expected a form-encoded request body.');
  }
  return call.init.body;
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
