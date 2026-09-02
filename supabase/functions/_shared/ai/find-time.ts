import {
  generateCandidateSlots,
  schedulingEventsToBusyIntervals,
  type SchedulingCalendarEvent,
} from '@cal/domain/scheduling';
import { addZonedDays, startOfZonedDay } from '@cal/domain/time';
import {
  scheduleConstraintsSchema,
  type AiScheduleRequest,
  type ScheduleConstraints,
} from '@cal/schemas/scheduling';

import { EdgeError } from '../errors/index.ts';

const MAX_HORIZON_DAYS = 14;
const MAX_DURATION_MINUTES = 12 * 60;
const GRANULARITY_MINUTES = 15;

export interface FindTimeTask {
  id: string;
  title: string;
  status: 'open' | 'scheduled' | 'completed' | 'archived';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  dueAt: string | null;
  hasDueTime: boolean;
  estimatedMinutes: number | null;
  scheduledEventId: string | null;
  isFlexible: boolean;
  updatedAt: string;
}

export interface FindTimeProfile {
  timezone: string;
  workingHours: unknown;
}

export interface FindTimeTargetCalendar {
  id: string;
  name: string;
}

export interface FindTimeDataSource {
  loadTask(userId: string, taskId: string): Promise<FindTimeTask | null>;
  loadProfile(userId: string): Promise<FindTimeProfile | null>;
  loadTargetCalendar(userId: string): Promise<FindTimeTargetCalendar | null>;
  loadEvents(
    userId: string,
    window: { start: Date; end: Date },
  ): Promise<SchedulingCalendarEvent[]>;
}

export interface DeterministicCandidate {
  id: string;
  startAt: string;
  endAt: string;
  minutesFromPreviousBusy: number | null;
  minutesUntilNextBusy: number | null;
}

export interface DeterministicFindTimeResult {
  task: {
    id: string;
    title: string;
    priority: FindTimeTask['priority'];
    durationMinutes: number;
    deadlineAt: string | null;
    version: string;
  };
  note: string | null;
  targetCalendar: FindTimeTargetCalendar;
  constraints: ScheduleConstraints;
  candidates: DeterministicCandidate[];
}

export type CandidateIdFactory = (index: number) => string;

export async function prepareDeterministicFindTime(
  input: {
    userId: string;
    request: AiScheduleRequest;
    now?: Date;
    /** Phase 3 persists a controlled no-slot request instead of losing context. */
    allowNoValidSlot?: boolean;
  },
  source: FindTimeDataSource,
  candidateIdFactory: CandidateIdFactory = opaqueCandidateId,
): Promise<DeterministicFindTimeResult> {
  const now = input.now ?? new Date();
  const task = await source.loadTask(input.userId, input.request.taskId);
  if (!task) throw new EdgeError('NOT_FOUND', 'That task was not found.', 404);

  requireSchedulableTask(task);
  const durationMinutes = requireDuration(task.estimatedMinutes);

  const profile = await source.loadProfile(input.userId);
  if (!profile) throw new EdgeError('UNKNOWN', 'Could not load planning preferences.', 500);
  requireSupportedTimeZone(profile.timezone);

  const targetCalendar = await source.loadTargetCalendar(input.userId);
  if (!targetCalendar) {
    throw new EdgeError(
      'AI_DEFAULT_CALENDAR_MISSING',
      'Create or restore your default BCal calendar before finding time.',
      409,
    );
  }

  const window = resolveWindow(task, input.request, profile.timezone, now);
  const constraints = parseConstraints({
    durationMinutes,
    windowStart: window.start.toISOString(),
    windowEnd: window.end.toISOString(),
    workingHours: profile.workingHours,
    timezone: profile.timezone,
    bufferMinutes: input.request.bufferMinutes ?? 0,
    earliestMinute: input.request.earliestMinute,
    latestMinute: input.request.latestMinute,
    granularityMinutes: GRANULARITY_MINUTES,
    splittable: false,
    minSplitMinutes: 30,
    preferredTimeOfDay: input.request.preferredTimeOfDay ?? 'any',
  });

  const events = await source.loadEvents(input.userId, window);
  const busy = schedulingEventsToBusyIntervals(events, window);
  const generated = generateCandidateSlots({ constraints, busy });
  if (generated.length === 0 && !input.allowNoValidSlot) {
    throw new EdgeError(
      'AI_NO_VALID_SLOT',
      'No open time fits this task before its deadline.',
      422,
    );
  }

  const ids = new Set<string>();
  const candidates = generated.map((slot, index) => {
    const id = candidateIdFactory(index);
    if (!id || ids.has(id)) {
      throw new EdgeError('UNKNOWN', 'Could not create candidate identities.', 500);
    }
    ids.add(id);
    const proximity = busyProximity(slot.start, slot.end, busy);
    return {
      id,
      startAt: new Date(slot.start).toISOString(),
      endAt: new Date(slot.end).toISOString(),
      ...proximity,
    };
  });

  return {
    task: {
      id: task.id,
      title: task.title,
      priority: task.priority,
      durationMinutes,
      deadlineAt: window.taskDeadline?.toISOString() ?? null,
      version: task.updatedAt,
    },
    note: input.request.note ?? null,
    targetCalendar,
    constraints,
    candidates,
  };
}

function requireSchedulableTask(task: FindTimeTask): void {
  if (task.status !== 'open' || !task.isFlexible || task.scheduledEventId !== null) {
    throw new EdgeError(
      'AI_TASK_NOT_SCHEDULABLE',
      'That task is completed, fixed, or already scheduled.',
      409,
    );
  }
}

function requireDuration(duration: number | null): number {
  if (duration === null) {
    throw new EdgeError(
      'AI_TASK_DURATION_REQUIRED',
      'Add an estimated duration before finding time.',
      422,
    );
  }
  if (!Number.isInteger(duration) || duration < 5 || duration > MAX_DURATION_MINUTES) {
    throw new EdgeError(
      'AI_TASK_DURATION_REQUIRED',
      'The task duration must be between 5 minutes and 12 hours.',
      422,
    );
  }
  return duration;
}

function requireSupportedTimeZone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new EdgeError(
      'AI_SCHEDULING_WINDOW_INVALID',
      'Choose a valid timezone in planning preferences.',
      422,
    );
  }
}

function resolveWindow(
  task: FindTimeTask,
  request: AiScheduleRequest,
  timezone: string,
  now: Date,
): { start: Date; end: Date; taskDeadline: Date | null } {
  const requestedStart = request.windowStart ? new Date(request.windowStart) : now;
  const start = new Date(Math.max(now.getTime(), requestedStart.getTime()));
  const taskDeadline = task.dueAt ? taskDeadlineFor(task, timezone) : null;
  const requestedEnd = request.windowEnd ? new Date(request.windowEnd) : null;

  if (!taskDeadline && !requestedEnd) {
    throw new EdgeError(
      'AI_SCHEDULING_WINDOW_INVALID',
      'Add a deadline or choose a scheduling horizon.',
      422,
    );
  }

  const cap = addZonedDays(now, MAX_HORIZON_DAYS, timezone);
  const end = new Date(
    Math.min(
      cap.getTime(),
      taskDeadline?.getTime() ?? Number.POSITIVE_INFINITY,
      requestedEnd?.getTime() ?? Number.POSITIVE_INFINITY,
    ),
  );

  if (end.getTime() <= now.getTime()) {
    throw new EdgeError(
      'AI_SCHEDULING_WINDOW_INVALID',
      'The task deadline or scheduling horizon has already passed.',
      422,
    );
  }
  if (end.getTime() <= start.getTime()) {
    throw new EdgeError(
      'AI_SCHEDULING_WINDOW_INVALID',
      'The scheduling window must end after it starts.',
      422,
    );
  }

  return { start, end, taskDeadline };
}

function taskDeadlineFor(task: FindTimeTask, timezone: string): Date {
  const dueAt = new Date(task.dueAt as string);
  if (task.hasDueTime) return dueAt;

  const dueDayStart = startOfZonedDay(dueAt, timezone);
  return addZonedDays(dueDayStart, 1, timezone);
}

function parseConstraints(input: unknown): ScheduleConstraints {
  const parsed = scheduleConstraintsSchema.safeParse(input);
  if (!parsed.success) {
    throw new EdgeError(
      'AI_SCHEDULING_WINDOW_INVALID',
      'Your planning preferences do not form a valid scheduling window.',
      422,
    );
  }
  return parsed.data;
}

function opaqueCandidateId(): string {
  return `candidate_${crypto.randomUUID().replaceAll('-', '')}`;
}

function busyProximity(
  start: number,
  end: number,
  busy: readonly { start: number; end: number }[],
): Pick<DeterministicCandidate, 'minutesFromPreviousBusy' | 'minutesUntilNextBusy'> {
  let previousGap = Number.POSITIVE_INFINITY;
  let nextGap = Number.POSITIVE_INFINITY;

  for (const interval of busy) {
    if (interval.end <= start) previousGap = Math.min(previousGap, start - interval.end);
    if (interval.start >= end) nextGap = Math.min(nextGap, interval.start - end);
  }

  return {
    minutesFromPreviousBusy: Number.isFinite(previousGap) ? Math.floor(previousGap / 60_000) : null,
    minutesUntilNextBusy: Number.isFinite(nextGap) ? Math.floor(nextGap / 60_000) : null,
  };
}
