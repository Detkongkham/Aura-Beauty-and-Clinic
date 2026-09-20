# Page override — Audit log (`/settings/audit`)

> Overrides `../MASTER.md` for the read-only activity feed. `SUPER_ADMIN` / `BRANCH_ADMIN`.

- **Layout:** `SettingsTabs` header, then an overview band of 3 plain stat tiles (total events · today · critical) fed by the response `facets`, then a filter bar (search + category `Select` from `facets.categories` + actor `Select` from `facets.actors` + a date-range segmented control `24h / 7d / 30d / custom`), then a paginated `LedgerTable`.
- **Row:** relative time (with absolute in `title`), actor + role, an `action` mono token, target, branch, IP. Severity is a 1.5px left spine on the row — `--color-muted-foreground` (info) / `--color-warning` (warning) / `--color-destructive` (critical) — never a full-row tint. Category is a small dot+label, not a filled badge.
- **Detail:** row click opens a right `Sheet` — the full event, plus a `changes` table (field / before / after) when the entry carries a diff; `before` muted with strike affordance, `after` in `--color-foreground`.
- **Export:** "Export CSV" re-requests `page=1&pageSize=5000` with the active filters and builds the file client-side (when / actor / action / target / branch / IP).
- **Empty / no-data:** the feed is genuinely empty until write-paths start emitting `AuditLog` rows — show `EmptyState` ("No activity yet"), not a skeleton, when `total === 0`.
- **A11y:** the date-range control is a `radiogroup`; severity is conveyed by the category/severity text label, not colour alone.
