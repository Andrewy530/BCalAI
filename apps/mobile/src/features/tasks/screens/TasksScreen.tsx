import { View } from 'react-native';

import { Card, EmptyState, SectionHeader, Text, useTheme } from '@cal/ui';

import { useQuickAddStore } from '../../../store/quick-add.store';

/**
 * Sprint 0 shell. Sprint 1 replaces the empty card with the real inbox list and
 * adds the task editor bottom sheet.
 */
export function TasksScreen() {
  const theme = useTheme();
  const openQuickAdd = useQuickAddStore((state) => state.open);

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <Text variant="display">Tasks</Text>

      <View style={{ gap: theme.spacing.md }}>
        <SectionHeader title="Inbox" count={0} />
        <Card padded={false}>
          <EmptyState
            icon="file-tray-outline"
            title="Your inbox is clear"
            message="Anything you capture without a list lands here first."
            actionLabel="Add a task"
            onAction={() => openQuickAdd('task')}
          />
        </Card>
      </View>

      <View style={{ gap: theme.spacing.md }}>
        <SectionHeader title="Lists" count={0} />
        <Card padded={false}>
          <EmptyState
            icon="albums-outline"
            title="No lists yet"
            message="Group related work into lists like Work, Personal, or a project."
          />
        </Card>
      </View>
    </View>
  );
}
