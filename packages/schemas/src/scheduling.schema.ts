import { z } from 'zod';

import { isoDateTimeSchema, minuteOfDaySchema, uuidSchema } from './primitives';
import { workingHoursSchema } from './profile.schema';

export const timeOfDayPreferenceSchema = z.enum(['morning', 'afternoon', 'evening', 'any']);

/**
 * Everything the deterministic availability engine needs. Note what is absent:
 * free text. Intent is turned into these fields *before* slot generation, and
 * the engine alone decides what is actually free.
 */
const scheduleConstraintsObject = z.object({
  durationMinutes: z
    .number()
    .int()
    .min(5)
    .max(12 * 60),
  windowStart: isoDateTimeSchema,
  windowEnd: isoDateTimeSchema,
  workingHours: workingHoursSchema,
  timezone: z.string().min(1),
  /** Minimum gap to leave either side of the new block. */
  bufferMinutes: z.number().int().min(0).max(120).default(0),
  /** Do not start a block before this local minute of day. */
  earliestMinute: minuteOfDaySchema.optional(),
  /** Do not end a block after this local minute of day. */
  latestMinute: minuteOfDaySchema.optional(),
  /** Slots are generated on this cadence, e.g. every 15 minutes. */
  granularityMinutes: z.number().int().min(5).max(60).default(15),
  /** Allow splitting the work across multiple shorter blocks. */
  splittable: z.boolean().default(false),
  minSplitMinutes: z
    .number()
    .int()
    .min(15)
    .max(8 * 60)
    .default(30),
  preferredTimeOfDay: timeOfDayPreferenceSchema.default('any'),
});

export const scheduleConstraintsSchema = scheduleConstraintsObject.refine(
  (c) => new Date(c.windowEnd) > new Date(c.windowStart),
  {
    message: 'The scheduling window must end after it starts',
    path: ['windowEnd'],
  },
);

export const timeSlotSchema = z.object({
  startAt: isoDateTimeSchema,
  endAt: isoDateTimeSchema,
});

export const aiScheduleRequestSchema = z.object({
  taskId: uuidSchema,
  /** Optional free-text steer, e.g. "not right after my morning class". */
  note: z.string().max(500).optional(),
  constraints: scheduleConstraintsObject.partial().optional(),
});

/**
 * The exact shape the model must return. Anything else is rejected before it
 * can touch user data — the model ranks and explains, it never invents times.
 */
export const aiRankedSlotSchema = z.object({
  slotId: z.string().min(1),
  rank: z.number().int().min(1),
  score: z.number().min(0).max(1),
  reason: z.string().min(1).max(280),
});

export const aiScheduleProposalSchema = z.object({
  suggestions: z.array(aiRankedSlotSchema).min(1).max(5),
});

export const aiScheduleStatusSchema = z.enum([
  'pending',
  'proposed',
  'accepted',
  'rejected',
  'failed',
]);

export type ScheduleConstraints = z.infer<typeof scheduleConstraintsSchema>;
export type ScheduleConstraintsInput = z.input<typeof scheduleConstraintsSchema>;
export type TimeSlot = z.infer<typeof timeSlotSchema>;
export type AiScheduleRequest = z.infer<typeof aiScheduleRequestSchema>;
export type AiRankedSlot = z.infer<typeof aiRankedSlotSchema>;
export type AiScheduleProposal = z.infer<typeof aiScheduleProposalSchema>;
export type TimeOfDayPreference = z.infer<typeof timeOfDayPreferenceSchema>;
