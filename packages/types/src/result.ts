/**
 * Explicit result type for operations that fail for expected, user-facing
 * reasons (a sync cursor expired, no slot was found). Reserve `throw` for
 * genuinely exceptional conditions.
 */
export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/** Stable, greppable error codes. See docs/architecture.md § Observability. */
export const ERROR_CODES = [
  'UNKNOWN',
  'NETWORK_UNAVAILABLE',
  'NOT_AUTHENTICATED',
  'NOT_AUTHORIZED',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'GOOGLE_AUTH_EXPIRED',
  'GOOGLE_SYNC_CURSOR_INVALID',
  'PROVIDER_RATE_LIMITED',
  'MICROSOFT_SUBSCRIPTION_EXPIRED',
  'EVENT_PROVIDER_CONFLICT',
  'AI_NO_VALID_SLOT',
  'AI_RATE_LIMITED',
  'AI_INVALID_OUTPUT',
  'SUBSCRIPTION_REQUIRED',
  'NOTIFICATION_PERMISSION_DENIED',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface AppError {
  code: ErrorCode;
  /** Safe to show to the user. Never include provider payloads here. */
  message: string;
  cause?: unknown;
}
