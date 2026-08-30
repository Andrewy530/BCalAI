/** 4pt spacing scale. Every gap in the app is one of these. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const radius = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 999,
} as const;

/** Shadows are deliberately soft; depth comes mostly from surface colour. */
export const elevation = {
  none: { shadowOpacity: 0, elevation: 0 },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  sheet: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
} as const;

/**
 * Motion tokens. Durations are short on purpose: motion here communicates a
 * state change, it does not perform.
 */
export const motion = {
  duration: { instant: 80, fast: 140, base: 220, slow: 320 },
  /** Reanimated easing-friendly cubic-bezier control points. */
  easing: {
    standard: [0.2, 0, 0, 1] as const,
    decelerate: [0, 0, 0, 1] as const,
    accelerate: [0.3, 0, 1, 1] as const,
  },
  spring: { damping: 20, stiffness: 220, mass: 0.9 },
  pressScale: 0.97,
} as const;

export type Spacing = keyof typeof spacing;
export type Radius = keyof typeof radius;
