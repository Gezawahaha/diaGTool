/** PROJECT.md §14 — dark by default, status colors carry meaning. */
export const colors = {
  background: '#0B0B0C',
  card: '#1C1C1E',
  cardBorder: '#2C2C2E',
  textPrimary: '#F2F2F7',
  textSecondary: '#8E8E93',
  normal: '#30D158',
  warning: '#FFD60A',
  error: '#FF453A',
  unknown: '#8E8E93',
} as const;

export type StatusTone = 'normal' | 'warning' | 'error' | 'unknown';

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24 } as const;
