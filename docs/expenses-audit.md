# Expenses — audit & roadmap (2026-09-21)

Written alongside the `/payments/expenses` redesign. Section 1 is what shipped; section 2 is what the
system still lacks, ordered by how much money or risk each gap represents.

## 1. Shipped in this pass

**Bugs fixed**
- **"New expense" always failed (400).** `POST /expenses` requires `Idempotency-Key`; the web client never sent
  one. The form now sends one key per dialog session.
- **CSV export only exported the visible page** (20 rows). It now walks every page of the current filter
  (cap 5,000, with a notice when truncated) and carries 17 columns instead of 7.
- **Filters were lost on reload** — all page state is now in the URL (and `?id=` deep-links an expense).
- Emoji used as an icon in the list (`📎`) replaced with a real icon + screen-reader text.

**Backend (additive, no migration)**
- `GET /expenses/summary` + `byDay`, `previous{from,to,recognisedTotal,count,byDay}` (comparable window),
  `byCurrency`, `missingReceipts`, `oldestPendingAt`, `recurring`, `topSuppliers`, `largest`; rejects `from > to`.
- `GET /expenses` + `flag=missingReceipt|mine|recurring`, `sort=newest|oldest|amountDesc|amountAsc`; search also
  matches category names, creator and payment reference.
- `POST /expenses/bulk` `{action: submit|approve|pay, ids[≤100], paidFromAccountId?, paidReference?}` —
  per-action permission, Idempotency-Key, each id through the single-item function; returns `{succeeded, failed}`.
- `RecurringExpenseView.nextDueDate`.
- Tests: `tests/integration/expenses.test.ts` 14 → 19.

**Frontend** — command bar, spend band, tile rail, list/board/insights views, drawer with workflow stepper and
drag-and-drop receipts, amount-first form with supplier/PO picker + staged receipts + "Save & submit",
duplicate, reject-reason presets, bulk submit/approve/pay, pay dialog with account cards, recurring-rule inline
edit + monthly fixed total, category kind on create. See `design-system/aura-admin/pages/expenses.md`.

## 2. Second pass (2026-09-21) — E1, E2, E3, E4, E5, E8, E11, E12 shipped

Migration `20260921020000_expenses_fx_budget_void_due` (applied to `abcp` + `abcp_test`).

| # | What shipped |
|---|--------------|
| E1 | `Expense.fxRate` + `amountBase` (LAK) snapshotted on create/edit (user rate, else `ExchangeRate` X→LAK; missing rate = 400). Summary, P&L, dashboard `period.expenses`, recurring job all aggregate `amountBase`. Backfill converted existing rows. Rates editable under *Rules* (`GET/PUT /expenses/settings`). |
| E2 | `ExpenseBudget(branch, category, month)`; `GET/PUT /expenses/budgets`; summary `budget{months,total,byCategory[budget,actual]}`. UI: *Budgets* tab (month stepper, last-month/actual columns, "fill from last month"), hero budget bar, insights *Budget vs actual* bullet card. |
| E3 | `AppSetting expenses.approvalLimit` (LAK). Over the limit only SUPER_ADMIN may approve (API 403); `ExpenseView.needsOwnerApproval`; buttons locked with the reason; bulk approve skips them. |
| E4 | `notifyUser` on SUBMIT (branch approvers, or owners only when over limit), APPROVE / REJECT / VOID (author). Types `EXPENSE_*` map to the *payments* module; bell/inbox deep-links to `/payments/expenses?id=`. Failures are logged, never block the workflow. |
| E5 | Status `VOIDED` + `voidedAt/voidedById/voidReason`; `POST /expenses/:id/void` (approve perm, Idempotency-Key, APPROVED/PAID only). Excluded from every total; drawer shows the reason. |
| E8 | `dueDate`, `invoiceNumber`, `taxAmount` (VAT, ≤ amount); `isOverdue`; `flag=overdue`; summary `overdue` + `dueSoon` (7 days, not bound to the period). Due chips in list/board, overdue callout, hero queue row. |
| E11 | `GET /expenses/:id/history` from AuditLog with field-level diffs; timeline in the drawer. |
| E12 | `GET /expenses/status-counts` with the list filters; status tabs use it. |

Tests: backend `expenses.test.ts` 19 → 27; web-admin expenses page 10 → 15.

## 3. Third pass (2026-09-21) — E6, E7, E9, E10 shipped

Migration `20260921160000_expenses_cash_funds_allocations`. Decisions taken without a product brief are marked **(default)** — change them if they don't fit.

| # | What shipped |
|---|--------------|
| E6 | The reconciliation module (other session, `bank_statement_lines.matchedExpenseId`) already matched DEBIT lines to paid expenses. Expense side added: `ExpenseView.bankMatch`, summary `bankPaid{count,amount,matched}`, drawer "Matched dd/mm (auto)" / "Not on a statement yet". Voiding a matched expense returns the line to UNMATCHED; voiding a bank-paid expense in a **closed reconciliation month** is refused (409). |
| E7 | `POST /expenses/receipt-scan` (image only) — same sharp → tesseract pipeline as slips; `receipt.ts` parser reads total (never subtotal/VAT), VAT, date (no future/impossible dates), invoice no., vendor, currency; returns null rather than guessing. Also reports if the same receipt is already attached elsewhere. Form reads the first photo and offers "Use these values" — **never auto-fills or auto-saves**. PDFs are not read. |
| E9 | `CashFund` per branch (+currency) with a ledger `CashFundEntry` (TOPUP / WITHDRAW / EXPENSE / REVERSAL / COUNT). Balance = Σ ledger, never typed. Paying from a box locks the box row and **refuses if the balance is short (default)**; voiding a box-paid expense posts a REVERSAL. A count posts the difference. Optional float (imprest) target drives "top up X". Create/top-up/withdraw/count = `expenses:approve`. UI: *Petty cash* tab, box cards in the pay dialog. |
| E10 | `ExpenseAllocation(expense, branch, percent, amountBase)`. **Only SUPER_ADMIN can split (default)**; shares must total 100%; last line takes the rounding. Branch views (summary, P&L, budgets, dashboard) count each branch's share; all-branch totals are unchanged and `byBranch` is split. Workflow (approval, payment, receipts) stays with the paying branch. |

Tests: backend `expenses.test.ts` 27 → 31 + `tests/unit/expenses.receipt.test.ts` (6); web-admin expenses page 15 → 18.

## 4. Still open / follow-ups

| Item | Note |
|------|------|
| PDF receipts in OCR | Needs PDF → image rendering (pdfjs/poppler) on the server. |
| Receipt OCR accuracy | Tuned on synthetic receipts only — collect 20–30 real Lao/Thai receipts and add fixtures. |
| Petty-cash top-up from a bank account | A top-up is recorded on the box only; it is not yet booked as a DEBIT on a bank account for reconciliation. |
| Allocation templates | Shared costs are split per expense; recurring rules can't carry a split yet. |
| Server-side FX feed | Booking rates are set by the owner; no automatic daily rate job. |
