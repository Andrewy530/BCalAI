import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Card, Chip, EmptyState, ErrorState, LoadingState, Text, useTheme } from '@cal/ui';

import { useTaskEditorStore } from '../../../store/task-editor.store';
import { TaskGroup } from '../components/TaskGroup';
import { useTaskActions } from '../hooks/useTaskActions';
import { useTaskBuckets } from '../hooks/useTaskBuckets';
import { useTaskLists } from '../hooks/useTasks';

/**
 * The task inbox.
 *
 * Everything the user has captured, grouped by how soon it needs attention.
 * Groups hide themselves when empty so the screen stays short on a light day
 * rather than presenting five empty headers.
 */
export function TasksScreen() {
  const theme = useTheme();
  const openNew = useTaskEditorStore((state) => state.openNew);

  // `undefined` = every list; `null` = the inbox specifically.
  const [listFilter, setListFilter] = useState<string | null | undefined>(undefined);

  const { data: lists } = useTaskLists();
  const { buckets, tasks, timeZone, hourCycle, now, isLoading, isError, refetch } = useTaskBuckets(
    listFilter === undefined ? undefined : { listId: listFilter },
  );
  const actions = useTaskActions();

  if (isLoading) return <LoadingState label="Loading your tasks" />;
  if (isError) {
    return (
      <ErrorState
        title="We could not load your tasks"
        message="Check your connection and try again."
        onRetry={refetch}
      />
    );
  }

  const groupProps = {
    lists: lists ?? [],
    timeZone,
    hourCycle,
    now,
    onToggleComplete: actions.onToggleComplete,
    onOpenTask: actions.onOpenTask,
    onSnooze: actions.onSnooze,
    onDelete: actions.onDelete,
  };

  const openCount = tasks.filter((task) => task.status !== 'completed').length;
  const isEmpty = tasks.length === 0;

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.xxs }}>
        <Text variant="display">Tasks</Text>
        <Text variant="callout" color="secondary">
          {openCount === 0
            ? 'Nothing outstanding'
            : `${openCount} open ${openCount === 1 ? 'task' : 'tasks'}`}
        </Text>
      </View>

      {(lists ?? []).length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: theme.spacing.sm, paddingRight: theme.spacing.lg }}
        >
          <Chip label="All" selected={listFilter === undefined} onPress={() => setListFilter(undefined)} />
          <Chip
            label="Inbox"
            icon="file-tray-outline"
            selected={listFilter === null}
            onPress={() => setListFilter(null)}
          />
          {(lists ?? []).map((list) => (
            <Chip
              key={list.id}
              label={list.name}
              color={list.color}
              selected={listFilter === list.id}
              onPress={() => setListFilter(list.id)}
            />
          ))}
        </ScrollView>
      ) : null}

      {isEmpty ? (
        <Card padded={false}>
          <EmptyState
            icon="file-tray-outline"
            title="Your inbox is clear"
            message="Anything you capture without a list lands here first."
            actionLabel="Add a task"
            onAction={() => openNew(listFilter ?? null)}
          />
        </Card>
      ) : (
        <>
          <TaskGroup title="Overdue" tasks={buckets.overdue} {...groupProps} />
          <TaskGroup title="Today" tasks={buckets.dueToday} {...groupProps} />
          <TaskGroup title="Upcoming" tasks={buckets.upcoming} {...groupProps} />
          <TaskGroup title="Scheduled" tasks={buckets.scheduled} {...groupProps} />
          <TaskGroup title="No date" tasks={buckets.someday} {...groupProps} />
          <TaskGroup title="Completed today" tasks={buckets.completedToday} {...groupProps} />
        </>
      )}
    </View>
  );
}
