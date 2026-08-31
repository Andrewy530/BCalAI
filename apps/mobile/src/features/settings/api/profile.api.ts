import {
  type Profile,
  type UpdateProfileInput,
  profileSchema,
  updateProfileSchema,
} from '@cal/schemas';
import type { TablesUpdate } from '@cal/types';
import { z } from 'zod';

import { toAppError } from '../../../lib/errors/app-error';
import { supabase } from '../../../lib/supabase/client';

/**
 * Profiles are stored snake_case in Postgres and used camelCase in the app.
 *
 * The mapping lives here — never in a component — so column names stay an
 * implementation detail of this module. The row schema parses, renames, and
 * then pipes into the domain schema, so a response that does not match is a
 * caught validation error rather than a mystery crash three screens later.
 */
const profileRowSchema = z
  .object({
    id: z.string(),
    full_name: z.string().nullable(),
    avatar_url: z.string().nullable(),
    timezone: z.string(),
    week_starts_on: z.number(),
    hour_cycle: z.string(),
    default_task_minutes: z.number(),
    default_event_minutes: z.number(),
    working_hours: z.unknown(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .transform((row) => ({
    id: row.id,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    timezone: row.timezone,
    weekStartsOn: row.week_starts_on,
    hourCycle: row.hour_cycle,
    defaultTaskMinutes: row.default_task_minutes,
    defaultEventMinutes: row.default_event_minutes,
    workingHours: row.working_hours,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
  .pipe(profileSchema);

/** Only send the keys the caller actually set. */
function toUpdatePayload(patch: UpdateProfileInput): TablesUpdate<'profiles'> {
  const payload: TablesUpdate<'profiles'> = {};
  if (patch.fullName !== undefined) payload.full_name = patch.fullName;
  if (patch.avatarUrl !== undefined) payload.avatar_url = patch.avatarUrl;
  if (patch.timezone !== undefined) payload.timezone = patch.timezone;
  if (patch.weekStartsOn !== undefined) payload.week_starts_on = patch.weekStartsOn;
  if (patch.hourCycle !== undefined) payload.hour_cycle = patch.hourCycle;
  if (patch.defaultTaskMinutes !== undefined) {
    payload.default_task_minutes = patch.defaultTaskMinutes;
  }
  if (patch.defaultEventMinutes !== undefined) {
    payload.default_event_minutes = patch.defaultEventMinutes;
  }
  if (patch.workingHours !== undefined) payload.working_hours = patch.workingHours;

  return payload;
}

export async function fetchProfile(): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('*').single();

  if (error) throw toAppError(error);
  return profileRowSchema.parse(data);
}

export async function updateProfile(input: UpdateProfileInput): Promise<Profile> {
  const patch = updateProfileSchema.parse(input);

  const { data, error } = await supabase
    .from('profiles')
    .update(toUpdatePayload(patch))
    .select('*')
    .single();

  if (error) throw toAppError(error);
  return profileRowSchema.parse(data);
}
