import { View } from 'react-native';

import type { TaskList } from '@cal/schemas';
import { Chip, Text, useTheme } from '@cal/ui';

export interface ListPickerProps {
  lists: readonly TaskList[];
  value: string | null;
  onChange: (listId: string | null) => void;
}

export function ListPicker({ lists, value, onChange }: ListPickerProps) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="subhead" color="secondary">
        List
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        <Chip
          label="Inbox"
          icon="file-tray-outline"
          selected={value === null}
          onPress={() => onChange(null)}
        />
        {lists.map((list) => (
          <Chip
            key={list.id}
            label={list.name}
            color={list.color}
            selected={value === list.id}
            onPress={() => onChange(list.id)}
          />
        ))}
      </View>
    </View>
  );
}
