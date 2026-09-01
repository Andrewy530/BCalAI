import { EdgeError } from '../../errors/index.ts';

/**
 * The operation tells the transport whether a 410 means an expired delta
 * cursor. Keeping that context at the request boundary prevents a watch
 * response or ordinary event request from being mistaken for a resync signal.
 */
export type MicrosoftRequestOperation = 'calendar' | 'delta' | 'event' | 'watch';

export interface MicrosoftRequest {
  accessToken: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  url: string;
  body?: unknown;
  /** Sent for conditional event writes when Graph provides an @odata.etag. */
  etag?: string | null;
  operation: MicrosoftRequestOperation;
  /** Opt in only when the operation is idempotent or has a Graph transaction id. */
  replaySafe?: boolean;
}

export interface MicrosoftClientDeps {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export type MicrosoftFetch = (request: MicrosoftRequest) => Promise<unknown>;

const MAX_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 8_000;
const INITIAL_RETRY_DELAY_MS = 250;

/** Create an authenticated Graph transport with deterministic retry seams. */
export function createMicrosoftClient(deps: MicrosoftClientDeps = {}): MicrosoftFetch {
  const fetcher = deps.fetch ?? fetch;
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? defaultSleep;

  return async (request) => {
    const method = request.method ?? 'GET';
    const replaySafe = request.replaySafe ?? method === 'GET';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await fetcher(request.url, {
          method,
          headers: buildHeaders(request),
          body: request.body === undefined ? undefined : JSON.stringify(request.body),
        });
      } catch {
        if (!replaySafe || attempt === MAX_ATTEMPTS) {
          throw new EdgeError('NETWORK_UNAVAILABLE', 'Could not reach Microsoft.', 503);
        }
        await sleep(retryDelay(null, attempt, now));
        continue;
      }

      if (response.ok) return readSuccessBody(response);

      if (replaySafe && isRetryable(response.status) && attempt < MAX_ATTEMPTS) {
        await sleep(retryDelay(response, attempt, now));
        continue;
      }

      throw translateFailure(response.status, request.operation);
    }

    // The loop always either returns or throws, but this keeps the return type
    // explicit if the retry policy is changed in the future.
    throw new EdgeError('UNKNOWN', 'Microsoft request failed.', 502);
  };
}

/** The production transport; response bodies remain unknown to this layer. */
export const microsoftFetch: MicrosoftFetch = createMicrosoftClient();

function buildHeaders(request: MicrosoftRequest): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${request.accessToken}`,
    Accept: 'application/json',
  };
  if (request.body !== undefined) headers['Content-Type'] = 'application/json';
  if (request.etag) headers['If-Match'] = request.etag;
  return headers;
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function retryDelay(response: Response | null, attempt: number, now: () => number): number {
  const retryAfter = response?.headers.get('Retry-After');
  const hinted = retryAfter === null || retryAfter === undefined
    ? null
    : parseRetryAfter(retryAfter, now());
  if (hinted !== null) return Math.min(hinted, MAX_RETRY_DELAY_MS);

  return Math.min(
    INITIAL_RETRY_DELAY_MS * 2 ** (attempt - 1),
    MAX_RETRY_DELAY_MS,
  );
}

/** Retry-After is either delta-seconds or an HTTP-date. */
function parseRetryAfter(value: string, now: number): number | null {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (Number.isFinite(seconds)) return seconds * 1000;
    return null;
  }

  // Date.parse accepts a number of non-HTTP date strings. Require letters so
  // malformed numeric values such as "2.5" cannot be treated as a date.
  if (!/[A-Za-z]/.test(trimmed)) return null;

  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(timestamp - now, 0);
}

async function readSuccessBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return null;

  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new EdgeError('UNKNOWN', 'Microsoft returned a response we could not read.', 502);
  }
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new EdgeError('UNKNOWN', 'Microsoft returned a response we could not read.', 502);
  }
}

function translateFailure(status: number, operation: MicrosoftRequestOperation): EdgeError {
  switch (status) {
    case 401:
      return new EdgeError('PROVIDER_AUTH_EXPIRED', 'Reconnect your Microsoft account.', 401);
    case 403:
      return new EdgeError('NOT_AUTHORIZED', 'Microsoft denied access to that resource.', 403);
    case 404:
      return new EdgeError(
        'NOT_FOUND',
        'That Microsoft calendar or event no longer exists.',
        404,
      );
    case 409:
    case 412:
      return new EdgeError('EVENT_PROVIDER_CONFLICT', 'That event changed in Microsoft.', 409);
    case 410:
      return operation === 'delta'
        ? new EdgeError('PROVIDER_SYNC_CURSOR_INVALID', 'The sync cursor expired.', 410)
        : new EdgeError('UNKNOWN', 'Microsoft rejected the request.', 502);
    case 429:
      return new EdgeError(
        'PROVIDER_RATE_LIMITED',
        'Microsoft is temporarily rate limiting requests.',
        429,
      );
    default:
      return new EdgeError(
        'UNKNOWN',
        status >= 500 ? 'Microsoft is unavailable.' : 'Microsoft rejected the request.',
        502,
      );
  }
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
