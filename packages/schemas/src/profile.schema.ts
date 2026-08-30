import { z } from 'zod';

import {
  hourCycleSchema,
  isoDateTimeSchema,
  minuteOfDaySchema,
  timeZoneSchema,
  uuidSchema,
  weekdaySchema,
} from './primitives';

/**
 * Working hours drive the deterministic availability engine. They are stored on
 * the profile as a per-weekday list of local-time windows so a user can say
 * "Mon-Thu 9-5, Fri 9-12, nothing on weekends".
 */
export const workingWindowSchema = z
  .object({
    weekday: weekdaySchema,
    startMinute: minuteOfDaySchema,
    endMinute: minuteOfDaySchema,
  })
  .refine((w) => w.endMinute > w.startMinute, {
    message: 'A working window must end after it starts',
    path: ['endMinute'],
  });

export const workingHoursSchema = z.array(workingWindowSchema).max(21);

export const profileSchema = z.object({
  id: uuidSchema,
  fullName: z.string().min(1).max(120).nullable(),
  avatarUrl: z.string().url().nullable(),
  timezone: timeZoneSchema,
  weekStartsOn: weekdaySchema,
  hourCycle: hourCycleSchema,
  defaultTaskMinutes: z.number().int().min(5).max(8 * 60),
  defaultEventMinutes: z.number().int().min(5).max(8 * 60),
  workingHours: workingHoursSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const updateProfileSchema = profileSchema
  .pick({
    fullName: true,
    avatarUrl: true,
    timezone: true,
    weekStartsOn: true,
    hourCycle: true,
    defaultTaskMinutes: true,
    defaultEventMinutes: true,
    workingHours: true,
  })
  .partial();

export type WorkingWindow = z.infer<typeof workingWindowSchema>;
export type WorkingHours = z.infer<typeof workingHoursSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Mon–Fri, 09:00–17:00. Applied to new accounts. */
export const DEFAULT_WORKING_HOURS: WorkingHours = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
}));
