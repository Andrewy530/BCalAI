import type { HourCycle, Task, TaskList } from '@cal/schemas';
import { Card, Divider, SectionHeader, useTheme } from '@cal/ui';
import { Fragment } from 'react';
import { View } from 'react-native';

import { TaskRow } from './TaskRow';

export interface TaskGroupProps {
  title: string;
  tasks: readonly Task[];
  lists: readonly TaskList[];
  timeZone: string;
  hourCycle: HourCycle;
  now: Date;
  onToggleComplete: (task: Task, completed: boolean) => void;
  onOpenTask: (task: Task) => void;
  onSnooze?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  /** Hidden entirely when there is nothing in it. */
  hideWhenEmpty?: boolean;
}

/** A titled card of task rows. The inbox and Today are both built from these. */
export function TaskGroup({
  title,
  tasks,
  lists,
  timeZone,
  hourCycle,
  now,
  onToggleComplete,
  onOpenTask,
  onSnooze,
  onDelete,
  hideWhenEmpty = true,
}: TaskGroupProps) {
  const theme = useTheme();

  if (tasks.length === 0 && hideWhenEmpty) return null;

  const listById = new Map(lists.map((list) => [list.id, list]));

  return (
    <View style={{ gap: theme.spacing.md }}>
      <SectionHeader title={title} count={tasks.length} />

      <Card padded={false}>
        {tasks.map((task, index) => {
          const list = task.listId ? listById.get(task.listId) : undefined;

          return (
            <Fragment key={task.id}>
              {index > 0 ? <Divider inset /> : null}
              <TaskRow
                task={task}
                listName={list?.name}
                listColor={list?.color}
                timeZone={timeZone}
                hourCycle={hourCycle}
                now={now}
                onToggleComplete={(completed) => onToggleComplete(task, completed)}
                onPress={() => onOpenTask(task)}
                onSnooze={onSnooze ? () => onSnooze(task) : undefined}
                onDelete={onDelete ? () => onDelete(task) : undefined}
              />
            </Fragment>
          );
        })}
      </Card>
    </View>
  );
}
