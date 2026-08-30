import { EdgeError } from '../../errors/index.ts';

/**
 * The single place a request leaves for Google.
 *
 * Every caller goes through here so that three things are guaranteed: a
 * provider status code is translated into one of our stable error codes exactly
 * once, a rate limit is retried rather than surfaced as a sync failure, and a
 * provider response body is never attached to an error that could reach the
 * client.
 */

export interface GoogleRequest {
  accessToken: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  body?: unknown;
  /** Sent as `If-Match` so a concurrent provider edit is a 412, not a clobber. */
  etag?: string | null;
}

const MAX_ATTEMPTS = 3;

export async function googleFetch(request: GoogleRequest): Promise<unknown> {
  const response = await sendWithRetry(request);

  if (response.status === 204 || response.status === 205) return null;

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new EdgeError('UNKNOWN', 'Google returned a response we could not read.', 502);
  }
}

async function sendWithRetry(request: GoogleRequest): Promise<Response> {
  let lastError: EdgeError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response;

    try {
      response = await fetch(request.url, {
        method: request.method ?? 'GET',
        headers: buildHeaders(request),
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
      });
    } catch (cause) {
      // A transport failure is worth one more try; it is usually a cold socket.
      lastError = new EdgeError('NETWORK_UNAVAILABLE', 'Could not reach Google.', 503);
      console.error(JSON.stringify({ code: 'NETWORK_UNAVAILABLE', attempt, detail: String(cause) }));
      if (attempt === MAX_ATTEMPTS) throw lastError;
      await backoff(attempt, null);
      continue;
    }

    if (response.ok) return response;

    // 403 is overloaded: it is both "rate limited" and "forbidden". Only the
    // rate-limit reasons are worth retrying, and they are distinguishable only
    // by reading the body, so consume it here rather than guessing.
    const detail = await safeReadError(response);

    if (response.status === 429 || (response.status === 403 && isRateLimit(detail))) {
      lastError = new EdgeError('PROVIDER_RATE_LIMITED', 'Google is rate limiting us.', 429);
      if (attempt === MAX_ATTEMPTS) throw lastError;
      await backoff(attempt, response.headers.get('Retry-After'));
      continue;
    }

    if (response.status >= 500) {
      lastError = new EdgeError('UNKNOWN', 'Google is unavailable.', 502);
      if (attempt === MAX_ATTEMPTS) throw lastError;
      await backoff(attempt, null);
      continue;
    }

    throw translate(response.status, detail);
  }

  throw lastError ?? new EdgeError('UNKNOWN', 'Google request failed.', 502);
}

function buildHeaders(request: GoogleRequest): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${request.accessToken}`,
    Accept: 'application/json',
  };
  if (request.body !== undefined) headers['Content-Type'] = 'application/json';
  if (request.etag) headers['If-Match'] = request.etag;
  return headers;
}

/**
 * Provider status → our vocabulary.
 *
 * 410 is the important one: it is how Google says a `syncToken` has aged out,
 * and the caller must respond by discarding the cursor and doing a full
 * resync rather than by retrying.
 */
function translate(status: number, reason: string | null): EdgeError {
  switch (status) {
    case 401:
      return new EdgeError('GOOGLE_AUTH_EXPIRED', 'Reconnect your Google account.', 401);
    case 403:
      return new EdgeError('NOT_AUTHORIZED', 'Google denied access to that calendar.', 403);
    case 404:
      return new EdgeError('NOT_FOUND', 'That calendar or event no longer exists in Google.', 404);
    case 409:
    case 412:
      return new EdgeError('EVENT_PROVIDER_CONFLICT', 'That event changed in Google.', 409);
    case 410:
      return new EdgeError('GOOGLE_SYNC_CURSOR_INVALID', 'The sync cursor expired.', 410);
    default:
      // The reason string is a Google enum ("notFound", "rateLimitExceeded"),
      // never user content, so it is safe to log — but it is not returned.
      console.error(JSON.stringify({ code: 'GOOGLE_HTTP_ERROR', status, reason }));
      return new EdgeError('UNKNOWN', 'Google rejected the request.', 502);
  }
}

/** Read only the machine-readable reason, never the message or payload. */
async function safeReadError(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as {
      error?: { errors?: Array<{ reason?: string }>; status?: string };
    };
    return body.error?.errors?.[0]?.reason ?? body.error?.status ?? null;
  } catch {
    return null;
  }
}

function isRateLimit(reason: string | null): boolean {
  return (
    reason === 'rateLimitExceeded' ||
    reason === 'userRateLimitExceeded' ||
    reason === 'RESOURCE_EXHAUSTED'
  );
}

async function backoff(attempt: number, retryAfter: string | null): Promise<void> {
  const hinted = retryAfter ? Number(retryAfter) * 1000 : NaN;
  // Jitter matters here: several calendars for one account tend to fail
  // together, and un-jittered backoff would have them all retry in lockstep.
  const delay = Number.isFinite(hinted)
    ? Math.min(hinted, 8_000)
    : 2 ** attempt * 250 + Math.random() * 250;

  await new Promise((resolve) => setTimeout(resolve, delay));
}
