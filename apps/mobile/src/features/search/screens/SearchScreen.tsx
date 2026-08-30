import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';

import { Card, EmptyState, TextField, useTheme } from '@cal/ui';

/**
 * Sprint 0 shell. Sprint 3 wires this to a combined event/task query.
 */
export function SearchScreen() {
  const theme = useTheme();
  const [query, setQuery] = useState('');

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <TextField
        value={query}
        onChangeText={setQuery}
        placeholder="Search events and tasks"
        autoCorrect={false}
        returnKeyType="search"
        leading={<Ionicons name="search" size={18} color={theme.colors.textTertiary} />}
      />

      <Card padded={false}>
        <EmptyState
          icon="search-outline"
          title={query ? 'No matches yet' : 'Search everything'}
          message={
            query
              ? 'Search will cover events, tasks, notes, and locations once they exist.'
              : 'Find any event or task by title, note, or location.'
          }
        />
      </Card>
    </View>
  );
}
