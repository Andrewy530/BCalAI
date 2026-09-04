import type { CreateTaskInput, UpdateTaskInput } from '@cal/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
 * Task server state for the desktop web client.
 *
 * Reads from TanStack Query cache keyed by `openOnly`.
 * Completion and deletion are optimistic with error rollback and settle invalidation.
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

/** Invalidate every task query regardless of openOnly flag. */
function useInvalidateTasks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all() });
}

export function useCreateTask() {
  const userId = useRequiredUserId();
  const invalidate = useInvalidateTasks();

  return useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(input, userId),
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
 * Completion is optimistic: updates cache immediately, rolls back on error,
 * and invalidates on settle so server version wins.
 */
export function useToggleTaskComplete() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTasks();

  return useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      setTaskCompleted(id, completed),

    onMutate: async ({ id, completed }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all() });

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
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all() });
    },
  });
}
