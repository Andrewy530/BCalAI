import { QueryClient } from '@tanstack/react-query';

import { toAppError } from '../errors/app-error';

/**
 * Web TanStack QueryClient instance.
 * Tuned for a desktop web calendar client:
 * - Authorisation / not found errors are not retried.
 * - Stale time of 30 seconds to prevent unnecessary network queries.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 15 * 60_000,
      refetchOnWindowFocus: true,
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
      onError: (error) => {
        // Log cleanly to browser console in development
        if (import.meta.env.DEV) {
          console.error('[Web Query Error]', error);
        }
      },
    },
  },
});

/**
 * Centralised query keys for the web client.
 */
export const queryKeys = {
  auth: {
    session: () => ['auth', 'session'] as const,
  },
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
  },
  search: (query: string) => ['search', query] as const,
} as const;
