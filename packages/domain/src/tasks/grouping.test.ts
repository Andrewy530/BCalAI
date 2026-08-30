import type { Task } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import { bucketTasks, schedulableTasks } from './grouping';

const NY = 'America/New_York';
const NOW = new Date('2026-08-31T18:00:00Z'); // Monday 14:00 local

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    userId: 'user-1',
    listId: null,
    title: overrides.id,
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

describe('bucketTasks', () => {
  it('separates overdue, due today, scheduled and unscheduled work', () => {
    const buckets = bucketTasks(
      [
        task({ id: 'yesterday', dueAt: '2026-08-30T18:00:00Z', hasDueTime: true }),
        task({ id: 'later-today', dueAt: '2026-08-31T22:00:00Z', hasDueTime: true }),
        task({ id: 'next-week', dueAt: '2026-09-07T18:00:00Z' }),
        task({ id: 'blocked-out', scheduledEventId: 'event-1' }),
        task({ id: 'someday' }),
      ],
      NOW,
      NY,
    );

    expect(buckets.overdue.map((t) => t.id)).toEqual(['yesterday']);
    expect(buckets.dueToday.map((t) => t.id)).toEqual(['later-today']);
    expect(buckets.scheduled.map((t) => t.id)).toEqual(['blocked-out']);
    expect(buckets.unscheduled.map((t) => t.id)).toEqual(['next-week', 'someday']);
  });

  it('does not treat a date-only task due today as overdue', () => {
    const buckets = bucketTasks(
      [task({ id: 'today-no-time', dueAt: '2026-08-31T04:00:00Z', hasDueTime: false })],
      NOW,
      NY,
    );
    expect(buckets.overdue).toEqual([]);
    expect(buckets.dueToday.map((t) => t.id)).toEqual(['today-no-time']);
  });

  it('marks a timed task earlier today as overdue', () => {
    const buckets = bucketTasks(
      [task({ id: 'this-morning', dueAt: '2026-08-31T13:00:00Z', hasDueTime: true })],
      NOW,
      NY,
    );
    expect(buckets.overdue.map((t) => t.id)).toEqual(['this-morning']);
  });

  it('keeps only today’s completions and hides archived work', () => {
    const buckets = bucketTasks(
      [
        task({ id: 'done-today', status: 'completed', completedAt: '2026-08-31T15:00:00Z' }),
        task({ id: 'done-friday', status: 'completed', completedAt: '2026-08-28T15:00:00Z' }),
        task({ id: 'archived', status: 'archived' }),
      ],
      NOW,
      NY,
    );
    expect(buckets.completedToday.map((t) => t.id)).toEqual(['done-today']);
    expect(buckets.unscheduled).toEqual([]);
  });

  it('sorts each bucket by priority, then due date', () => {
    const buckets = bucketTasks(
      [
        task({ id: 'normal', dueAt: '2026-08-31T20:00:00Z', hasDueTime: true }),
        task({ id: 'urgent', priority: 'urgent', dueAt: '2026-08-31T23:00:00Z', hasDueTime: true }),
        task({ id: 'high', priority: 'high', dueAt: '2026-08-31T23:00:00Z', hasDueTime: true }),
      ],
      NOW,
      NY,
    );
    expect(buckets.dueToday.map((t) => t.id)).toEqual(['urgent', 'high', 'normal']);
  });
});

describe('schedulableTasks', () => {
  it('takes only flexible, sized, open, unplaced tasks', () => {
    const result = schedulableTasks([
      task({ id: 'ready', estimatedMinutes: 60 }),
      task({ id: 'no-estimate' }),
      task({ id: 'fixed', estimatedMinutes: 60, isFlexible: false }),
      task({ id: 'already-placed', estimatedMinutes: 60, scheduledEventId: 'event-1' }),
      task({ id: 'done', estimatedMinutes: 60, status: 'completed' }),
    ]);
    expect(result.map((t) => t.id)).toEqual(['ready']);
  });
});
