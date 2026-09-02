import { jsonResponse } from '../http/cors.ts';

/**
 * Mirrors ERROR_CODES in packages/types so a code seen in the app matches a
 * code seen in the function logs.
 */
export type EdgeErrorCode =
  | 'UNKNOWN'
  | 'NOT_AUTHENTICATED'
  | 'NOT_AUTHORIZED'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'METHOD_NOT_ALLOWED'
  | 'SUBSCRIPTION_REQUIRED'
  | 'AI_RATE_LIMITED'
  | 'NETWORK_UNAVAILABLE'
  | 'PROVIDER_AUTH_EXPIRED'
  | 'PROVIDER_SYNC_CURSOR_INVALID'
  | 'EVENT_PROVIDER_CONFLICT'
  | 'PROVIDER_RATE_LIMITED'
  | 'AI_TASK_NOT_SCHEDULABLE'
  | 'AI_TASK_DURATION_REQUIRED'
  | 'AI_SCHEDULING_WINDOW_INVALID'
  | 'AI_DEFAULT_CALENDAR_MISSING'
  | 'AI_NO_VALID_SLOT'
  | 'AI_RATE_LIMITED'
  | 'AI_INVALID_OUTPUT'
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_PROPOSAL_STALE';

export class EdgeError extends Error {
  constructor(
    readonly code: EdgeErrorCode,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'EdgeError';
  }
}

/**
 * Wrap every handler in this. It guarantees a consistent JSON error envelope
 * and, importantly, that an unexpected exception never leaks its message —
 * which may contain provider payloads — to the client.
 */
export function withErrorHandling(
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof EdgeError) {
        console.error(JSON.stringify({ code: error.code, message: error.message }));
        return jsonResponse({ error: { code: error.code, message: error.message } }, error.status);
      }

      console.error(JSON.stringify({ code: 'UNKNOWN', detail: String(error) }));
      return jsonResponse({ error: { code: 'UNKNOWN', message: 'Something went wrong.' } }, 500);
    }
  };
}
