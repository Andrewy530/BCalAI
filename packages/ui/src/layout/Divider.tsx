import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

export interface DividerProps {
  /** Indents the rule so it aligns with row text rather than the card edge. */
  inset?: boolean;
  style?: ViewStyle;
}

export function Divider({ inset = false, style }: DividerProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          height: StyleSheet.hairlineWidth,
          backgroundColor: theme.colors.border,
          marginLeft: inset ? theme.spacing.lg : 0,
        },
        style,
      ]}
    />
  );
}
