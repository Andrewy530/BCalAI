import { useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet } from 'react-native';

import { useQuickAddStore } from '../../store/quick-add.store';

/**
 * The persistent capture affordance, rendered above the navigation bar so it is
 * reachable with a thumb from anywhere in the app.
 */
export function QuickAddButton() {
  const theme = useTheme();
  const open = useQuickAddStore((state) => state.open);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Quick add"
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        open('task');
      }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radius.pill,
          transform: [{ scale: pressed ? theme.motion.pressScale : 1 }],
          ...theme.elevation.card,
        },
      ]}
    >
      <Ionicons name="add" size={30} color={theme.colors.onAccent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
