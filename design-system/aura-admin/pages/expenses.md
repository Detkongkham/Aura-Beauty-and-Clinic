# Page override — Expenses (`/payments/expenses`)

> Overrides `../MASTER.md` for the expense workflow + spend analysis page. Rebuilt 2026-09-21 as a
> command center on the same skeleton as `/staff/payroll`, `/appointments` and `/queue`.

## Layout contract

1. **Command bar** (`ExpensesCommandBar`, sticky, 3 rows) — identity + `Export` / `Recurring & categories` / `New expense (N)`;
   period preset switch (this month · last month · 30d · 90d · YTD) + exact dates · branch (SUPER_ADMIN only) ·
   view switch (list · board · insights) · search (`/`) · category · sort; status tabs **with counts** +
   attention flags (missing receipt · created by me · recurring) + removable chips.
2. **Spend band** (`SpendHero`) — recognised spend at `text-3xl`, delta vs the comparable previous period
   (same days of last month when the range is month-to-date, else the same-length window before), status
   composition bar (paid · approved-unpaid · awaiting approval · draft), daily sparkline, and a **Needs
   attention** panel whose three rows (awaiting approval + oldest age, approved-unpaid, missing receipts)
   are one-click filters.
3. **Tile rail** — 6 `StatTile`s (recognised items · avg/day · top category · largest · fixed/recurring · with the author).
   Top category, fixed and drafts tiles are filter toggles (`aria-pressed`); largest opens that expense.
4. **One view** — `list` (DataTable, selection + bulk bar) · `board` (4 workflow lanes) · `insights` (charts).
5. **Drawer** (`ExpenseSheet`, 580px) — never navigates away; deep-linkable via `?id=`.

## Rules specific to this page

- **All state is URL-backed** (`from,to,branch,status,cat,flag,view,sort,q,page,size,id`). Defaults are omitted
  from the URL so a clean link means "this month, everything".
- **Next action is always one click.** Each row/card shows only the transition this user may make now
  (submit · approve · mark paid); own claims render the approve button disabled with the reason as its label
  (separation of duties — the API enforces it too).
- **Bulk goes through `POST /expenses/bulk`**, which runs every id through the single-item service
  functions — never a shortcut around the rules. Partial failure is reported, not fatal. Multi-approve confirms
  with count + total; paying a selection that spans branches/currencies only offers cash.
- **Money is never colour-only.** Status = dot + word; deltas carry a sign; chart series carry a numeric legend.
  Foreign-currency rows show their code, and the spend band warns when totals mix currencies at face value.
- **Category identity is stable**: `categoryColor()` keys the hue to the category's position in the master list,
  not its rank, and `CategoryGlyph` gives each seeded code its own icon. Same colour + icon in form, list, board,
  drawer and charts.
- **Receipts are first-class.** The form stages files before the first save; the drawer accepts drag-and-drop
  until the expense is PAID; any submitted/approved/paid expense with no receipt is flagged (row marker, drawer
  callout, hero queue, `flag=missingReceipt`).
- **Create is idempotent** — the form holds one `Idempotency-Key` per dialog session, so "Save & submit" can be
  retried after a failed submit without filing a duplicate.
- **LAK is the unit of every total** (`amountBase`); a THB/USD row shows its native amount plus `≈ ₭…`, and
  the drawer states the booked rate. Never sum native `amount` across currencies.
- **Money owed has a date.** Due chips (≤ 7 days / overdue) sit under the status pill; overdue is red with the
  day count in words.
- **Limits are explained, not hidden.** An over-limit claim keeps its approve button, disabled, with
  "needs the owner" as its label; the drawer explains why.
- **Cash has a ledger.** Petty-cash balances are only ever the sum of their entries; a box that can't cover
  an expense is shown disabled with its balance, never silently overdrawn.
- **OCR suggests, people decide.** Receipt reading fills nothing until "Use these values" is pressed, and
  fields it could not read say so.
- **Void, don't delete** approved/paid money: VOIDED rows stay listed, struck through, out of every total.

## Charts (Recharts, `chartTheme.ts` tokens only)

| Need | Chart | Note |
|------|-------|------|
| Spend over the period | Composed: cumulative area (default) or daily bars, previous period as dashed line | weekly buckets past 62 days; legend states both totals, avg/day, peak |
| Category mix | Donut (total in the ring) + ranked list | list rows are the filter; non-OPERATING kinds get a tag with the P&L rule as tooltip |
| P&L | Revenue as a 100% track, each cost a segment | every line shows % of revenue; stock purchases shown as a memo, not deducted |
| Budget vs actual | Bullet bars, track = 125% of budget, tick at 100% | sorted worst-first; overspend line in words |
| Branch / supplier / largest | Ranked bars | proportional to the leader, value printed on every row |
