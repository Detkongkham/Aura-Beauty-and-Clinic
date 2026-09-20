import type { CSSProperties, SVGProps } from 'react';

/**
 * Shared Recharts styling — keeps every dashboard chart on the token palette and,
 * crucially, gives tooltips an explicit surface so they don't render as a white
 * box in dark mode (Recharts' default has no background token awareness).
 */
export const CHART_TOOLTIP_STYLE: CSSProperties = {
  borderRadius: 10,
  border: '1px solid hsl(var(--border))',
  background: 'hsl(var(--popover))',
  color: 'hsl(var(--popover-foreground))',
  boxShadow: '0 8px 24px -6px hsl(var(--foreground) / 0.15)',
  fontSize: 12,
  padding: '8px 10px',
};

export const CHART_TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: 'hsl(var(--muted-foreground))',
  fontSize: 11,
  fontWeight: 500,
  marginBottom: 2,
};

export const CHART_TOOLTIP_ITEM_STYLE: CSSProperties = {
  color: 'hsl(var(--popover-foreground))',
  fontSize: 12,
  padding: 0,
};

/** Soft hover cursor for area / bar charts. */
export const CHART_CURSOR_FILL = 'hsl(var(--primary) / 0.06)';

// Passed to Recharts `<XAxis tick>` / `<YAxis tick>`, which expect SVG text
// presentation attributes — not a CSS style object.
export const CHART_AXIS_TICK: SVGProps<SVGTextElement> = {
  fontSize: 11,
  fill: 'hsl(var(--muted-foreground))',
};
