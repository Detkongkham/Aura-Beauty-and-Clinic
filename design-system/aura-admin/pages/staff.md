# Page override — Staff & Working Hours (`/staff`, `/staff/:id`, `/staff/roster`, `/staff/time-off`)

> Overrides `../MASTER.md` for the People → Staff screens.

- **List:** `DataTable` — Name (medium) · Job title · Branch · Services (right, count) · Status badge. Search + branch `Select` filter. Row click → `/staff/:id`.
- **Staff detail:** 3-column layout at `lg` — working-hours editor spans 2, a right rail holds Commission and Assigned services.
  - **Working hours:** one row per weekday (Mon-first display order, `dayOfWeek` 0–6 under the hood). Each row = weekday label (10ch) + "Day off" checkbox + two `time` inputs (disabled when day-off). Local state; a single "Save" button bottom-right persists `workingHours` + `commissionRate` via PATCH. All controls disabled without `staff:manage`.
  - **Commission:** integer percent input + `%` suffix; stored as 0..1 ratio.
  - **Services:** read-only `Badge` chips resolved to service names.
- **Roster:** week grid — staff rows × 7 day columns, each cell shows `HH:mm–HH:mm` or "Day off" (muted). Own `overflow-x-auto`, `min-width: 720px`. Read-only in Phase 2 (note under the table).
- **Time-off:** bordered table — Name · Dates · Reason · Status badge (`warning`/`success`/`danger`) · Approve (✓ `--color-success`) / Reject (✕ `--color-destructive`) icon buttons, shown only for `PENDING` rows and only with `staff:manage`.
