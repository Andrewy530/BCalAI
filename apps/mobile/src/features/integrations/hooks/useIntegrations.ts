import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../lib/query/query-client';
import {
  disconnectAccount,
  fetchConnections,
  fetchProviderCalendars,
  fetchSyncHealth,
  requestSync,
  setCalendarImported,
} from '../api/integrations.api';

/**
 * Server state for connected calendars.
 *
 * Sync health is polled rather than pushed: the work that changes it happens on
 * the server after the request that started it has already returned, so there
 * is nothing for the client to await. Polling is deliberately slow and only
 * while the screen is open — this is a settings screen, not a live dashboard.
 */

export function useConnections() {
  return useQuery({
    queryKey: queryKeys.integrations.all(),
    queryFn: fetchConnections,
  });
}

export function useSyncHealth(options: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.integrations.health(),
    queryFn: fetchSyncHealth,
    refetchInterval: options.poll ? 10_000 : false,
  });
}

export function useProviderCalendars(providerAccountId: string | null) {
  return useQuery({
    queryKey: queryKeys.integrations.calendars(providerAccountId ?? 'none'),
    queryFn: () => fetchProviderCalendars(providerAccountId as string),
    enabled: Boolean(providerAccountId),
    // A provider round trip, so it is worth holding on to while the picker is
    // open — but not so long that a calendar renamed in Google looks stuck.
    staleTime: 60_000,
  });
}

export function useToggleCalendarImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: setCalendarImported,
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.integrations.calendars(variables.providerAccountId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.integrations.health() });
      // A newly imported calendar changes what the calendar views should show,
      // and its events arrive over the following seconds.
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendars.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.events.all() });
    },
  });
}

export function useDisconnectAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: disconnectAccount,
    onSuccess: () => {
      // Disconnecting cascades away the account's calendars and their events,
      // so everything downstream of it has to be re-read.
      void queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.integrations.health() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendars.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.events.all() });
    },
  });
}

export function useSyncNow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (calendarId?: string) => requestSync(calendarId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.events.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.integrations.health() });
    },
  });
}
