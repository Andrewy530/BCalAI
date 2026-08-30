import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import type { CreateTaskInput, UpdateTaskInput } from '@cal/schemas';

import { queryKeys } from '../../../lib/query/query-client';
import { useAuth, useRequiredUserId } from '../../auth';
import {
  type TaskWithTags,
  createTask,
  createTaskList,
  deleteTask,
  deleteTaskList,
  fetchTags,
  fetchTask,
  fetchTaskLists,
  fetchTasks,
  setTaskCompleted,
  snoozeTask,
  updateTask,
} from '../api/tasks.api';

/**
 * Task server state.
 *
 * Everything reads from one cached collection keyed by `openOnly`. Mutations
 * update that cache optimistically — completing a task has to feel instant —
 * and then invalidate so the server's version wins on settle.
 */

export function useTasks(options?: { openOnly?: boolean }) {
  const { isAuthenticated } = useAuth();
  const openOnly = options?.openOnly ?? false;

  return useQuery({
    queryKey: queryKeys.tasks.list(openOnly),
    queryFn: () => fetchTasks({ openOnly }),
    enabled: isAuthenticated,
  });
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: queryKeys.tasks.detail(id ?? 'none'),
    queryFn: () => fetchTask(id as string),
    enabled: !!id,
  });
}

export function useTaskLists() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.tasks.lists(),
    queryFn: fetchTaskLists,
    enabled: isAuthenticated,
  });
}

export function useTags() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.tasks.tags(),
    queryFn: fetchTags,
    enabled: isAuthenticated,
  });
}

/** Invalidate every task collection, whatever its `openOnly` flag. */
function useInvalidateTasks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all() });
}

export function useCreateTask() {
  const userId = useRequiredUserId();
  const invalidate = useInvalidateTasks();

  return useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(input, userId),
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onSettled: () => void invalidate(),
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidateTasks();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateTaskInput) => updateTask(input),
    onSuccess: (task) => {
      queryClient.setQueryData(queryKeys.tasks.detail(task.id), task);
    },
    onSettled: () => void invalidate(),
  });
}

/**
 * Completion is the most-used action in the app, so it is fully optimistic:
 * the row updates and the haptic fires before the request is even sent.
 */
export function useToggleTaskComplete() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTasks();

  return useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      setTaskCompleted(id, completed),

    onMutate: async ({ id, completed }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all() });

      void Haptics.impactAsync(
        completed ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
      );

      const snapshots = queryClient.getQueriesData<TaskWithTags[]>({
        queryKey: queryKeys.tasks.all(),
      });

      for (const [key, tasks] of snapshots) {
        if (!Array.isArray(tasks)) continue;
        queryClient.setQueryData<TaskWithTags[]>(
          key,
          tasks.map((task) =>
            task.id === id
              ? {
                  ...task,
                  status: completed ? 'completed' : 'open',
                  completedAt: completed ? new Date().toISOString() : null,
                }
              : task,
          ),
        );
      }

      return { snapshots };
    },

    onError: (_error, _variables, context) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      for (const [key, data] of context?.snapshots ?? []) {
        queryClient.setQueryData(key, data);
      }
    },

    onSettled: () => void invalidate(),
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTasks();

  return useMutation({
    mutationFn: (id: string) => deleteTask(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all() });
      const snapshots = queryClient.getQueriesData<TaskWithTags[]>({
        queryKey: queryKeys.tasks.all(),
      });

      for (const [key, tasks] of snapshots) {
        if (!Array.isArray(tasks)) continue;
        queryClient.setQueryData<TaskWithTags[]>(
          key,
          tasks.filter((task) => task.id !== id),
        );
      }

      return { snapshots };
    },

    onError: (_error, _id, context) => {
      for (const [key, data] of context?.snapshots ?? []) {
        queryClient.setQueryData(key, data);
      }
    },

    onSettled: () => void invalidate(),
  });
}

export function useSnoozeTask() {
  const invalidate = useInvalidateTasks();

  return useMutation({
    mutationFn: ({ id, dueAt, hasDueTime }: { id: string; dueAt: Date; hasDueTime: boolean }) =>
      snoozeTask(id, dueAt, hasDueTime),
    onSuccess: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
    onSettled: () => void invalidate(),
  });
}

export function useCreateTaskList() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  const { data: lists } = useTaskLists();

  return useMutation({
    mutationFn: (input: { name: string; color: string }) =>
      createTaskList(input, userId, lists?.length ?? 0),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.lists() });
    },
  });
}

export function useDeleteTaskList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteTaskList(id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.lists() });
      // Tasks in the deleted list fall back to the inbox, so they change too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all() });
    },
  });
}
