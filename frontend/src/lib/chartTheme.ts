import type React from 'react';

/**
 * Chart palette + recharts defaults, driven by the CSS tokens in theme.css so
 * charts follow light/dark mode. Series order: brand orange, info blue,
 * accent amber, success green, neutral, deep orange.
 */
export const CHART_SERIES_VARS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6'] as const;

export const CHART_COLORS_FALLBACK = ['#F57722', '#67ADED', '#FF9D2A', '#0E9F6E', '#737373', '#A3460B'];

/** Resolve the current series colours (call inside render so theme switches apply). */
export function chartColors(): string[] {
  if (typeof window === 'undefined') return CHART_COLORS_FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  return CHART_SERIES_VARS.map((v, i) => cs.getPropertyValue(v).trim() || CHART_COLORS_FALLBACK[i]);
}

/** Shared recharts props: quiet axes, dashed grid, readable ticks in both themes. */
export const chartAxis = {
  tick: { fill: 'var(--fg-muted)', fontSize: 12 },
  axisLine: false as const,
  tickLine: false as const,
};

export const chartGrid = {
  stroke: 'var(--border-default)',
  strokeDasharray: '3 3',
  vertical: false as const,
};

export const chartTooltipStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-default)',
  borderRadius: 8,
  boxShadow: '0 4px 12px rgb(20 20 20 / 0.08)',
  color: 'var(--fg-default)',
  fontSize: 12,
};
