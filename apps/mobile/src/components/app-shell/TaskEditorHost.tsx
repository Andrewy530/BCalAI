import { TaskEditorSheet } from '../../features/tasks/components/TaskEditorSheet';
import { useTaskEditorStore } from '../../store/task-editor.store';

/**
 * Mounts the task editor once, at the root, so any screen can open it without
 * each one having to own a sheet of its own.
 */
export function TaskEditorHost() {
  const { isOpen, taskId, defaultListId, close } = useTaskEditorStore();

  return (
    <TaskEditorSheet
      visible={isOpen}
      onClose={close}
      taskId={taskId}
      defaultListId={defaultListId}
    />
  );
}
