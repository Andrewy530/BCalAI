import type { Calendar, CreateEventInput } from '@cal/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import { useCalendars } from './useCalendars';
import { queryKeys } from '../../../lib/query/query-client';
import { useAuth, useRequiredUserId } from '../../auth';
import {
  writeProviderEvent,
  type ProviderEventDraft,
} from '../../integrations/api/integrations.api';
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

/**
 * Which calendars this database owns, and which a provider owns.
 *
 * Every mutation below asks this first, because the answer changes where the
 * write goes: an internal calendar is written straight to Postgres, and a
 * synced one has to go out to the provider before anything is stored locally
 * (`docs/architecture.md` § Decision A).
 */
function useCalendarSourceLookup() {
  const { data: calendars } = useCalendars();

  return (calendarId: string | undefined): Calendar | undefined =>
    calendars?.find((calendar) => calendar.id === calendarId);
}

/** The editor's fields, in the shape the provider write path expects. */
function toDraft(input: CreateEventInput): ProviderEventDraft {
  return {
    title: input.title,
    description: input.description ?? null,
    location: input.location ?? null,
    startAt: input.startAt,
    endAt: input.endAt,
    allDay: input.allDay,
    timezone: input.timezone,
    recurrenceRule: input.recurrenceRule ?? null,
    alerts: input.alerts,
  };
}

export function useCreateEvent() {
  const userId = useRequiredUserId();
  const invalidate = useInvalidateEvents();
  const calendarFor = useCalendarSourceLookup();

  return useMutation({
    mutationFn: async (input: CreateEventInput) => {
      const calendar = calendarFor(input.calendarId);

      if (calendar && calendar.sourceType !== 'internal') {
        await writeProviderEvent({
          operation: 'create',
          calendarId: input.calendarId,
          draft: toDraft(input),
        });
        return;
      }

      await createEvent(input, userId);
    },
    onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    onSettled: () => void invalidate(),
  });
}

/**
 * The editor always holds every field, so an update carries the whole event
 * rather than a patch. A provider write replaces the event's fields outright,
 * and a partial patch could not express that faithfully.
 */
export type UpdateEventPayload = CreateEventInput & { id: string };

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateEvents();
  const calendarFor = useCalendarSourceLookup();

  return useMutation({
    mutationFn: async (input: UpdateEventPayload) => {
      const calendar = calendarFor(input.calendarId);

      if (calendar && calendar.sourceType !== 'internal') {
        await writeProviderEvent({
          operation: 'update',
          eventId: input.id,
          draft: toDraft(input),
        });
        return;
      }

      const event = await updateEvent(input);
      queryClient.setQueryData(queryKeys.events.detail(event.id), event);
    },
    onSettled: () => void invalidate(),
  });
}

export function useDeleteEvent() {
  const invalidate = useInvalidateEvents();
  const calendarFor = useCalendarSourceLookup();

  return useMutation({
    mutationFn: async ({ id, calendarId }: { id: string; calendarId: string }) => {
      const calendar = calendarFor(calendarId);

      if (calendar && calendar.sourceType !== 'internal') {
        await writeProviderEvent({ operation: 'delete', eventId: id });
        return;
      }

      await deleteEvent(id);
    },
    onSuccess: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
    onSettled: () => void invalidate(),
  });
}
