import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import type { CreateEventInput, UpdateEventInput } from '@cal/schemas';

import { queryKeys } from '../../../lib/query/query-client';
import { useAuth, useRequiredUserId } from '../../auth';
import {
  createEvent,
  deleteEvent,
  fetchEvent,
  fetchEventsInWindow,
  updateEvent,
} from '../api/events.api';

/**
 * Events for a time window.
 *
 * The window is part of the query key, so panning the calendar produces cache
 * hits for ranges already visited rather than a refetch. Master rows for
 * recurring series come back with every window and are expanded downstream.
 */
export function useEventsInWindow(start: Date, end: Date) {
  const { isAuthenticated } = useAuth();
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  return useQuery({
    queryKey: queryKeys.events.window(startIso, endIso),
    queryFn: () => fetchEventsInWindow(new Date(startIso), new Date(endIso)),
    enabled: isAuthenticated,
    // Keep the previous window on screen while the next one loads, so panning
    // does not flash an empty calendar.
    placeholderData: (previous) => previous,
  });
}

export function useEvent(id: string | null) {
  return useQuery({
    queryKey: queryKeys.events.detail(id ?? 'none'),
    queryFn: () => fetchEvent(id as string),
    enabled: !!id,
  });
}

/** Any event mutation can affect any cached window, so invalidate them all. */
function useInvalidateEvents() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.events.all() });
}

export function useCreateEvent() {
  const userId = useRequiredUserId();
  const invalidate = useInvalidateEvents();

  return useMutation({
    mutationFn: (input: CreateEventInput) => createEvent(input, userId),
    onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    onSettled: () => void invalidate(),
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateEvents();

  return useMutation({
    mutationFn: (input: UpdateEventInput) => updateEvent(input),
    onSuccess: (event) => {
      queryClient.setQueryData(queryKeys.events.detail(event.id), event);
    },
    onSettled: () => void invalidate(),
  });
}

export function useDeleteEvent() {
  const invalidate = useInvalidateEvents();

  return useMutation({
    mutationFn: (id: string) => deleteEvent(id),
    onSuccess: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
    onSettled: () => void invalidate(),
  });
}
