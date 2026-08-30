import { z } from 'zod';

import { hexColorSchema, isoDateTimeSchema, uuidSchema } from './primitives';

export const taskStatusSchema = z.enum(['open', 'scheduled', 'completed', 'archived']);
export const taskPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

export const taskListSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  name: z.string().min(1).max(120),
  color: hexColorSchema,
  position: z.number().int().min(0),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const createTaskListSchema = z.object({
  name: z.string().trim().min(1, 'Name your list').max(120),
  color: hexColorSchema,
});

export const tagSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  name: z.string().min(1).max(60),
  color: hexColorSchema,
});

export const taskSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  listId: uuidSchema.nullable(),
  title: z.string().min(1).max(300),
  description: z.string().max(10_000).nullable(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  dueAt: isoDateTimeSchema.nullable(),
  /** false when the user set a date but no specific time. */
  hasDueTime: z.boolean(),
  estimatedMinutes: z.number().int().min(5).max(24 * 60).nullable(),
  scheduledEventId: uuidSchema.nullable(),
  /** Flexible tasks are the ones the scheduling engine is allowed to move. */
  isFlexible: z.boolean(),
  recurrenceRule: z.string().nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'What needs doing?').max(300),
  description: z.string().max(10_000).nullish(),
  listId: uuidSchema.nullish(),
  priority: taskPrioritySchema.default('normal'),
  dueAt: isoDateTimeSchema.nullish(),
  hasDueTime: z.boolean().default(false),
  estimatedMinutes: z.number().int().min(5).max(24 * 60).nullish(),
  isFlexible: z.boolean().default(true),
  recurrenceRule: z.string().nullish(),
  tagIds: z.array(uuidSchema).max(20).default([]),
});

export const updateTaskSchema = createTaskSchema.partial().extend({ id: uuidSchema });

export const completeTaskSchema = z.object({
  id: uuidSchema,
  completed: z.boolean(),
});

export const snoozeTaskSchema = z.object({
  id: uuidSchema,
  dueAt: isoDateTimeSchema,
});

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type TaskList = z.infer<typeof taskListSchema>;
export type CreateTaskListInput = z.infer<typeof createTaskListSchema>;
export type Tag = z.infer<typeof tagSchema>;
export type Task = z.infer<typeof taskSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
