import type { Task } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_REMINDER_PREFERENCES,
  capReminders,
  diffReminders,
  parseReminderKey,
  planReminderForTask,
  planReminders,
  reminderKey,
} from './reminders';

const NY = 'America/New_York';
const NOW = new Date('2026-08-31T18:00:00Z'); // Monday 14:00 local

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    userId: 'user-1',
    listId: null,
    title: `Task ${overrides.id}`,
    description: null,
    status: 'open',
    priority: 'normal',
    dueAt: null,
    hasDueTime: false,
    estimatedMinutes: null,
    scheduledEventId: null,
    isFlexible: true,
    recurrenceRule: null,
    completedAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  } as Task;
}

const base = { now: NOW, timeZone: NY, preferences: DEFAULT_REMINDER_PREFERENCES };

describe('planReminderForTask', () => {
  it('fires the configured lead time before a timed task', () => {
    const reminder = planReminderForTask(
      task({ id: 'a', dueAt: '2026-08-31T20:00:00Z', hasDueTime: true }),
      base,
    );

    expect(reminder?.fireAt.toISOString()).toBe('2026-08-31T19:50:00.000Z');
    expect(reminder?.body).toBe('Due in 10 minutes');
    expect(reminder?.key).toBe('task:a:due');
  });

  it('says "Due now" when the lead time is zero', () => {
    const reminder = planReminderForTask(
      task({ id: 'a', dueAt: '2026-08-31T20:00:00Z', hasDueTime: true }),
      { ...base, preferences: { ...DEFAULT_REMINDER_PREFERENCES, minutesBefore: 0 } },
    );

    expect(reminder?.fireAt.toISOString()).toBe('2026-08-31T20:00:00.000Z');
    expect(reminder?.body).toBe('Due now');
  });

  it('schedules a date-only task for the morning of its due day in the user zone', () => {
    const reminder = planReminderForTask(
      task({ id: 'b', dueAt: '2026-09-03T12:00:00Z', hasDueTime: false }),
      base,
    );

    // 09:00 in New York on 3 Sep (EDT, UTC-4) is 13:00 UTC.
    expect(reminder?.fireAt.toISOString()).toBe('2026-09-03T13:00:00.000Z');
    expect(reminder?.body).toBe('Due today');
    expect(reminder?.key).toBe('task:b:allday');
  });

  it('respects the user zone across a DST boundary', () => {
    // 20 Nov 2026 is EST (UTC-5), so 09:00 local is 14:00 UTC.
    const reminder = planReminderForTask(
      task({ id: 'c', dueAt: '2026-11-20T12:00:00Z', hasDueTime: false }),
      base,
    );

    expect(reminder?.fireAt.toISOString()).toBe('2026-11-20T14:00:00.000Z');
  });

  it('never schedules into the past', () => {
    expect(
      planReminderForTask(task({ id: 'd', dueAt: '2026-08-30T12:00:00Z', hasDueTime: true }), base),
    ).toBeNull();
    // Due later today, but the 09:00 morning slot has already passed.
    expect(
      planReminderForTask(task({ id: 'e', dueAt: '2026-08-31T23:00:00Z', hasDueTime: false }), base),
    ).toBeNull();
  });

  it('skips tasks with no due date, and completed or archived tasks', () => {
    expect(planReminderForTask(task({ id: 'f' }), base)).toBeNull();
    expect(
      planReminderForTask(
        task({
          id: 'g',
          dueAt: '2026-09-03T12:00:00Z',
          status: 'completed',
          completedAt: '2026-08-31T10:00:00Z',
        }),
        base,
      ),
    ).toBeNull();
    expect(
      planReminderForTask(task({ id: 'h', dueAt: '2026-09-03T12:00:00Z', status: 'archived' }), base),
    ).toBeNull();
  });

  it('honours the per-kind preference switches', () => {
    const timedOff = { ...DEFAULT_REMINDER_PREFERENCES, timedTasksEnabled: false };
    expect(
      planReminderForTask(task({ id: 'i', dueAt: '2026-09-01T20:00:00Z', hasDueTime: true }), {
        ...base,
        preferences: timedOff,
      }),
    ).toBeNull();

    const allDayOff = { ...DEFAULT_REMINDER_PREFERENCES, allDayTasksEnabled: false };
    expect(
      planReminderForTask(task({ id: 'j', dueAt: '2026-09-03T12:00:00Z' }), {
        ...base,
        preferences: allDayOff,
      }),
    ).toBeNull();
  });
});

describe('planReminders', () => {
  it('returns only schedulable reminders, soonest first', () => {
    const planned = planReminders(
      [
        task({ id: 'later', dueAt: '2026-09-05T20:00:00Z', hasDueTime: true }),
        task({ id: 'none' }),
        task({ id: 'sooner', dueAt: '2026-09-01T20:00:00Z', hasDueTime: true }),
      ],
      base,
    );

    expect(planned.map((r) => r.taskId)).toEqual(['sooner', 'later']);
  });
});

describe('diffReminders', () => {
  const planned = planReminders(
    [
      task({ id: 'unchanged', dueAt: '2026-09-01T20:00:00Z', hasDueTime: true }),
      task({ id: 'moved', dueAt: '2026-09-02T20:00:00Z', hasDueTime: true }),
    ],
    base,
  );

  it('schedules only what is new or has moved, and cancels what is gone', () => {
    const scheduled = new Map<string, Date>([
      ['task:unchanged:due', new Date('2026-09-01T19:50:00.000Z')],
      ['task:moved:due', new Date('2026-09-02T10:00:00.000Z')],
      ['task:deleted:due', new Date('2026-09-04T10:00:00.000Z')],
    ]);

    const diff = diffReminders(planned, scheduled);

    expect(diff.toSchedule.map((r) => r.taskId)).toEqual(['moved']);
    expect(diff.toCancel).toEqual(['task:deleted:due']);
  });

  it('ignores sub-second drift so a refetch does not churn the OS queue', () => {
    const scheduled = new Map<string, Date>(
      planned.map((r) => [r.key, new Date(r.fireAt.getTime() + 400)]),
    );

    expect(diffReminders(planned, scheduled).toSchedule).toHaveLength(0);
  });

  it('schedules everything when nothing is pending yet', () => {
    const diff = diffReminders(planned, new Map());
    expect(diff.toSchedule).toHaveLength(2);
    expect(diff.toCancel).toHaveLength(0);
  });
});

describe('capReminders', () => {
  it('keeps the soonest reminders when over the OS budget', () => {
    const many = planReminders(
      Array.from({ length: 60 }, (_, index) =>
        task({
          id: `t${index}`,
          dueAt: new Date(NOW.getTime() + (index + 1) * 3_600_000).toISOString(),
          hasDueTime: true,
        }),
      ),
      base,
    );

    const capped = capReminders(many, 48);
    expect(capped).toHaveLength(48);
    expect(capped[0]?.taskId).toBe('t0');
    expect(capped.at(-1)?.taskId).toBe('t47');
  });
});

describe('reminderKey', () => {
  it('round-trips through parseReminderKey', () => {
    expect(parseReminderKey(reminderKey('abc', 'due'))).toEqual({ taskId: 'abc', kind: 'due' });
    expect(parseReminderKey('not-ours')).toBeNull();
  });
});
