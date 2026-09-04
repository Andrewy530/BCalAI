import { addZonedDays, getZonedParts, zonedWallClockToUtc } from '@cal/domain';
import type { CreateTaskInput, UpdateTaskInput } from '@cal/schemas';
import { useCallback, useState } from 'react';

import { TaskInspector } from './TaskInspector';
import { TaskListPane } from './TaskListPane';
import styles from './TasksView.module.css';
import type { TaskWithTags } from '../api/tasks.api';
import { type TaskFilter, useTaskBuckets } from '../hooks/useTaskBuckets';
import {
  useCreateTask,
  useDeleteTask,
  useSnoozeTask,
  useTags,
  useTaskLists,
  useToggleTaskComplete,
  useUpdateTask,
} from '../hooks/useTasks';

export function TasksView() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isDraft, setIsDraft] = useState(false);
  const [activeTab, setActiveTab] = useState<TaskFilter>('inbox');
  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  const { buckets, tasks, timeZone, now, isLoading, isError, refetch } = useTaskBuckets({
    listId: selectedListId,
    filter: activeTab,
  });

  const { data: lists } = useTaskLists();
  const { data: tags } = useTags();

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const toggleComplete = useToggleTaskComplete();
  const deleteTask = useDeleteTask();
  const snoozeTask = useSnoozeTask();

  const selectedTask =
    tasks.find((t) => t.id === selectedTaskId) ??
    buckets.allCompleted.find((t) => t.id === selectedTaskId) ??
    null;

  const handleSelectTask = useCallback((task: TaskWithTags) => {
    setIsDraft(false);
    setSelectedTaskId(task.id);
  }, []);

  const handleNewTaskClick = useCallback(() => {
    setSelectedTaskId(null);
    setIsDraft(true);
  }, []);

  const handleCloseInspector = useCallback(() => {
    setSelectedTaskId(null);
    setIsDraft(false);
  }, []);

  const handleToggleComplete = useCallback(
    (task: TaskWithTags, completed: boolean) => {
      toggleComplete.mutate({ id: task.id, completed });
    },
    [toggleComplete],
  );

  const handleSnooze = useCallback(
    (task: TaskWithTags) => {
      const base = task.dueAt ? new Date(task.dueAt) : new Date();
      const tomorrow = addZonedDays(base, 1, timeZone);
      const parts = getZonedParts(tomorrow, timeZone);
      const existing = task.dueAt ? getZonedParts(new Date(task.dueAt), timeZone) : null;

      const dueAt = zonedWallClockToUtc(
        {
          year: parts.year,
          month: parts.month,
          day: parts.day,
          hour: task.hasDueTime && existing ? existing.hour : 12,
          minute: task.hasDueTime && existing ? existing.minute : 0,
        },
        timeZone,
      );

      snoozeTask.mutate({ id: task.id, dueAt, hasDueTime: task.hasDueTime });
    },
    [snoozeTask, timeZone],
  );

  const handleDelete = useCallback(
    (task: TaskWithTags) => {
      if (selectedTaskId === task.id) {
        handleCloseInspector();
      }
      deleteTask.mutate(task.id);
    },
    [deleteTask, handleCloseInspector, selectedTaskId],
  );

  const handleQuickAdd = useCallback(
    (title: string) => {
      createTask.mutate({
        title,
        listId: selectedListId,
        priority: 'normal',
        hasDueTime: false,
        isFlexible: true,
        tagIds: [],
      });
    },
    [createTask, selectedListId],
  );

  const handleInspectorSave = useCallback(
    async (data: CreateTaskInput | UpdateTaskInput) => {
      if ('id' in data) {
        await updateTask.mutateAsync(data);
      } else {
        const created = await createTask.mutateAsync(data);
        setIsDraft(false);
        setSelectedTaskId(created.id);
      }
    },
    [createTask, updateTask],
  );

  return (
    <div className={styles.container}>
      <TaskListPane
        buckets={buckets}
        allTasks={tasks}
        lists={lists}
        selectedTaskId={selectedTaskId}
        selectedListId={selectedListId}
        activeTab={activeTab}
        isLoading={isLoading}
        isError={isError}
        now={now}
        timeZone={timeZone}
        onTabChange={setActiveTab}
        onListChange={setSelectedListId}
        onSelectTask={handleSelectTask}
        onToggleComplete={handleToggleComplete}
        onSnooze={handleSnooze}
        onDelete={handleDelete}
        onQuickAdd={handleQuickAdd}
        onNewTaskClick={handleNewTaskClick}
        onRetry={refetch}
      />

      {(selectedTask || isDraft) && (
        <TaskInspector
          task={selectedTask}
          isDraft={isDraft}
          lists={lists}
          tags={tags}
          timeZone={timeZone}
          isSaving={createTask.isPending || updateTask.isPending}
          onClose={handleCloseInspector}
          onSave={handleInspectorSave}
          onToggleComplete={handleToggleComplete}
          onSnooze={handleSnooze}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
