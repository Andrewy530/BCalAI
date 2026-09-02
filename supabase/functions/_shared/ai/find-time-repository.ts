import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type {
  FindTimeDataSource,
  FindTimeProfile,
  FindTimeTargetCalendar,
  FindTimeTask,
} from './find-time.ts';
import { EdgeError } from '../errors/index.ts';

const taskRowSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    status: z.enum(['open', 'scheduled', 'completed', 'archived']),
    priority: z.enum(['low', 'normal', 'high', 'urgent']),
    due_at: z.string().nullable(),
    has_due_time: z.boolean(),
    estimated_minutes: z.number().int().nullable(),
    scheduled_event_id: z.string().uuid().nullable(),
    is_flexible: z.boolean(),
    updated_at: z.string(),
  })
  .transform((row): FindTimeTask => ({
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    dueAt: row.due_at,
    hasDueTime: row.has_due_time,
    estimatedMinutes: row.estimated_minutes,
    scheduledEventId: row.scheduled_event_id,
    isFlexible: row.is_flexible,
    updatedAt: row.updated_at,
  }));

const profileRowSchema = z
  .object({ timezone: z.string(), working_hours: z.unknown() })
  .transform((row): FindTimeProfile => ({
    timezone: row.timezone,
    workingHours: row.working_hours,
  }));

const targetCalendarRowSchema = z
  .object({ id: z.string().uuid(), name: z.string() })
  .transform((row): FindTimeTargetCalendar => row);

const eventRowSchema = z
  .object({
    calendar_id: z.string().uuid(),
    start_at: z.string(),
    end_at: z.string(),
    timezone: z.string(),
    status: z.enum(['confirmed', 'tentative', 'cancelled']),
    recurrence_rule: z.string().nullable(),
    source_type: z.enum(['internal', 'google', 'microsoft', 'device']),
    provider_event_id: z.string().nullable(),
    recurring_event_id: z.string().nullable(),
    recurrence_original_start_at: z.string().nullable(),
  })
  .transform((row) => ({
    calendarId: row.calendar_id,
    startAt: row.start_at,
    endAt: row.end_at,
    timezone: row.timezone,
    status: row.status,
    recurrenceRule: row.recurrence_rule,
    sourceType: row.source_type,
    providerEventId: row.provider_event_id,
    recurringEventId: row.recurring_event_id,
    recurrenceOriginalStartAt: row.recurrence_original_start_at,
  }));

const TASK_COLUMNS =
  'id, title, status, priority, due_at, has_due_time, estimated_minutes, ' +
  'scheduled_event_id, is_flexible, updated_at';
const EVENT_COLUMNS =
  'calendar_id, start_at, end_at, timezone, status, recurrence_rule, source_type, ' +
  'provider_event_id, recurring_event_id, recurrence_original_start_at';

export function supabaseFindTimeDataSource(admin: SupabaseClient): FindTimeDataSource {
  return {
    async loadTask(userId, taskId) {
      const { data, error } = await admin
        .from('tasks')
        .select(TASK_COLUMNS)
        .eq('id', taskId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw databaseReadError('task', error.code);
      return data ? taskRowSchema.parse(data) : null;
    },

    async loadProfile(userId) {
      const { data, error } = await admin
        .from('profiles')
        .select('timezone, working_hours')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw databaseReadError('planning preferences', error.code);
      return data ? profileRowSchema.parse(data) : null;
    },

    async loadTargetCalendar(userId) {
      const { data, error } = await admin
        .from('calendars')
        .select('id, name')
        .eq('user_id', userId)
        .eq('source_type', 'internal')
        .eq('is_default', true)
        .maybeSingle();
      if (error) throw databaseReadError('default calendar', error.code);
      return data ? targetCalendarRowSchema.parse(data) : null;
    },

    async loadEvents(userId, window) {
      const start = window.start.toISOString();
      const end = window.end.toISOString();
      const { data, error } = await admin
        .from('events')
        .select(EVENT_COLUMNS)
        .eq('user_id', userId)
        .or(
          `and(status.neq.cancelled,start_at.lt.${end},end_at.gt.${start}),` +
            'recurrence_rule.not.is.null,' +
            `and(recurring_event_id.not.is.null,recurrence_original_start_at.gte.${start},` +
            `recurrence_original_start_at.lt.${end})`,
        )
        .order('start_at');
      if (error) throw databaseReadError('calendar events', error.code);
      return z.array(eventRowSchema).parse(data ?? []);
    },
  };
}

function databaseReadError(resource: string, detail: string | undefined): EdgeError {
  console.error(JSON.stringify({ code: 'AI_CONTEXT_READ_FAILED', resource, detail }));
  return new EdgeError('UNKNOWN', `Could not load ${resource}.`, 500);
}
