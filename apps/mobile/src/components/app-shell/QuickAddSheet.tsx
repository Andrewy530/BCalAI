import { View } from 'react-native';

import { BottomSheet, Chip, Text, useTheme } from '@cal/ui';

import { QuickAddTaskForm } from '../../features/tasks/components/QuickAddTaskForm';
import { type QuickAddMode, useQuickAddStore } from '../../store/quick-add.store';

const MODES: {
  mode: QuickAddMode;
  label: string;
  icon: 'checkbox-outline' | 'calendar-outline' | 'time-outline';
}[] = [
  { mode: 'task', label: 'Task', icon: 'checkbox-outline' },
  { mode: 'event', label: 'Event', icon: 'calendar-outline' },
  { mode: 'block', label: 'Time block', icon: 'time-outline' },
];

/**
 * Quick Add is the app's fastest path from thought to captured item, so it is
 * a sheet rather than a screen — the context behind it stays visible.
 *
 * The task lane is live as of Sprint 1. Events and time blocks arrive with the
 * internal calendar in Sprint 2.
 */
export function QuickAddSheet() {
  const theme = useTheme();
  const { isOpen, mode, seedDateKey, close, setMode } = useQuickAddStore();

  return (
    <BottomSheet visible={isOpen} onClose={close} title="Quick add">
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        {MODES.map((option) => (
          <Chip
            key={option.mode}
            label={option.label}
            icon={option.icon}
            selected={mode === option.mode}
            onPress={() => setMode(option.mode)}
          />
        ))}
      </View>

      {mode === 'task' ? (
        <QuickAddTaskForm onCaptured={close} seedDateKey={seedDateKey} />
      ) : (
        <Text variant="callout" color="secondary">
          {mode === 'event'
            ? 'Events arrive with the calendar in the next sprint.'
            : 'Time blocks arrive with the calendar in the next sprint.'}
        </Text>
      )}
    </BottomSheet>
  );
}
