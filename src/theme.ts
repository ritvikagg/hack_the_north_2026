// ─────────────────────────────────────────────────────────────────
// Design tokens — everyone imports from here instead of hardcoding
// colors/spacing in components. Keeps the demo visually consistent
// even though three people are building different screens.
// Palette pulled from the deck (dark bg, pink/purple gradient accents).
// ─────────────────────────────────────────────────────────────────

export const colors = {
  background: '#1A1625',
  surface: '#251F35',
  surfaceElevated: '#2E2740',
  border: '#3A3250',

  pink: '#EC5FA8',
  pinkMuted: '#C2568C',
  purple: '#8B5CF6',
  gradientStart: '#F97362',
  gradientEnd: '#7C3AED',

  textPrimary: '#F5F3FA',
  textSecondary: '#A79FB8',

  success: '#4ADE80',
  danger: '#F87171',
  locked: '#6B6480',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const typography = {
  h1: { fontSize: 32, fontWeight: '700' as const },
  h2: { fontSize: 24, fontWeight: '600' as const },
  h3: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
};
