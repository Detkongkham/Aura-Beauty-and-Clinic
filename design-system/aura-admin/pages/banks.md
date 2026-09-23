# Page override — Banks & Channels (`/payments/banks`)

> Overrides `../MASTER.md`. Rebuilt 2026-09-21 as a treasury command center (ui-ux-pro-max
> "Financial Dashboard" style: currency formatting, period comparison, variance colouring,
> sparklines — applied on the house Soft-UI tokens, not the skill's raw palette).

## Layout contract (top → bottom)

1. **Command bar** (`StickyPageHeader`) — title · period segmented `7 / 30 / 90 days` · `Add account`.
2. **Band 1** (`TreasuryHero.tsx`, 3 : 2) — `InflowCard`: period total at `text-3xl`, delta vs the
   previous equal window, today / avg / paid out / net figures, split-by-account `SegmentBar`
   (top 4 + other), daily `DailyBars`, unassigned-transfer warning. `SetupHealthCard`: the
   8-point go-live checklist, failures first, each with its fix (add · show · channels · reconcile).
3. **Stat rail** — 6 `StatTile`s (2 → 3 → 6 at `2xl`; 6-up truncates labels beside the sidebar).
   `Need attention` is the only filter tile (`aria-pressed`).
4. **Receiving accounts** — `cards` (default, grouped by branch for SUPER_ADMIN) or `table`
   (`DataTable compact`). Uncovered branches collapse into ONE dashed panel of branch chips —
   never one tile per branch (10 tiles drowned the real accounts).
5. **Channels + slip policy** — `ProviderCard` (health pill + tone stripe) · `SlipSettingsCard`
   (numbered 3-check list, auto-confirm, tolerance, link to the review queue).
6. **Account drawer** (`BankAccountSheet`, 600px, `?a=<id>`) — payer-view card + QR, money grid,
   daily bars, reconciliation / slip / QR-intent standing rows with deep links, actions footer.

## Rules

- **All page state is in the URL**: `days, branch, status, view, flag (attention|noQr), q, a`.
- **Account numbers are masked in lists**; the eye toggle reveals grouped-by-4, copy copies raw.
  Only the drawer shows the full number (it is the "what the payer sees" card).
- **Health is words + dot, never colour alone** (`TonePill`). Severity: variance (critical) >
  unreconciled > open slips > no QR (attention) > dormant (info only, ≥30-day window).
- **Card = one hit target.** The full-card overlay `<button>` opens the drawer; content layers are
  `pointer-events-none` and only real controls (reveal, copy, QR, ⋯ menu) opt back in. Without
  this, clicks on the card body silently did nothing.
- **Payer card text sits on `--primary-strong`**; the bank hue only tints the far corner
  (white on gold/teal fails AA).
- **Soft-accent pills need `dark:bg-accent/15 dark:text-accent`** — the global
  `--accent-soft`/`--accent-foreground` pair is ~1.3:1 in dark mode (open system issue).
- Delta with no previous-period money prints "New" / "No earlier period to compare", never +∞%.
- Totals sum all currencies at face value; the band says so when a non-LAK account exists.

## Data

`GET /payments-treasury/bank-accounts/insights?days=7|30|90&branchId=` (ops service) — per
account: today / period / previous-period inflow, paid-out, daily series, last-in, open slips,
pending QR intents, last statement date, unreconciled + variance days; plus totals and
`unassigned` (bank tenders with no `bankAccountId`). Same reconciliation rule as `/reconciliation`.

## Payee change control (added 2026-09-21)

- **Payee details** = new account, account name / number / currency, QR image. Changing any of them
  needs the actor's password (`currentPassword`; server answers 403 `REAUTH_REQUIRED` /
  `REAUTH_FAILED`). The password field (`ReauthField`) appears only when a payee field actually changed.
- **BRANCH_ADMIN → approval.** The server answers **202** with a `BankAccountChangeView`; nothing
  changes until a SUPER_ADMIN approves (password again) in `BankChangesPanel`. One pending request
  per account. Approving a request whose account changed since it was filed → 409 (stale guard).
- **SUPER_ADMIN → immediate**, recorded as an APPROVED request and notified to other admins.
- Default / active / QR removal are not payee changes (no password, no approval).
- The approval queue sits between band 1 and the stat rail; it shows **full numbers** (the owner must
  verify them) with old → new, QR before/after thumbnails, and the same diff inside the approve dialog.
- Cards carry a `Change pending` pill; the drawer shows the pending notice + the change history.
- **Unassigned transfers**: the inflow warning opens `UnassignedTransfersSheet` (suggestion
  preselected, never auto-applied; server allows null → account once).
- **Slip review** requires a receiving account (picker in `SlipDetail`; auto when the branch has one).
