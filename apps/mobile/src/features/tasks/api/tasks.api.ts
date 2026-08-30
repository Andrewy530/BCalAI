import {
  type CreateTaskInput,
  type Tag,
  type Task,
  type TaskList,
  type UpdateTaskInput,
  createTaskSchema,
  taskListSchema,
  tagSchema,
  taskSchema,
  updateTaskSchema,
} from '@cal/schemas';
import { z } from 'zod';

import { toAppError } from '../../../lib/errors/app-error';
import { supabase } from '../../../lib/supabase/client';

/**
 * The only module in the app that knows how tasks are stored.
 *
 * Columns are snake_case in Postgres and camelCase in the app; every row is
 * parsed on the way in so a schema drift surfaces as a validation error here
 * rather than as `undefined` inside a component three layers up.
 */

const TASK_COLUMNS =
  'id, user_id, list_id, title, description, status, priority, due_at, has_due_time, ' +
  'estimated_minutes, scheduled_event_id, is_flexible, recurrence_rule, completed_at, ' +
  'created_at, updated_at';

const taskRowSchema = z
  .object({
    id: z.string(),
    user_id: z.string(),
    list_id: z.string().nullable(),
    title: z.string(),
    description: z.string().nullable(),
    status: z.string(),
    priority: z.string(),
    due_at: z.string().nullable(),
    has_due_time: z.boolean(),
    estimated_minutes: z.number().nullable(),
    scheduled_event_id: z.string().nullable(),
    is_flexible: z.boolean(),
    recurrence_rule: z.string().nullable(),
    completed_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .transform((row) => ({
    id: row.id,
    userId: row.user_id,
    listId: row.list_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueAt: row.due_at,
    hasDueTime: row.has_due_time,
    estimatedMinutes: row.estimated_minutes,
    scheduledEventId: row.scheduled_event_id,
    isFlexible: row.is_flexible,
    recurrenceRule: row.recurrence_rule,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
  .pipe(taskSchema);

const taskListRowSchema = z
  .object({
    id: z.string(),
    user_id: z.string(),
    name: z.string(),
    color: z.string(),
    position: z.number(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .transform((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    color: row.color,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
  .pipe(taskListSchema);

const tagRowSchema = z
  .object({
    id: z.string(),
    user_id: z.string(),
    name: z.string(),
    color: z.string(),
  })
  .transform((row) => ({ id: row.id, userId: row.user_id, name: row.name, color: row.color }))
  .pipe(tagSchema);

/** Tasks plus their tag ids, which live in a join table. */
export interface TaskWithTags extends Task {
  tagIds: string[];
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function fetchTasks(options?: {
  /** Omit completed and archived work. */
  openOnly?: boolean;
}): Promise<TaskWithTags[]> {
  const selection = supabase.from('tasks').select(`${TASK_COLUMNS}, task_tags(tag_id)`);

  // Filters must be applied before ordering: `.order()` narrows the builder to
  // a transform builder, which no longer accepts `.in()`.
  const filtered = options?.openOnly
    ? selection.in('status', ['open', 'scheduled'])
    : selection;

  const { data, error } = await filtered
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) throw toAppError(error);

  return (data ?? []).map((row) => {
    const { task_tags: taskTags, ...task } = row as Record<string, unknown> & {
      task_tags?: { tag_id: string }[];
    };
    return {
      ...taskRowSchema.parse(task),
      tagIds: (taskTags ?? []).map((link) => link.tag_id),
    };
  });
}

export async function fetchTask(id: string): Promise<TaskWithTags> {
  const { data, error } = await supabase
    .from('tasks')
    .select(`${TASK_COLUMNS}, task_tags(tag_id)`)
    .eq('id', id)
    .single();

  if (error) throw toAppError(error);

  const { task_tags: taskTags, ...task } = data as Record<string, unknown> & {
    task_tags?: { tag_id: string }[];
  };
  return { ...taskRowSchema.parse(task), tagIds: (taskTags ?? []).map((link) => link.tag_id) };
}

export async function fetchTaskLists(): Promise<TaskList[]> {
  const { data, error } = await supabase
    .from('task_lists')
    .select('*')
    .order('position', { ascending: true });

  if (error) throw toAppError(error);
  return (data ?? []).map((row) => taskListRowSchema.parse(row));
}

export async function fetchTags(): Promise<Tag[]> {
  const { data, error } = await supabase.from('tags').select('*').order('name');
  if (error) throw toAppError(error);
  return (data ?? []).map((row) => tagRowSchema.parse(row));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createTask(input: CreateTaskInput, userId: string): Promise<TaskWithTags> {
  const parsed = createTaskSchema.parse(input);

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: userId,
      list_id: parsed.listId ?? null,
      title: parsed.title,
      description: parsed.description ?? null,
      priority: parsed.priority,
      due_at: parsed.dueAt ?? null,
      has_due_time: parsed.dueAt ? parsed.hasDueTime : false,
      estimated_minutes: parsed.estimatedMinutes ?? null,
      is_flexible: parsed.isFlexible,
      recurrence_rule: parsed.recurrenceRule ?? null,
    })
    .select(TASK_COLUMNS)
    .single();

  if (error) throw toAppError(error);
  const task = taskRowSchema.parse(data);

  if (parsed.tagIds.length > 0) await replaceTaskTags(task.id, parsed.tagIds);
  return { ...task, tagIds: parsed.tagIds };
}

export async function updateTask(input: UpdateTaskInput): Promise<TaskWithTags> {
  const parsed = updateTaskSchema.parse(input);
  const { id, tagIds, ...patch } = parsed;

  const columns: Record<string, string> = {
    listId: 'list_id',
    title: 'title',
    description: 'description',
    priority: 'priority',
    dueAt: 'due_at',
    hasDueTime: 'has_due_time',
    estimatedMinutes: 'estimated_minutes',
    isFlexible: 'is_flexible',
    recurrenceRule: 'recurrence_rule',
  };

  const payload: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(columns)) {
    const value = patch[key as keyof typeof patch];
    if (value !== undefined) payload[column] = value;
  }

  // Clearing the due date must clear the time flag too, or the row violates
  // tasks_due_time_requires_due_at.
  if (payload.due_at === null) payload.has_due_time = false;

  if (Object.keys(payload).length > 0) {
    const { error } = await supabase.from('tasks').update(payload).eq('id', id);
    if (error) throw toAppError(error);
  }

  if (tagIds !== undefined) await replaceTaskTags(id, tagIds);

  return fetchTask(id);
}

/**
 * Completion is its own call rather than a generic update because `status` and
 * `completed_at` must move together — the table has a check constraint that
 * rejects one without the other.
 */
export async function setTaskCompleted(id: string, completed: boolean): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      status: completed ? 'completed' : 'open',
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select(TASK_COLUMNS)
    .single();

  if (error) throw toAppError(error);
  return taskRowSchema.parse(data);
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw toAppError(error);
}

/** Move a task's due date, keeping its "has a specific time" character. */
export async function snoozeTask(id: string, dueAt: Date, hasDueTime: boolean): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({ due_at: dueAt.toISOString(), has_due_time: hasDueTime })
    .eq('id', id)
    .select(TASK_COLUMNS)
    .single();

  if (error) throw toAppError(error);
  return taskRowSchema.parse(data);
}

async function replaceTaskTags(taskId: string, tagIds: readonly string[]): Promise<void> {
  const { error: deleteError } = await supabase.from('task_tags').delete().eq('task_id', taskId);
  if (deleteError) throw toAppError(deleteError);

  if (tagIds.length === 0) return;

  const { error } = await supabase
    .from('task_tags')
    .insert(tagIds.map((tagId) => ({ task_id: taskId, tag_id: tagId })));
  if (error) throw toAppError(error);
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export async function createTaskList(
  input: { name: string; color: string },
  userId: string,
  position: number,
): Promise<TaskList> {
  const { data, error } = await supabase
    .from('task_lists')
    .insert({ user_id: userId, name: input.name, color: input.color, position })
    .select('*')
    .single();

  if (error) throw toAppError(error);
  return taskListRowSchema.parse(data);
}

export async function deleteTaskList(id: string): Promise<void> {
  // Tasks survive: the FK is ON DELETE SET NULL, so they fall back to the inbox.
  const { error } = await supabase.from('task_lists').delete().eq('id', id);
  if (error) throw toAppError(error);
}
