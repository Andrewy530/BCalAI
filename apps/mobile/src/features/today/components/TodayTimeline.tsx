import { formatTimeOfDay } from '@cal/domain';
import type { HourCycle, Task, TaskList } from '@cal/schemas';
import { Card, Divider, EmptyState, ListRow, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { Fragment } from 'react';

import { TaskRow } from '../../tasks/components/TaskRow';
import type { TodayTimelineItem } from '../hooks/useTodaySummary';

export interface TodayTimelineProps {
  items: readonly TodayTimelineItem[];
  lists: readonly TaskList[];
  timeZone: string;
  hourCycle: HourCycle;
  now: Date;
  onOpenEvent: (eventId: string) => void;
  onOpenTask: (taskId: string) => void;
  onToggleComplete: (task: Task, completed: boolean) => void;
  onSnooze: (task: Task) => void;
  onDelete: (task: Task) => void;
  onAddEvent: () => void;
}

/** One chronological card containing both fixed commitments and timed work. */
export function TodayTimeline({
  items,
  lists,
  timeZone,
  hourCycle,
  now,
  onOpenEvent,
  onOpenTask,
  onToggleComplete,
  onSnooze,
  onDelete,
  onAddEvent,
}: TodayTimelineProps) {
  const theme = useTheme();
  const listById = new Map(lists.map((list) => [list.id, list]));

  if (items.length === 0) {
    return (
      <Card padded={false}>
        <EmptyState
          icon="calendar-outline"
          title="Your day is open"
          message="Add an event or a timed task and it will appear in one chronological view."
          actionLabel="Add an event"
          onAction={onAddEvent}
        />
      </Card>
    );
  }

  return (
    <Card padded={false}>
      {items.map((item, index) => {
        const content =
          item.kind === 'event' ? (
            <ListRow
              title={item.occurrence.event.title}
              subtitle={item.occurrence.event.location ?? 'Calendar event'}
              meta={
                item.occurrence.event.allDay
                  ? 'All day'
                  : formatTimeOfDay(new Date(item.start), timeZone, hourCycle)
              }
              leading={
                <Ionicons
                  name="calendar-outline"
                  size={19}
                  color={item.occurrence.calendar?.color ?? theme.colors.accent}
                />
              }
              accentColor={item.occurrence.calendar?.color}
              onPress={() => onOpenEvent(item.occurrence.event.id)}
            />
          ) : (
            <TaskRow
              task={item.task}
              listName={item.task.listId ? listById.get(item.task.listId)?.name : undefined}
              listColor={item.task.listId ? listById.get(item.task.listId)?.color : undefined}
              timeZone={timeZone}
              hourCycle={hourCycle}
              now={now}
              onToggleComplete={(completed) => onToggleComplete(item.task, completed)}
              onPress={() => onOpenTask(item.task.id)}
              onSnooze={() => onSnooze(item.task)}
              onDelete={() => onDelete(item.task)}
            />
          );

        return (
          <Fragment key={item.key}>
            {index > 0 ? <Divider inset /> : null}
            {content}
          </Fragment>
        );
      })}
    </Card>
  );
}
