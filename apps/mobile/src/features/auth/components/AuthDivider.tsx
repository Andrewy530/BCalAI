import { StyleSheet, View } from 'react-native';

import { Text, useTheme } from '@cal/ui';

export function AuthDivider({ label = 'or' }: { label?: string }) {
  const theme = useTheme();
  const rule = { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border };

  return (
    <View style={[styles.row, { gap: theme.spacing.md }]}>
      <View style={rule} />
      <Text variant="footnote" color="tertiary">
        {label}
      </Text>
      <View style={rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
