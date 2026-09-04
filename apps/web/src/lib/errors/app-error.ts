import type { AppError, ErrorCode } from '@cal/types';
import { AuthError, type PostgrestError } from '@supabase/supabase-js';
import { ZodError } from 'zod';

/**
 * Normalise any caught error into a structured, safe AppError.
 */
export function toAppError(cause: unknown): AppError {
  if (isAppError(cause)) return cause;

  if (cause instanceof ZodError) {
    const first = cause.issues[0];
    return {
      code: 'VALIDATION_FAILED',
      message: first?.message ?? 'Some of the provided details are invalid.',
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
    if (cause.code === '42501') {
      return { code: 'NOT_AUTHORIZED', message: 'You do not have access to that resource.', cause };
    }
    if (cause.code === 'PGRST116') {
      return { code: 'NOT_FOUND', message: 'That item was not found.', cause };
    }
    return { code: 'UNKNOWN', message: 'Something went wrong processing your request.', cause };
  }

  if (cause instanceof TypeError && /network|fetch/i.test(cause.message)) {
    return {
      code: 'NETWORK_UNAVAILABLE',
      message: 'Network connection unavailable. Please check your internet connection.',
      cause,
    };
  }

  if (cause instanceof Error) {
    return {
      code: 'UNKNOWN',
      message: cause.message || 'An unexpected error occurred.',
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
  if (message.includes('invalid login')) return 'Invalid email or password.';
  if (message.includes('already registered')) return 'An account with that email already exists.';
  if (message.includes('email not confirmed'))
    return 'Please confirm your email address to sign in.';
  return error.message || 'Authentication failed. Please try again.';
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
