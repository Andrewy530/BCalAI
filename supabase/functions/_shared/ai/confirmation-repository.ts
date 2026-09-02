import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { EdgeError } from '../errors/index.ts';

const uuidSchema = z.string().uuid();
const requestStatusSchema = z.enum(['pending', 'proposed', 'accepted', 'rejected', 'failed']);
const eventStatusSchema = z.enum(['confirmed', 'tentative', 'cancelled']);
const sourceTypeSchema = z.enum(['internal', 'google', 'microsoft', 'device']);
const syncStatusSchema = z.enum(['synced', 'pending', 'failed', 'conflict']);
const taskStatusSchema = z.enum(['open', 'scheduled', 'completed', 'archived']);

const suggestionRowSchema = z.object({
  id: uuidSchema,
  request_id: uuidSchema,
  start_at: z.string(),
  end_at: z.string(),
  accepted_at: z.string().nullable(),
});

const requestRowSchema = z.object({
  id: uuidSchema,
  user_id: uuidSchema,
  task_id: uuidSchema,
  status: requestStatusSchema,
  constraints: z.unknown(),
  target_calendar_id: uuidSchema.nullable(),
  task_version: z.string().nullable(),
  profile_version: z.string().nullable(),
  target_calendar_version: z.string().nullable(),
  accepted_event_id: uuidSchema.nullable(),
});

const confirmationRowSchema = z.object({
  status: z.enum(['accepted', 'stale', 'not_found']),
  event_id: uuidSchema.nullable(),
});

const eventRowSchema = z.object({
  id: uuidSchema,
  user_id: uuidSchema,
  calendar_id: uuidSchema,
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  start_at: z.string(),
  end_at: z.string(),
  all_day: z.boolean(),
  timezone: z.string(),
  status: eventStatusSchema,
  recurrence_rule: z.string().nullable(),
  alerts: z.array(z.number()),
  source_type: sourceTypeSchema,
  provider_event_id: z.string().nullable(),
  recurring_event_id: z.string().nullable(),
  recurrence_original_start_at: z.string().nullable(),
  provider_etag: z.string().nullable(),
  provider_updated_at: z.string().nullable(),
  sync_status: syncStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
});

const taskRowSchema = z.object({
  id: uuidSchema,
  user_id: uuidSchema,
  title: z.string(),
  status: taskStatusSchema,
  scheduled_event_id: uuidSchema.nullable(),
  updated_at: z.string(),
});

const EVENT_COLUMNS =
  'id, user_id, calendar_id, title, description, location, start_at, end_at, all_day, ' +
  'timezone, status, recurrence_rule, alerts, source_type, provider_event_id, provider_etag, ' +
  'recurring_event_id, recurrence_original_start_at, provider_updated_at, sync_status, ' +
  'created_at, updated_at';

export interface PersistedAiConfirmation {
  suggestionId: string;
  requestId: string;
  taskId: string;
  requestStatus: z.infer<typeof requestStatusSchema>;
  constraints: unknown;
  targetCalendarId: string | null;
  taskVersion: string | null;
  profileVersion: string | null;
  targetCalendarVersion: string | null;
  acceptedEventId: string | null;
  startAt: string;
  endAt: string;
  acceptedAt: string | null;
}

export interface ConfirmationAttempt {
  status: 'accepted' | 'stale' | 'not_found';
  eventId: string | null;
}

export interface ConfirmedEvent {
  id: string;
  userId: string;
  calendarId: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string;
  status: z.infer<typeof eventStatusSchema>;
  recurrenceRule: string | null;
  alerts: number[];
  sourceType: z.infer<typeof sourceTypeSchema>;
  providerEventId: string | null;
  recurringEventId: string | null;
  recurrenceOriginalStartAt: string | null;
  providerEtag: string | null;
  providerUpdatedAt: string | null;
  syncStatus: z.infer<typeof syncStatusSchema>;
  createdAt: string;
  updatedAt: string;
}

export interface ConfirmedTask {
  id: string;
  userId: string;
  title: string;
  status: z.infer<typeof taskStatusSchema>;
  scheduledEventId: string | null;
  updatedAt: string;
}

export interface ConfirmedSchedule {
  event: ConfirmedEvent;
  task: ConfirmedTask;
}

export interface AiConfirmationRepository {
  loadSuggestion(userId: string, suggestionId: string): Promise<PersistedAiConfirmation | null>;
  confirmSuggestion(userId: string, suggestionId: string): Promise<ConfirmationAttempt>;
  loadCanonicalSchedule(
    userId: string,
    eventId: string,
    taskId: string,
  ): Promise<ConfirmedSchedule | null>;
}

export function supabaseAiConfirmationRepository(admin: SupabaseClient): AiConfirmationRepository {
  return {
    async loadSuggestion(userId, suggestionId) {
      const { data: suggestionData, error: suggestionError } = await admin
        .from('ai_schedule_suggestions')
        .select('id, request_id, start_at, end_at, accepted_at')
        .eq('id', suggestionId)
        .maybeSingle();
      if (suggestionError) throw persistenceError('load_suggestion', suggestionError.code);
      if (!suggestionData) return null;
      const suggestion = suggestionRowSchema.parse(suggestionData);

      const { data: requestData, error: requestError } = await admin
        .from('ai_schedule_requests')
        .select(
          'id, task_id, status, constraints, target_calendar_id, task_version, ' +
            'profile_version, target_calendar_version, accepted_event_id, user_id',
        )
        .eq('id', suggestion.request_id)
        .eq('user_id', userId)
        .maybeSingle();
      if (requestError) throw persistenceError('load_request', requestError.code);
      if (!requestData) return null;

      const request = requestRowSchema.parse(requestData);
      if (request.user_id !== userId) return null;
      return {
        suggestionId: suggestion.id,
        requestId: request.id,
        taskId: request.task_id,
        requestStatus: request.status,
        constraints: request.constraints,
        targetCalendarId: request.target_calendar_id,
        taskVersion: request.task_version,
        profileVersion: request.profile_version,
        targetCalendarVersion: request.target_calendar_version,
        acceptedEventId: request.accepted_event_id,
        startAt: suggestion.start_at,
        endAt: suggestion.end_at,
        acceptedAt: suggestion.accepted_at,
      };
    },

    async confirmSuggestion(userId, suggestionId) {
      const { data, error } = await admin.rpc('confirm_ai_schedule_suggestion', {
        p_user_id: userId,
        p_suggestion_id: suggestionId,
      });
      if (error) throw persistenceError('confirm_suggestion', error.code);

      const parsed = z.array(confirmationRowSchema).safeParse(data ?? []);
      if (!parsed.success || parsed.data.length !== 1) {
        throw persistenceError('confirm_suggestion', 'invalid_result');
      }
      const row = parsed.data[0];
      if (!row) throw persistenceError('confirm_suggestion', 'missing_result');
      if (row.status === 'accepted' && row.event_id === null) {
        throw persistenceError('confirm_suggestion', 'accepted_without_event');
      }
      return { status: row.status, eventId: row.event_id };
    },

    async loadCanonicalSchedule(userId, eventId, taskId) {
      const { data: eventData, error: eventError } = await admin
        .from('events')
        .select(EVENT_COLUMNS)
        .eq('id', eventId)
        .eq('user_id', userId)
        .maybeSingle();
      if (eventError) throw persistenceError('load_event', eventError.code);
      if (!eventData) return null;

      const { data: taskData, error: taskError } = await admin
        .from('tasks')
        .select('id, user_id, title, status, scheduled_event_id, updated_at')
        .eq('id', taskId)
        .eq('user_id', userId)
        .maybeSingle();
      if (taskError) throw persistenceError('load_task', taskError.code);
      if (!taskData) return null;

      const event = eventRowSchema.parse(eventData);
      const task = taskRowSchema.parse(taskData);
      return {
        event: {
          id: event.id,
          userId: event.user_id,
          calendarId: event.calendar_id,
          title: event.title,
          description: event.description,
          location: event.location,
          startAt: event.start_at,
          endAt: event.end_at,
          allDay: event.all_day,
          timezone: event.timezone,
          status: event.status,
          recurrenceRule: event.recurrence_rule,
          alerts: event.alerts,
          sourceType: event.source_type,
          providerEventId: event.provider_event_id,
          recurringEventId: event.recurring_event_id,
          recurrenceOriginalStartAt: event.recurrence_original_start_at,
          providerEtag: event.provider_etag,
          providerUpdatedAt: event.provider_updated_at,
          syncStatus: event.sync_status,
          createdAt: event.created_at,
          updatedAt: event.updated_at,
        },
        task: {
          id: task.id,
          userId: task.user_id,
          title: task.title,
          status: task.status,
          scheduledEventId: task.scheduled_event_id,
          updatedAt: task.updated_at,
        },
      };
    },
  };
}

function persistenceError(operation: string, detail: string | undefined): EdgeError {
  console.error(JSON.stringify({ code: 'AI_CONFIRMATION_PERSISTENCE_FAILED', operation, detail }));
  return new EdgeError('UNKNOWN', 'Could not confirm the Find Time suggestion.', 500);
}
