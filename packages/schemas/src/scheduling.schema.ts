import { z } from 'zod';

import { isoDateTimeSchema, minuteOfDaySchema, timeZoneSchema, uuidSchema } from './primitives.ts';
import { workingHoursSchema } from './profile.schema.ts';

export type { WorkingHours } from './profile.schema.ts';

export const timeOfDayPreferenceSchema = z.enum(['morning', 'afternoon', 'evening', 'any']);

/**
 * Everything the deterministic availability engine needs. Note what is absent:
 * free text. Intent is turned into these fields *before* slot generation, and
 * the engine alone decides what is actually free.
 */
const scheduleConstraintsObject = z
  .object({
    durationMinutes: z
      .number()
      .int()
      .min(5)
      .max(12 * 60),
    windowStart: isoDateTimeSchema,
    windowEnd: isoDateTimeSchema,
    workingHours: workingHoursSchema,
    timezone: timeZoneSchema,
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
  })
  .strict();

export const scheduleConstraintsSchema = scheduleConstraintsObject
  .refine((c) => new Date(c.windowEnd) > new Date(c.windowStart), {
    message: 'The scheduling window must end after it starts',
    path: ['windowEnd'],
  })
  .refine(
    (c) =>
      c.earliestMinute === undefined ||
      c.latestMinute === undefined ||
      c.latestMinute > c.earliestMinute,
    {
      message: 'The latest local time must be after the earliest local time',
      path: ['latestMinute'],
    },
  );

export const timeSlotSchema = z
  .object({
    startAt: isoDateTimeSchema,
    endAt: isoDateTimeSchema,
  })
  .strict()
  .refine((slot) => new Date(slot.endAt) > new Date(slot.startAt), {
    message: 'The slot must end after it starts',
    path: ['endAt'],
  });

export const aiScheduleRequestSchema = z
  .object({
    taskId: uuidSchema,
    /** Untrusted ranking context. It never changes deterministic availability. */
    note: z.string().trim().min(1).max(500).optional(),
    windowStart: isoDateTimeSchema.optional(),
    windowEnd: isoDateTimeSchema.optional(),
    bufferMinutes: z.number().int().min(0).max(120).optional(),
    earliestMinute: minuteOfDaySchema.optional(),
    latestMinute: minuteOfDaySchema.optional(),
    preferredTimeOfDay: timeOfDayPreferenceSchema.optional(),
  })
  .strict()
  .refine(
    (request) =>
      request.windowStart === undefined ||
      request.windowEnd === undefined ||
      new Date(request.windowEnd) > new Date(request.windowStart),
    {
      message: 'The requested window must end after it starts',
      path: ['windowEnd'],
    },
  )
  .refine(
    (request) =>
      request.earliestMinute === undefined ||
      request.latestMinute === undefined ||
      request.latestMinute > request.earliestMinute,
    {
      message: 'The latest local time must be after the earliest local time',
      path: ['latestMinute'],
    },
  );

/**
 * The exact shape the model must return. Anything else is rejected before it
 * can touch user data — the model ranks and explains, it never invents times.
 */
export const aiRankedSlotSchema = z
  .object({
    slotId: z.string().min(1),
    rank: z.number().int().min(1),
    score: z.number().min(0).max(1),
    reason: z.string().min(1).max(280),
  })
  .strict();

export const aiScheduleProposalSchema = z
  .object({
    suggestions: z.array(aiRankedSlotSchema).min(1).max(5),
  })
  .strict()
  .superRefine((proposal, context) => {
    const slotIds = new Set<string>();
    const ranks = new Set<number>();

    for (const suggestion of proposal.suggestions) {
      if (slotIds.has(suggestion.slotId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Suggestion slot ids must be unique',
          path: ['suggestions'],
        });
      }
      if (ranks.has(suggestion.rank)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Suggestion ranks must be unique',
          path: ['suggestions'],
        });
      }
      slotIds.add(suggestion.slotId);
      ranks.add(suggestion.rank);
    }

    const expectedRanks = proposal.suggestions.map((_, index) => index + 1);
    if (expectedRanks.some((rank) => !ranks.has(rank))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Suggestion ranks must be contiguous from 1',
        path: ['suggestions'],
      });
    }
  });

/** Sanitized candidate context permitted to cross the AI provider boundary. */
export const aiRankingCandidateSchema = z
  .object({
    id: z.string().min(1),
    startAt: isoDateTimeSchema,
    endAt: isoDateTimeSchema,
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    localStartMinute: minuteOfDaySchema,
    localEndMinute: z
      .number()
      .int()
      .min(1)
      .max(24 * 60),
    minutesFromPreviousBusy: z.number().int().min(0).nullable(),
    minutesUntilNextBusy: z.number().int().min(0).nullable(),
  })
  .strict()
  .refine((candidate) => new Date(candidate.endAt) > new Date(candidate.startAt), {
    message: 'The candidate must end after it starts',
    path: ['endAt'],
  });

/**
 * Complete model input. It contains task intent and derived slot features, but
 * never calendar rows, event content, provider credentials, or database access.
 */
export const aiRankCandidateSlotsInputSchema = z
  .object({
    task: z
      .object({
        title: z.string().min(1).max(500),
        priority: z.enum(['low', 'normal', 'high', 'urgent']),
        durationMinutes: z
          .number()
          .int()
          .min(5)
          .max(12 * 60),
        deadlineAt: isoDateTimeSchema.nullable(),
      })
      .strict(),
    note: z.string().max(500).nullable(),
    timezone: timeZoneSchema,
    preferredTimeOfDay: timeOfDayPreferenceSchema,
    candidates: z.array(aiRankingCandidateSchema).min(1).max(40),
  })
  .strict();

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
export type AiRankingCandidate = z.infer<typeof aiRankingCandidateSchema>;
export type AiRankCandidateSlotsInput = z.infer<typeof aiRankCandidateSlotsInputSchema>;
export type TimeOfDayPreference = z.infer<typeof timeOfDayPreferenceSchema>;
