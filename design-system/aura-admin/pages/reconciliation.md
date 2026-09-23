# Page override — Bank reconciliation (`/payments/reconciliation`)

> Overrides `../MASTER.md`. Rebuilt 2026-09-21 as a command center on the same skeleton as
> `/staff/payroll`, `/appointments` and `/queue`. Code: `apps/web-admin/src/features/payments-treasury/Recon*.tsx`,
> `reconciliation.lib.ts`, `recon.parts.tsx`.

## Layout contract (top → bottom)

1. **Command bar** (`ReconCommandBar`, sticky, 3 rows): title + range caption + `Export CSV` / `Next missing
   statement`; period presets · ◀ from–to ▶ stepper (slides by the window length, never past today, clamped
   to 62 days) · branch (SUPER_ADMIN) · account; status chips with live counts + removable filter chips +
   view switch (`ledger` · `calendar` · `accounts`).
2. **Health band** (`ReconHealthCard`): `checked / total` account-days at `text-3xl`, an "N% tie out" chip
   (matched ÷ days with a statement, never ÷ all days), a 3-part status bar, money in / money out as
   system · statement · signed difference, a one-bar-per-day strip (height = money in, colour = worst status
   that day). Right panel: **still to explain** (Σ|variance|), the largest difference, and the oldest day
   without a statement, each one click from its drawer.
3. **Stat rail**: 6 `StatTile`s. Difference / Missing / Matched toggle the status filter (`aria-pressed`);
   Accounts switches the view.
4. **Likely causes** (`ReconCausesPanel`): open slips + unbooked webhook events. Hidden when empty.
5. **One view**: ledger table (compact, footer totals for the filtered rows) · account × day matrix ·
   account cards sorted worst-first.
6. **Day drawer** (`ReconDaySheet`, `Sheet` 680px): comparison table, statement entry, diagnosis hint,
   the credit/debit lines behind each total, the day's slips, audit line, ◀ ▶ day navigation.

## Rules specific to this page

- **All state is in the URL**: `from`, `to`, `branch`, `account`, `status`, `view`, `day=<YYYY-MM-DD>|<accountId>`.
  An open drawer is a shareable link.
- **Never pre-fill the statement with system totals.** Inputs start empty (or with the saved statement);
  "Use system totals" is an explicit click. A pre-filled form invites rubber-stamping.
- **Live preview**: as the reconciler types, the comparison's statement column, the signed difference and a
  "Will be saved as" pill update before saving. A difference with no note shows a (non-blocking) prompt.
- **Money never relies on colour**: differences carry `+` / `−` (`+` = bank shows more); status is
  icon + word (`✓ Matched`, `≠ Difference`, `◌ No statement`); calendar cells print the glyph and have a
  spoken `aria-label` ("date · account · status · amount").
- **Empty days are still openable** by managers (calendar dashed cells): a quiet day can still carry a bank
  fee. The day endpoint returns an empty row, not 404.
- **Destructive = confirm**: removing a statement goes through `useConfirm` with account + date.
- Primitives are reused from payroll (`StatTile`, `SegmentBar`, `SegmentLegend`, `SectionCard`, `TONE`) —
  do not fork them.

## Backend contract (additive, no migration)

- `ReconciliationRow` + `enteredByName`, `enteredAt`.
- `ReconciliationView` + `accounts[]` (every account in scope, incl. idle ones, with `lastStatementDate` ever).
- `GET /payments-treasury/reconciliation/day?bankAccountId=&date=` → `{ row, credits[], debits[], slips[] }`
  (credits = SUCCESS BANK_TRANSFER/BANK_QR tenders with customer/service/ref/slip; debits = PAID expenses).

## System gaps — status (updated 2026-09-21)

All twelve gaps from the review were built the same day. Two migrations:
`20260921100000_reconciliation_gaps` and `20260921170000_cash_drawer_sessions`.
Backend code: `apps/backend/src/modules/payments-treasury/reconciliation/` and `…/cash-drawer/`.

| # | Gap | Shipped as | Still open |
|---|-----|------------|------------|
| G1 | Statement import + line matching | `POST …/reconciliation/imports` (dry-run preview → commit), CSV parser that detects English and Lao headers, dedupe by line hash, auto-matcher (amount + ref + ±1 day, refuses ties), manual match/unmatch/ignore, undo import. UI: `ReconImportDialog`, lines section in the drawer | Per-bank presets once real BCEL/LDB/JDB files exist; MT940 / bank API feed |
| G2 | Provider fee / net settlement | `PaymentProvider.settlesNet` (toggle on the provider card); row `systemFee` / `expectedCredit`; variance is computed against net | Fixed-fee channels (only `feeRate` %) |
| G3 | Variance resolution | Reason codes, note (required for OTHER), `RESOLVED` status, maker ≠ checker (SUPER_ADMIN exempt, flagged `selfApproved` in audit), bulk resolve, reopen; totals change → resolution cleared | — |
| G4 | Opening / closing balance | Inputs in the drawer, filled automatically from an imported balance column; `balanceGap` + `openingGap` (vs the previous closing) | — |
| G5 | Period close / lock | `ReconciliationPeriod` per branch+month; readiness checklist (missing / unexplained / unmatched lines / balance breaks); locks statements, resolutions, imports and matches; reopen = SUPER_ADMIN + audit | Lock does not yet block payments/expenses dated in a closed month (owned by other modules) |
| G6 | Multi-currency | `totalsByCurrency`; the page shows one currency at a time (`?cur=`) | FX-converted consolidated view |
| G7 | Refunds as money out | `Refund.bankAccountId/paidAt`; PAID refunds counted as debits and matchable | Refund API/UI itself (Module 39 backlog) |
| G8 | Timing (T+1) pairs | `findTimingPairs` → "Explain both as timing" in Likely causes | — |
| G9 | Reminders & alerts | `recon-reminder` BullMQ job 09:00 Asia/Vientiane; missing-yesterday + unexplained ≥ threshold; settings dialog (SUPER_ADMIN edits) | — |
| G10 | Cash drawer | `CashDrawerSession` + movements (DROP/PAYIN/PAYOUT), one open drawer per branch (partial unique index), banknote count close, note required on a difference. UI: `Cash drawer` view | Multiple tills per branch; posting a DROP as a bank deposit that auto-matches the bank line |
| G11 | Statement history | `GET …/statements/:id/history` → timeline in the drawer | — |
| G12 | `payments:reconcile` permission | New permission (migration grants it to every role that has `payments:manage`); required for resolve/import/match/close. Role matrix now shows non-standard actions (review / approve / reconcile) as chips — before this they could not be granted from the UI | — |
