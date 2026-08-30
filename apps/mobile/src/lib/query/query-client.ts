import { QueryClient } from '@tanstack/react-query';

import { toAppError } from '../errors/app-error';
import { logError } from '../logger';

/**
 * Server state lives here, not in a global store. Defaults are tuned for a
 * calendar: data is fresh for a short while, refetching on reconnect matters
 * more than refetching on every focus, and authorisation failures must not be
 * retried in a loop.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        const { code } = toAppError(error);
        if (code === 'NOT_AUTHENTICATED' || code === 'NOT_AUTHORIZED' || code === 'NOT_FOUND') {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: 0,
      onError: (error) => logError(error),
    },
  },
});

/**
 * Every query key in the app, in one place.
 *
 * Centralising them is what makes invalidation after a mutation reliable — for
 * example, creating an event invalidates `events.window(...)` without each
 * call site having to remember the exact key shape.
 */
export const queryKeys = {
  profile: () => ['profile'] as const,

  calendars: {
    all: () => ['calendars'] as const,
  },

  events: {
    all: () => ['events'] as const,
    window: (startIso: string, endIso: string) => ['events', 'window', startIso, endIso] as const,
    detail: (id: string) => ['events', 'detail', id] as const,
  },

  tasks: {
    all: () => ['tasks'] as const,
    list: (openOnly: boolean) => ['tasks', 'list', openOnly] as const,
    detail: (id: string) => ['tasks', 'detail', id] as const,
    lists: () => ['tasks', 'lists'] as const,
    tags: () => ['tasks', 'tags'] as const,
  },

  integrations: {
    all: () => ['integrations'] as const,
  },

  subscription: () => ['subscription'] as const,
} as const;
