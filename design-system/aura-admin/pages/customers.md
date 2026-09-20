# Page override — Customers (`/customers`, `/customers/:id`)

> Overrides `../MASTER.md` for the CRM screens.

- **List:** `DataTable` — Name (name + phone stacked) · Tier (`Badge`: SILVER neutral / GOLD accent / PLATINUM info, `–` when none) · Visits (right, tabular) · Total spent (right, `CurrencyText`) · Last visit (`DateTimeText` date). Search (name / phone) + Tier `Select`. Row click → profile. Sort default: last visit desc.
- **Profile:** back link → list. 3-col at `lg` — a Profile card (email, visits, total spent, points, last visit, customer-since as label/value rows) + a Visit history card spanning 2 (divided list: service / staff · datetime / price / `StatusPill`).
- **Notes:** full-width card below with a `Textarea` (disabled without `customers:manage`) + a right-aligned Save button that PATCHes `{ notes }` and toasts. Notes are the only editable field in Phase 2.
- **Loyalty** points/tier are read-only (earned by the Phase 5 ledger).
