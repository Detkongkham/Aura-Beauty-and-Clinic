# Page override — Master Calendar (`/calendar`)

> Overrides `../MASTER.md` for the day/week scheduling view.

- **Density:** dashboard-dense. Hour row height 52px; day starts 08:00, ends 21:00.
- **Day view:** fixed 56px time gutter on the left (sticky), then one flex column per **active** staff member of the current branch. Column header (staff name) is `sticky top-0`, `--color-muted`, `text-xs` semibold, truncates. Appointment blocks are absolutely positioned: `top = (startHour + startMin/60 − 8) × 52px`, `height = max(20px, durationMin × 52/60)`. Block fill `--color-primary/10`, border `--color-primary/30`, two lines (customer / service) truncated, full text in `title`.
- **Week view:** not a grid — an agenda list grouped by day (7 sections), each row `HH:mm · customer · service · staff · StatusPill`. Keeps it legible on any width.
- **Nav:** prev / next / "Today" buttons + a Day/Week `Tabs` toggle in the PageHeader actions. Prev/next step 1 day (day view) or 7 days (week view).
- **Overflow:** the day grid lives in its own `overflow-x-auto` container, `min-width: 640px`; the page body never scrolls sideways.
- **Empty:** "no staff in this branch" `EmptyState` when the active branch has no active staff; per-column emptiness is just an empty lane.
- **Motion:** none on blocks (informational UI). Drag-to-reschedule is out of scope for Phase 2.
