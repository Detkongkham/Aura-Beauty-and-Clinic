# Page override — Reports hub (`/reports`, `/reports/import-export`)

> Overrides `../MASTER.md`. `/reports` is a ledger/statement-style report hub fed by dashboard stats + the end-of-day endpoint.

- **Identity:** print-ready documents, not dashboards. Own `ReportSection` / `LedgerTable` components — hairline rules, right-aligned `tabular-nums`, a masthead (business name + report title + date range + branch), muted column heads, totals row in `--color-foreground` medium. No cards, no shadows, no chart chrome beyond one restrained figure per report.
- **Overview tab:** KPI figures pulled straight from `GET /dashboard/stats` (14-day window unless a metric says "today"); a custom report can regroup the same rows by a chosen dimension (`by service` / `by staff` / `by branch` / `by day`).
- **End-of-day tab (`StandardReportsTab`):** a catalogue on the left (grouped, arrow-key navigable `radiogroup` of report ids), the selected report rendered on the right. `end-of-day` takes a `DateField` + branch `Select` → `GET /reports/end-of-day?date=&branchId=` → totals `StatCard`s (bookings / completed / cancelled / walk-ins / revenue / deposits) + a top-5 services `LedgerTable`.
- **Import/Export (`ImportExportPage`):** client-side CSV export of customers; paste-CSV import with a 3-stage flow — parse → mapped preview (`LedgerTable` with per-row status chip: new / duplicate / error) → create via `POST /customers` per row. Duplicate policy is a segmented control (skip / import anyway). Error rows are never sent; a "download errors" link re-exports just those.
- **Colour:** greyscale document body; `--color-primary` only on action buttons; row status chips use `--color-success` (new) / `--color-muted-foreground` (duplicate) / `--color-destructive` (error).
- **Print:** `@media print` hides the catalogue + toolbar, expands the document to full width.
