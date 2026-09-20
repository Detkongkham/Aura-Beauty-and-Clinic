import { cn } from '@/lib/utils';

interface Item {
  label: string;
  value: number;
  /** Optional formatted value shown at the bar end. */
  display?: string;
  /** Highlight this bar (e.g. the peak). */
  emphasis?: boolean;
}

interface Props {
  items: Item[];
  ariaLabel: string;
  /** `wide` — labels can be long (truncate, fixed-width bar on the right).
   *  `compact` (default) — short labels, bar fills the row. */
  variant?: 'compact' | 'wide';
}

/** Labelled bar list — azure bars, a solid primary for the emphasised row.
 *  `compact` for short labels (weekday, hour); `wide` for long ones (service,
 *  staff, branch names) so they truncate instead of squashing the bar. */
export function LabeledBars({ items, ariaLabel, variant = 'compact' }: Props) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const wide = variant === 'wide';

  return (
    <ul className="space-y-1.5" role="img" aria-label={ariaLabel}>
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-2.5 text-xs">
          <span
            title={it.label}
            className={cn(
              'shrink-0 truncate text-muted-foreground',
              wide ? 'w-24 sm:w-36' : 'w-12',
            )}
          >
            {it.label}
          </span>
          <span className="h-2 min-w-[4rem] flex-1 overflow-hidden rounded-full bg-primary/10">
            <span
              className={cn(
                'block h-full rounded-full',
                it.emphasis ? 'bg-primary' : 'bg-primary/45',
              )}
              style={{ width: `${Math.max((it.value / max) * 100, it.value > 0 ? 3 : 0)}%` }}
            />
          </span>
          <span
            className={cn(
              'shrink-0 text-right tabular-nums text-muted-foreground',
              wide ? 'w-20 sm:w-24' : 'w-16',
            )}
          >
            {it.display ?? it.value}
          </span>
        </li>
      ))}
    </ul>
  );
}
