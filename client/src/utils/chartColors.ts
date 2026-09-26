function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export const chartColors = {
  brand: '#2563EB',
  brandLight: '#3B82F6',
  brandSubtle: '#DBEAFE',
  brandFill: '#EFF6FF',

  positive: '#059669',
  positiveLight: '#10B981',
  positiveFill: '#ECFDF5',

  negative: '#DC2626',
  negativeLight: '#EF4444',
  negativeFill: '#FEF2F2',

  caution: '#D97706',

  get grid() {
    return cssVar('--color-chart-grid', '#F3F4F6');
  },
  get axis() {
    return cssVar('--color-chart-axis', '#9CA3AF');
  },
  get tooltipBorder() {
    return cssVar('--color-chart-tooltip-border', '#E5E7EB');
  },
  get tooltipBg() {
    return cssVar('--color-chart-tooltip-bg', '#FFFFFF');
  },
  get label() {
    return cssVar('--color-chart-label', '#374151');
  },
};

export const CATEGORY_COLORS = [
  '#2563EB', // brand blue
  '#7C3AED', // violet
  '#0891B2', // cyan
  '#059669', // emerald
  '#D97706', // amber
  '#DC2626', // red
  '#DB2777', // pink
  '#4F46E5', // indigo
  '#0D9488', // teal
  '#EA580C', // orange
  '#2DD4BF', // teal-light
  '#8B5CF6', // purple
] as const;
