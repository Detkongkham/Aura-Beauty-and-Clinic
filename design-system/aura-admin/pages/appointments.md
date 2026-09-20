# Page override — Appointments (`/appointments`, `/appointments/:id`)

> Overrides `../MASTER.md` for the appointments console.
> Rewritten 2026-09-20 (Wave 11). The previous spec — a plain `DataTable` with four
> filters and a row-click route change — is superseded in full.

## Model

`/appointments` is a **booking command center**, not a list page. Three bands, always in this order:

1. **Command bar** (`StickyPageHeader`) — everything that *narrows* the page.
2. **Overview** — what the current filter set *is*, entirely from the server.
3. **One view** of that set: Table · Board · Timeline · Insights.

A record opens in a right **sheet**, never a route change: the filters, page and
scroll position are the desk's working context and must survive reading a booking.

## State lives in the URL

Every filter, the view, the sort, the page and the open record are query params
(`view`, `range`, `from`, `to`, `q`, `status`, `flag`, `branchId`, `staffId`,
`serviceId`, `payment`, `source`, `deliveryType`, `sort`, `order`, `page`,
`size`, `id`). A filtered view is therefore shareable and survives a reload.
Only row density is `localStorage` (per viewer, not per link).

## Command bar

- Row 1: `h1` + match count; actions **Refresh · Export CSV · Calendar · New walk-in**
  (walk-in reuses `features/queue/WalkInSheet`).
- Row 2: view segmented control (hotkeys `1`–`4`) · search (`/` focuses, debounced
  300ms) · date-range segmented rail (Today / Tomorrow / 7d / 30d / This month /
  Past 7d / All / Custom) · **Filters** disclosure with a count badge · density toggle.
- Row 3: removable chips for every active filter, plus "clear filters".
- The advanced drawer is a **disclosure, not a modal** — `Esc` closes it, the page
  stays interactive behind it.

## Overview band

Fed **only** by `GET /appointments/summary`, which rolls up the whole filtered
set server-side. Never re-derive these numbers from the visible rows.

- **Pipeline rail** — All + 6 statuses, each cell a filter toggle (`aria-pressed`),
  over one distribution bar, then a metric line (completion / no-show / cancel
  rate, walk-ins, home service, avg duration).
- **Needs action** — five tiles, each a 1:1 mapping to a server `flag`:
  `overdue` · `unconfirmed` · `needsDeposit` · `conflict` · `unrated`. Attention sits
  **above** money: the desk acts on the first row and reports on the second.
- **Horizon** — Today · Tomorrow · Collection rate.
- **Money strip** — expected / realized / outstanding / deposits / lost / avg ticket.
- If the summary was capped (`truncated`), say so inline with an amber chip. Never
  present a capped figure as exact.

## Views

| View | What it is for | Notes |
|------|----------------|-------|
| **Table** | Working a list | Selection → bulk status bar; per-row status menu; page totals footer. Sort is a control **above** the table, not on the headers — paging is server-side and a header that sorted one page would lie. |
| **Board** | Seeing the pipeline | One lane per status; lane header states "showing N of total" and filters on click. |
| **Timeline** | Working a day | Grouped by Vientiane day. Two layouts: **by time** (one column, "now" line) and **by staff** (per-person lanes with booked hours), toggled top-right and remembered per viewer. Not a second calendar grid — `/calendar` owns that. |
| **Insights** | Explaining the set | Trend area chart, hour-of-day histogram, ranked staff / service / branch lists that double as filters. |

Board and Timeline render one server page, so they carry the same pager as Table.

## Row vocabulary

- **Attention flags** (`flagsOf`) mirror the server flag rules exactly, so a row's
  badge and the KPI count can never disagree: double-booked · overdue · needsDeposit ·
  unconfirmed · starting-soon. `conflict` is the one flag the browser cannot derive —
  it arrives as `hasConflict` on the row, because a clash may live on a page the
  browser never fetched.
- **Channel chips**: source (Online / Walk-in / Staff) · Home service · notes marker.
- **Payment**: paid / partial / unpaid pill + `deposit · balance` line; a deposit-policy
  breach adds a warning triangle.
- CANCELLED / NO_SHOW dim and strike their price.
- Status is never colour-only — `StatusPill` keeps its leading dot, flags carry an icon
  *and* a label, ratings render filled stars plus an `sr-only` value.

## Status changes

- Transitions are constrained by `NEXT_STATUS`; terminal states are dead ends.
- `CANCELLED` / `NO_SHOW` always go through a named confirm dialog, single **and** bulk.
- Bulk runs through `POST /appointments/bulk-status`, which reports per-id failures;
  a partial result is an error toast naming both counts, never a silent success.

## Creating and moving bookings

- **New booking** and **Reschedule** share one `BookingSheet`: same decision, different
  pre-filled fields. Times are **never** free text — always picked from
  `GET /booking/availability`, so the desk cannot invent a slot the engine would refuse.
- Reschedule goes to `PATCH /appointments/:id/reschedule` (admin-scoped: no ownership
  check, no customer cancellation window, status preserved).
- `force` is offered **only after** the server has returned 409. Overriding a clash is a
  second deliberate click, never a checkbox nobody reads.
- Walk-ins keep their own fast path (the queue's `WalkInSheet`).

## Clashes

- `hasConflict` on list rows, `ops.conflicts` in the summary, `conflicts[]` on the detail
  (naming the other booking and which resource collides: staff / room / equipment).
- The overlap rule is copied word-for-word from booking's `assertSlotFree`, so the console
  never reports something different from what the booking engine enforces.

## Timeline (audit)

Built from real `AuditLog` rows (module 37): who acted, when, and what changed. Rows that
predate audit logging fall back to one derived `BOOKED` entry marked `audited: false`, and
the UI dims it and says so — it never presents a guess as history.

## Detail sheet

560px right sheet: identity → when (with "starts in / started ago") → money triple →
facts grid → notes → review → timeline. Footer: "Open full page" on the left, the
allowed transitions on the right. `/appointments/:id` remains the full page and keeps
the chat thread.

## Backend contract this page owns

- `GET /appointments` — adds `statuses`, `serviceId`, `customerId`, `deliveryType`,
  `source`, `payment`, `flag`, `sort`, `order`; `q` also matches the synthesized code.
- `GET /appointments/summary` — the rollups above, capped at 5,000 rows with `truncated`.
- `POST /appointments/bulk-status`.
- `PATCH /appointments/:id/reschedule` (admin, supports `force`).
- `POST /booking/appointments` + `GET /booking/availability` for creating on behalf.
- List rows carry `source`, `durationMin`, `updatedAt`, `paymentStatus`, `paidAt`,
  `paymentMethods`, `depositRequired`, `rating`, `hasCustomerNotes`, `hasStaffNotes`,
  `roomName`, `travelFee`, `hasConflict` — so the page never joins `/services` client-side again.

## Raw SQL note

Every `Date` bound into a raw query **must** go through `tsParam()`. Prisma binds a JS
`Date` as `timestamptz`; our datetime columns are `timestamp without time zone`, so with a
non-UTC session a plain binding lands hours off and silently matches the wrong rows.
`config/database.ts` now also pins every session to UTC, and
`tests/unit/raw-sql-date-params.test.ts` fails the build if a bare date is ever bound again.
