# Page override — Branches / Locations (`/branches`, `/branches/closures`)

> Overrides `../MASTER.md`. Rebuilt 2026-09-25 as a **branch-network command center** on the /payments/banks template.

- **Data:** `GET /branches` (identity) + `GET /branches/insights?days=7|30|90` (SUPER_ADMIN all, BRANCH_ADMIN own branch only; STAFF never calls it — page degrades to identity-only). Revenue = COMPLETED appointment totals by Vientiane start day (same as dashboard). Utilisation = booked non-cancelled minutes ÷ (staff × open minutes × days).
- **URL state:** `days`, `view` (map = default, cards, compare — user asked 2026-09-25 that the map stay the landing view), `status` (all|open|closed|attention), `sort`, `q`, `b` (open branch). Every state is linkable.
- **Band 1:** `NetworkHeroCard` (3/5 — period revenue + delta, today live figures, split-by-branch SegmentBar, DailyBars) + `AttentionCard` (2/5 — all issues, most severe first; the same issue at >1 branch collapses into one expandable line with branch chips).
- **Band 2:** six `StatTile`s (payroll.parts) — open now, province coverage, staff, utilisation, rating (review-weighted), bookings (+delta).
- **Toolbar:** view Segmented · status Segmented with counts · search · sort (cards only) · live count.
- **Map (default view):** the original 3-column layout — `BranchListPanel` | `LaoProvinceMap` card | inline `BranchDetailPanel`. A larger zoom/pan map (BranchNetworkMap) was tried 2026-09-25 and the user chose to keep this original one — don't replace it without asking. Cards/compare views open detail in the Sheet.
- **Views:** `BranchCard` grid (monogram, OpenPill, health pill, revenue + sparkline, today/bookings/rating trio, UtilMeter, resources, top issue footer) · map (existing list + LaoProvinceMap + inline detail) · `BranchCompareTable` (rank, sortable metric headers with `aria-sort`, own horizontal scroll).
- **Detail:** one `BranchDetailBody` rendered inline (map view) or in a right `Sheet` (cards/compare): opening-window progress, today, period + DailyBars, attention, resources, **quick jumps** (sets global branch scope via `useUiStore.setActiveBranch` then navigates to appointments/queue/inventory/staff), setup checklist (8 checks), amenities, upcoming closures (60d, incl. company-wide), contact + QR.
- **Issues** (`branches.lib.ts branchIssues`): danger = closed-with-bookings, open-with-no-staff, no services; warning = queue ≥5, unpaid bills, low stock, loss ≥20% (≥5 bookings), rating <4 (≥3 reviews); info = no pin, no phone, closure ≤14d.
- **Form:** + email, + amenities toggle grid (`wifi|parking|drink|lounge|kids|card`, shown on mobile service detail). Turning an open branch off with upcoming bookings shows a warning and needs a second "Close anyway" click → `force: true` (server returns 409 otherwise).
- **Scope (server):** BRANCH_ADMIN may PATCH only own branch; closures only for own branch (not company-wide), delete only own.
- **Type:** Lao names never in `font-mono` — codes only. No `dark:` literals; project tokens carry dark mode.
