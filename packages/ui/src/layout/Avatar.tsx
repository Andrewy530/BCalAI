import { Image, View } from 'react-native';

import { Text } from '../text/Text';
import { useTheme } from '../theme/ThemeProvider';

export interface AvatarProps {
  name?: string | null;
  imageUrl?: string | null;
  size?: number;
}

const initialsOf = (name?: string | null): string =>
  (name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

export function Avatar({ name, imageUrl, size = 40 }: AvatarProps) {
  const theme = useTheme();
  const shape = { width: size, height: size, borderRadius: size / 2 };

  if (imageUrl) {
    return <Image source={{ uri: imageUrl }} style={shape} accessibilityIgnoresInvertColors />;
  }

  return (
    <View
      accessible
      accessibilityLabel={name ? `${name}'s avatar` : 'Avatar'}
      style={[
        shape,
        {
          backgroundColor: theme.colors.accentSubtle,
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}
    >
      <Text variant="subhead" color="accent">
        {initialsOf(name)}
      </Text>
    </View>
  );
}
