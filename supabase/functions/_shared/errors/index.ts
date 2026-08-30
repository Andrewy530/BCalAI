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
  | 'AI_RATE_LIMITED';

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
      return jsonResponse(
        { error: { code: 'UNKNOWN', message: 'Something went wrong.' } },
        500,
      );
    }
  };
}
