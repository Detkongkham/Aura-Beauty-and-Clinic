/** Shared categorical palette — design.md §1.4 chart tokens. Colour is never the
 *  only signal (always paired with a label/value), per design.md §10. */
export const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
] as const;

export const chartColor = (index: number): string =>
  CHART_COLORS[index % CHART_COLORS.length] ?? CHART_COLORS[0];
