import { EventEditorSheet } from '../../features/events/components/EventEditorSheet';
import { TaskEditorSheet } from '../../features/tasks/components/TaskEditorSheet';
import { useEventEditorStore } from '../../store/event-editor.store';
import { useTaskEditorStore } from '../../store/task-editor.store';

import { QuickAddSheet } from './QuickAddSheet';

/**
 * Every app-level sheet, mounted once at the root.
 *
 * They live here rather than inside a screen because any screen can open them
 * — Today opens the task editor, the calendar opens the event editor — and a
 * sheet owned by a screen would unmount as soon as the user navigated away.
 */
export function AppSheets() {
  const taskEditor = useTaskEditorStore();
  const eventEditor = useEventEditorStore();

  return (
    <>
      <QuickAddSheet />

      <TaskEditorSheet
        visible={taskEditor.isOpen}
        onClose={taskEditor.close}
        taskId={taskEditor.taskId}
        defaultListId={taskEditor.defaultListId}
      />

      <EventEditorSheet
        visible={eventEditor.isOpen}
        onClose={eventEditor.close}
        eventId={eventEditor.eventId}
        seedStart={eventEditor.seedStart ? new Date(eventEditor.seedStart) : null}
      />
    </>
  );
}
