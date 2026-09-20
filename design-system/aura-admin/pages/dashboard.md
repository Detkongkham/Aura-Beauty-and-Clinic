# Page override — Dashboard (`/`)

> Overrides `../MASTER.md` for the Dashboard Overview screen.

- **Grid:** 4 stat cards in a row at ≥1280px (`xl:grid-cols-4`), 2-up at 640–1279px, stacked below. Charts row: revenue area spans 2 of 3 columns, service-mix donut takes 1; stacks below `lg`.
- **Stat cards:** figure in `text-3xl` tabular-nums; delta chip carries a ▲/▼ glyph **and** colour (`--color-success` / `--color-destructive` / muted for flat) — never colour alone. Loading = `Skeleton` sized to the figure, not a spinner.
- **Charts (design.md §13):** revenue = single area, `--chart-1`, gradient 12%→0, x = `DD/MM`, y = ₭ abbreviated; donut = ≤6 slices then "Other", legend lists value + %. Every chart container has an `aria-label` summary; jsdom/no-layout must not crash (guard ResizeObserver).
- **Upcoming list:** max 6 rows, each row links to the appointment; status shown via `StatusPill` (dot + label). "View all" ghost link to `/appointments` in the card header.
- **Motion:** stat grid may use the MASTER stagger (`back.out(1.4)`, 300–450ms) on first paint only; **no overshoot on the charts or the list**. Respect reduced-motion.
- **Branch scope:** everything reflects `useUiStore().activeBranchId`; changing the topbar branch refetches (`queryKey` includes branchId).
- **Empty/error:** whole-page `EmptyState` with a retry button on query error; individual cards show `—` until data resolves.
