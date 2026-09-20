interface Part {
  label: string;
  value: number;
  /** CSS colour (token via hsl(var(--…))). */
  color: string;
  /** Optional formatted display value (defaults to the raw count). */
  display?: string;
}

/** A single 100% two-or-more-segment bar with a ruled legend — for
 *  part-to-whole splits (walk-in vs booked, home vs in-store, …). */
export function SplitMeter({ parts, ariaLabel }: { parts: Part[]; ariaLabel: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="space-y-2">
      <div
        className="flex h-2.5 overflow-hidden rounded-full border border-border"
        role="img"
        aria-label={ariaLabel}
      >
        {parts.map((p) => (
          <span
            key={p.label}
            className="h-full"
            style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5 text-[11px]">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <span className="text-muted-foreground">{p.label}</span>
            <span className="font-semibold tabular-nums text-foreground">
              {p.display ?? p.value}
            </span>
            <span className="tabular-nums text-muted-foreground/70">
              ({Math.round((p.value / total) * 100)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
