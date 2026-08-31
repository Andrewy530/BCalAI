import type { CreateCalendarInput } from '@cal/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../lib/query/query-client';
import { useAuth, useRequiredUserId } from '../../auth';
import {
  createCalendar,
  deleteCalendar,
  fetchCalendars,
  updateCalendarVisibility,
} from '../api/events.api';

export function useCalendars() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.calendars.all(),
    queryFn: fetchCalendars,
    enabled: isAuthenticated,
    // Calendars change rarely; events change constantly.
    staleTime: 5 * 60_000,
  });
}

/** The calendar new events land in unless the user picks another. */
export function useDefaultCalendarId(): string | null {
  const { data } = useCalendars();
  if (!data || data.length === 0) return null;
  return (data.find((calendar) => calendar.isDefault) ?? data[0])?.id ?? null;
}

export function useCreateCalendar() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCalendarInput) => createCalendar(input, userId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendars.all() });
    },
  });
}

export function useToggleCalendarVisibility() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isVisible }: { id: string; isVisible: boolean }) =>
      updateCalendarVisibility(id, isVisible),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendars.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.events.all() });
    },
  });
}

export function useDeleteCalendar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteCalendar(id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendars.all() });
      // Deleting a calendar cascades to its events.
      void queryClient.invalidateQueries({ queryKey: queryKeys.events.all() });
    },
  });
}
