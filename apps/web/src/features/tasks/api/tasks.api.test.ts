import { createTaskSchema, updateTaskSchema } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import { taskListRowSchema, tagRowSchema, taskRowSchema } from './tasks.api';

describe('tasks.api row schemas and validation', () => {
  it('transforms valid database task row into camelCase domain task', () => {
    const dbRow = {
      id: 'a0000000-0000-0000-0000-000000000001',
      user_id: '11111111-1111-1111-1111-111111111111',
      list_id: 'b0000000-0000-0000-0000-000000000001',
      title: 'Complete financial report',
      description: 'Review quarterly earnings and projections',
      status: 'open',
      priority: 'high',
      due_at: '2026-09-10T15:00:00.000Z',
      has_due_time: true,
      estimated_minutes: 60,
      scheduled_event_id: null,
      is_flexible: true,
      recurrence_rule: null,
      completed_at: null,
      created_at: '2026-09-01T10:00:00.000Z',
      updated_at: '2026-09-01T10:00:00.000Z',
    };

    const task = taskRowSchema.parse(dbRow);

    expect(task.id).toBe(dbRow.id);
    expect(task.userId).toBe(dbRow.user_id);
    expect(task.listId).toBe(dbRow.list_id);
    expect(task.title).toBe('Complete financial report');
    expect(task.description).toBe('Review quarterly earnings and projections');
    expect(task.status).toBe('open');
    expect(task.priority).toBe('high');
    expect(task.dueAt).toBe('2026-09-10T15:00:00.000Z');
    expect(task.hasDueTime).toBe(true);
    expect(task.estimatedMinutes).toBe(60);
    expect(task.isFlexible).toBe(true);
    expect(task.completedAt).toBeNull();
  });

  it('rejects invalid task status', () => {
    const invalidRow = {
      id: 'a0000000-0000-0000-0000-000000000001',
      user_id: '11111111-1111-1111-1111-111111111111',
      list_id: null,
      title: 'Invalid status task',
      description: null,
      status: 'pending_review', // Invalid enum value
      priority: 'normal',
      due_at: null,
      has_due_time: false,
      estimated_minutes: null,
      scheduled_event_id: null,
      is_flexible: true,
      recurrence_rule: null,
      completed_at: null,
      created_at: '2026-09-01T10:00:00.000Z',
      updated_at: '2026-09-01T10:00:00.000Z',
    };

    expect(() => taskRowSchema.parse(invalidRow)).toThrow();
  });

  it('transforms database task_list row into camelCase TaskList', () => {
    const dbListRow = {
      id: 'b0000000-0000-0000-0000-000000000001',
      user_id: '11111111-1111-1111-1111-111111111111',
      name: 'Work Projects',
      color: '#6E8BFF',
      position: 0,
      created_at: '2026-09-01T10:00:00.000Z',
      updated_at: '2026-09-01T10:00:00.000Z',
    };

    const list = taskListRowSchema.parse(dbListRow);
    expect(list.id).toBe(dbListRow.id);
    expect(list.userId).toBe(dbListRow.user_id);
    expect(list.name).toBe('Work Projects');
    expect(list.color).toBe('#6E8BFF');
    expect(list.position).toBe(0);
  });

  it('transforms database tag row into camelCase Tag', () => {
    const dbTagRow = {
      id: 'c0000000-0000-0000-0000-000000000001',
      user_id: '11111111-1111-1111-1111-111111111111',
      name: 'urgent-client',
      color: '#FF6B6B',
    };

    const tag = tagRowSchema.parse(dbTagRow);
    expect(tag.id).toBe(dbTagRow.id);
    expect(tag.userId).toBe(dbTagRow.user_id);
    expect(tag.name).toBe('urgent-client');
    expect(tag.color).toBe('#FF6B6B');
  });

  it('validates createTaskSchema inputs and rejects invalid inputs', () => {
    expect(() =>
      createTaskSchema.parse({
        title: '', // Empty title
        priority: 'normal',
      }),
    ).toThrow();

    const valid = createTaskSchema.parse({
      title: 'Valid task title',
      priority: 'high',
      estimatedMinutes: 30,
      isFlexible: false,
    });

    expect(valid.title).toBe('Valid task title');
    expect(valid.priority).toBe('high');
    expect(valid.estimatedMinutes).toBe(30);
    expect(valid.isFlexible).toBe(false);
  });

  it('validates updateTaskSchema requiring valid uuid id', () => {
    expect(() =>
      updateTaskSchema.parse({
        id: 'not-a-uuid',
        title: 'Updated title',
      }),
    ).toThrow();

    const valid = updateTaskSchema.parse({
      id: 'a0000000-0000-0000-0000-000000000001',
      title: 'Updated title',
      priority: 'urgent',
    });

    expect(valid.id).toBe('a0000000-0000-0000-0000-000000000001');
    expect(valid.title).toBe('Updated title');
    expect(valid.priority).toBe('urgent');
  });
});
