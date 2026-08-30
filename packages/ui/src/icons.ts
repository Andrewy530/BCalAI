import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

/**
 * The icon set for the whole app. Naming it once means a future set swap is a
 * change in this file rather than in every component that takes an icon.
 */
export type IconName = ComponentProps<typeof Ionicons>['name'];
