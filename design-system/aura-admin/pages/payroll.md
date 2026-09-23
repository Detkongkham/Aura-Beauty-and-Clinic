# Page override — Payroll & Staff KPI (`/staff/payroll`)

> Overrides `../MASTER.md` for the monthly pay run. Rebuilt 2026-09-20 as a command center,
> on the same skeleton as `/appointments` and `/queue`.

## Layout contract

Five bands, top to bottom, in the order an owner asks the questions:

1. **Command bar** (`StickyPageHeader`, 3 rows) — identity + `Recompute` / `Export CSV`; then
   period stepper · branch scope · view switcher · search · sort; then attention chips +
   removable filter chips. Every control that narrows the page lives here and nowhere else.
2. **Pay-run band** (`PayRunCard`) — the month's total payable at `text-3xl`, its MoM delta, a
   3-segment composition bar (paid out · commission due · bonus due) with a numeric legend, the
   labour-cost ratio, a daily-revenue sparkline, and the settle panel (outstanding figure +
   settled %, month-elapsed % while the month is open, and the one `Settle all` action).
3. **Stat rail** — 6 `StatTile`s (`payroll.parts.tsx`), 2 cols at `sm` → 6 at `xl`. Three of them
   (`Commission unpaid`, `Bonus due`, `Targets met`) are filter toggles and carry `aria-pressed`.
4. **One view** — `roster` (table) · `leaderboard` (podium + ranked rows) · `insights` (charts).
5. **Payslip drawer** (`Sheet`, `max-width: 640px`) — opening a person never navigates away.

## Rules specific to this page

- **Period is a stepper, not a select.** `◀ September 2026 ▶`; the label is a transparent native
  `<select>` overlay for a direct jump to any of the last 24 months. Forward is disabled at the
  current Vientiane month. The month never round-trips through a local `Date` — see
  `payroll.lib.ts`; a `YYYY-MM` string is the only representation.
- **All page state is URL-backed** (`month`, `branch`, `view`, `sort`, `flags`, `page`, `size`,
  `q`, `id`), so a filtered month is shareable and survives a reload.
- **Money never relies on colour.** Every payout state is a `PayoutStatePill` (dot + word);
  every delta pairs an arrow glyph with its sign; chart series carry direct labels or a numeric
  legend. A `null` delta prints "no baseline", never "+∞%" or a fabricated 100%.
- **Attainment uses a bullet meter, not a gauge** (`AttainmentMeter`) — several KPIs sit side by
  side, so the bullet form wins. Over-attainment renders as a lighter surplus segment past the
  100% tick rather than overflowing; while the month is open a hairline marks the straight-line
  pace for the days elapsed, and the row says "On pace" / "Behind pace" in words.
- **An unfinished month must say so.** `isCurrentMonth` drives the `Day 20 of 30` chip and the
  month-elapsed bar; figures for an open month are explicitly provisional.
- **Destructive-ish money moves confirm.** Paying commission (single or bulk) goes through
  `useConfirm` with the name, the amount and the month spelled out. Bonus marking does not —
  it is reversible in the same session and per-person.
- **Bulk before repetition.** The roster has selection on with a bulk bar (settle · mark bonus)
  showing the selected outstanding total; the pay-run band carries the whole-month equivalent.
- **Table density:** `compact`, right-aligned `tabular-nums` for every money and count column.
  Row click opens the drawer; row-level buttons collapse to icon-only below `xl`.

## Charts (Recharts, `chartTheme.ts` tokens only)

| Need | Chart | Note |
|------|-------|------|
| Revenue across the month | Area, `--chart-1`, gradient 28%→0 | x = day, y = ₭ abbreviated; tooltip adds the job count |
| Revenue by staff | Horizontal bar, top 10 | green = cleared target; dashed `ReferenceLine` per individual target |
| Payroll composition | Donut (≤4 slices) | legend spells out every figure; labour-cost ratio as the closing row |
| Attainment spread | 4-band meter grid | counts + % per band, never a mean |

Sparklines inside cells and the drawer are hand-rolled SVG (`Sparkline`), not Recharts — a
30-point decoration must not pull the chart bundle into a drawer.
