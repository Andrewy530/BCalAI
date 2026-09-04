import { bucketTasks, compareTasks } from '@cal/domain';
import type { Task } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

describe('Task bucketing and comparison for web', () => {
  const now = new Date('2026-09-04T12:00:00.000Z');
  const timeZone = 'America/New_York';

  const makeTask = (overrides: Partial<Task>): Task => ({
    id: '00000000-0000-0000-0000-000000000001',
    userId: '11111111-1111-1111-1111-111111111111',
    listId: null,
    title: 'Test task',
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
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  });

  it('correctly partitions tasks into overdue, today, and unscheduled', () => {
    const overdueTask = makeTask({
      id: '00000000-0000-0000-0000-000000000001',
      title: 'Overdue task',
      dueAt: '2026-09-01T12:00:00.000Z', // 3 days ago
    });

    const dueTodayTask = makeTask({
      id: '00000000-0000-0000-0000-000000000002',
      title: 'Due today task',
      dueAt: '2026-09-04T16:00:00.000Z', // Today in NY
    });

    const upcomingTask = makeTask({
      id: '00000000-0000-0000-0000-000000000003',
      title: 'Upcoming task',
      dueAt: '2026-09-10T12:00:00.000Z',
    });

    const somedayTask = makeTask({
      id: '00000000-0000-0000-0000-000000000004',
      title: 'Someday task',
      dueAt: null,
    });

    const completedTodayTask = makeTask({
      id: '00000000-0000-0000-0000-000000000005',
      title: 'Completed today',
      status: 'completed',
      completedAt: '2026-09-04T11:00:00.000Z',
    });

    const all = [overdueTask, dueTodayTask, upcomingTask, somedayTask, completedTodayTask];
    const buckets = bucketTasks(all, now, timeZone);

    expect(buckets.overdue).toHaveLength(1);
    expect(buckets.overdue[0]?.title).toBe('Overdue task');

    expect(buckets.dueToday).toHaveLength(1);
    expect(buckets.dueToday[0]?.title).toBe('Due today task');

    expect(buckets.unscheduled).toHaveLength(2); // upcoming + someday
    expect(buckets.completedToday).toHaveLength(1);
    expect(buckets.completedToday[0]?.title).toBe('Completed today');
  });

  it('orders tasks by priority before due date', () => {
    const normalPriority = makeTask({
      id: '00000000-0000-0000-0000-000000000001',
      title: 'Normal Priority',
      priority: 'normal',
      dueAt: '2026-09-05T10:00:00.000Z',
    });

    const urgentPriority = makeTask({
      id: '00000000-0000-0000-0000-000000000002',
      title: 'Urgent Priority',
      priority: 'urgent',
      dueAt: '2026-09-06T10:00:00.000Z', // Later due date, but higher priority
    });

    const sorted = [normalPriority, urgentPriority].sort(compareTasks);
    expect(sorted[0]?.title).toBe('Urgent Priority');
    expect(sorted[1]?.title).toBe('Normal Priority');
  });

  it('filters tasks by list ID correctly', () => {
    const workTask = makeTask({
      id: '00000000-0000-0000-0000-000000000001',
      title: 'Work task',
      listId: 'list-work-1',
    });

    const personalTask = makeTask({
      id: '00000000-0000-0000-0000-000000000002',
      title: 'Personal task',
      listId: 'list-personal-1',
    });

    const all = [workTask, personalTask];
    const workOnly = all.filter((t) => t.listId === 'list-work-1');
    expect(workOnly).toHaveLength(1);
    expect(workOnly[0]?.title).toBe('Work task');
  });
});
