import { View } from 'react-native';

import { BottomSheet, Button, Chip, Text, useTheme } from '@cal/ui';

import { type QuickAddMode, useQuickAddStore } from '../../store/quick-add.store';

const MODES: { mode: QuickAddMode; label: string; icon: 'checkbox-outline' | 'calendar-outline' | 'time-outline' }[] = [
  { mode: 'task', label: 'Task', icon: 'checkbox-outline' },
  { mode: 'event', label: 'Event', icon: 'calendar-outline' },
  { mode: 'block', label: 'Time block', icon: 'time-outline' },
];

/**
 * Quick Add is the app's fastest path from thought to captured item, so it is
 * a sheet rather than a screen — the context behind it stays visible.
 *
 * Sprint 1 puts the real task form in here; Sprint 2 adds the event form.
 */
export function QuickAddSheet() {
  const theme = useTheme();
  const { isOpen, mode, close, setMode } = useQuickAddStore();

  return (
    <BottomSheet
      visible={isOpen}
      onClose={close}
      title="Quick add"
      footer={<Button label="Done" variant="secondary" fullWidth onPress={close} />}
    >
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

      <Text variant="callout" color="secondary">
        {mode === 'task'
          ? 'Capture something you need to do. A title is enough — a due date and an estimate can come later.'
          : mode === 'event'
            ? 'Add a commitment with a fixed time.'
            : 'Reserve time for work you want to protect.'}
      </Text>
    </BottomSheet>
  );
}
