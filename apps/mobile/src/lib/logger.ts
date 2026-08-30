import { isDevelopment } from './env';
import { toAppError } from './errors/app-error';

/**
 * The single logging seam. Everything goes through here so that wiring Sentry
 * up later (Sprint 7) is a change in one file.
 *
 * Never log calendar titles, event descriptions, task contents, or anything
 * from a user's email. Log codes, ids, and counts.
 */
export interface LogContext {
  [key: string]: string | number | boolean | undefined;
}

export function logError(cause: unknown, context?: LogContext): void {
  const error = toAppError(cause);

  if (isDevelopment) {
    // eslint-disable-next-line no-console
    console.error(`[${error.code}] ${error.message}`, context ?? '', error.cause ?? '');
    return;
  }

  // TODO(sprint-7): Sentry.captureException(error.cause ?? error, { tags: { code }, extra });
}

export function logEvent(name: string, context?: LogContext): void {
  if (isDevelopment) {
    // eslint-disable-next-line no-console
    console.warn(`[event] ${name}`, context ?? '');
  }
}
