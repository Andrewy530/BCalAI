import { AuthError, PostgrestError } from '@supabase/supabase-js';
import { ZodError } from 'zod';

import type { AppError, ErrorCode } from '@cal/types';

/**
 * Convert anything thrown anywhere into a stable `AppError`.
 *
 * Two rules: the `message` is always safe to show a user, and the `code` is
 * always stable enough to grep for in logs and dashboards.
 */
export function toAppError(cause: unknown): AppError {
  if (isAppError(cause)) return cause;

  if (cause instanceof ZodError) {
    const first = cause.issues[0];
    return {
      code: 'VALIDATION_FAILED',
      message: first?.message ?? 'Some of those details are not valid.',
      cause,
    };
  }

  if (cause instanceof AuthError) {
    return {
      code: authCodeFor(cause),
      message: friendlyAuthMessage(cause),
      cause,
    };
  }

  if (isPostgrestError(cause)) {
    // 42501 is Postgres' insufficient_privilege — in practice, an RLS denial.
    if (cause.code === '42501') {
      return { code: 'NOT_AUTHORIZED', message: 'You do not have access to that.', cause };
    }
    if (cause.code === 'PGRST116') {
      return { code: 'NOT_FOUND', message: 'That item no longer exists.', cause };
    }
    return { code: 'UNKNOWN', message: 'Something went wrong saving your changes.', cause };
  }

  if (cause instanceof TypeError && /network|fetch/i.test(cause.message)) {
    return {
      code: 'NETWORK_UNAVAILABLE',
      message: 'You appear to be offline. Your changes will sync when you reconnect.',
      cause,
    };
  }

  return { code: 'UNKNOWN', message: 'Something went wrong. Please try again.', cause };
}

function authCodeFor(error: AuthError): ErrorCode {
  if (error.status === 401 || error.status === 403) return 'NOT_AUTHENTICATED';
  return 'UNKNOWN';
}

function friendlyAuthMessage(error: AuthError): string {
  const message = error.message.toLowerCase();
  if (message.includes('invalid login')) return 'That email or password is not right.';
  if (message.includes('already registered')) return 'There is already an account with that email.';
  if (message.includes('email not confirmed')) return 'Confirm your email address to sign in.';
  return 'We could not sign you in. Please try again.';
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    typeof (value as AppError).message === 'string'
  );
}

function isPostgrestError(value: unknown): value is PostgrestError {
  return typeof value === 'object' && value !== null && 'code' in value && 'details' in value;
}
