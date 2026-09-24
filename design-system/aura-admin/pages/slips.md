# Page override — Slip review (`/payments/slips`)

> Overrides `../MASTER.md`. Rebuilt 2026-09-23 as a review command center on the same skeleton as
> `/payments/reconciliation` and `/payments/expenses`. Code: `apps/web-admin/src/features/payments-treasury/Slip*.tsx`,
> `slip.parts.tsx`, `slip.lib.ts`, `slipModel.ts`.

## Layout contract (top → bottom)

1. **Command bar** (`SlipsCommandBar`, sticky): title + **Live/Offline** pill (true socket state) · Focus toggle ·
   shortcuts (`?`) · bulk "Select N ready" / "Confirm N slips"; queue tabs **with counts** (to do · approved ·
   rejected · all) · search (`/`) · upload date preset · sort (work order · oldest · newest · largest) · branch
   (SUPER_ADMIN); **failed-check flags** (amount · receiving account · transfer time · no reference · couldn't read ·
   duplicate) as toggle chips + clear. On phones the selects and flags scroll sideways; the subtitle hides.
2. **Review health band** (`SlipHealthBand`, hidden by Focus, persisted `aura.slips.focus`):
   - *Waiting for review*: open count at `text-3xl`, ₭ worth, composition bar (needs review · ready · reading),
     oldest-waiting chip against the SLA.
   - *Needs attention*: over-SLA · couldn't read · duplicates to reject, each a one-click filter; top failed checks (7d).
   - *Confirmed today*: ₭ confirmed, confirmed/automatic/rejected/uploaded line, 7-day bars (uploaded vs confirmed),
     auto-match rate and median review time.
3. **Workspace** (xl: 400px queue + reading pane; below xl: list + 720px Sheet):
   - Queue grouped in work order (Needs review → Ready to confirm → Being read), sticky group headers; the Ready
     group has a select-all checkbox. Row = thumbnail · name (+ staff-upload glyph) · amount · bank/ref/branch ·
     four **check glyphs** · waiting chip (from half the SLA) · verdict pill.
   - Reading pane (`SlipDetail`): header (avatar, branch · uploaded · invoice no., wait chip, verdict, ◀ n/N ▶, ⋯ menu:
     open bill / appointment / image, copy ref, read again) → **status banner** (one sentence: what state, what's left)
     → image viewer (zoom, ctrl/⌘+wheel, double-click, rotate, drag-pan, open full) beside the **checks card**
     (score ring + amount 50 · account 30 · time 20 · reference gate) → expected-vs-read table with **inline correction**
     ("edited" tag per changed field) → **bill impact** (total · paid · owed · deposit, and "confirming X: the bill will be
     fully paid / N still owed / over by N") → receiving account → note → other slips on the bill → OCR raw text + QR →
     history timeline. Sticky action bar: Reject (R) · Confirm payment · ₭amount (A).

## Rules specific to this page

- **All state is in the URL**: `view, flag, range, sort, q, branch, s`. Defaults are omitted. An open slip is a link.
- **Counts come from `/slips/summary`**, never from the 100 rows the queue holds. The active tab shows its filtered total.
- **Never colour alone**: checks are icon + word ("Doesn't match"), mismatched rows carry an icon + sr-only word,
  verdicts are icon + word, waiting time is a clock + words (+ "over target" for screen readers).
- **Confirm always states the money**: the button carries the amount; the confirm dialog says what happens to the bill.
  An overpay is shown before the click, not only as a server error.
- **Bulk confirm is only for AUTO_MATCHED** (all checks passed) and goes through `POST /slips/bulk-approve`, which runs
  each id through the same `approveSlip` (bill lock, over-pay guard, audit). Partial failure is reported, not fatal.
- **Decide → next**: after confirm/reject the pane moves to the next slip in the queue.
- **Keyboard**: J/K/↑/↓ move · A confirm · R reject · E correct · Z zoom · X select · / search · ? help. Ignored while
  typing or when a modal is on top. Kbd hints are `aria-hidden` so button names stay clean.
- **Reject has one-tap reasons** that fill (not replace) the editable reason; the customer sees it in the app.
- **Duplicates can only be rejected**; the banner links to the original slip.
- Primitives reused from payroll: `SegmentBar`, `SegmentLegend`, `TONE` — do not fork them.

## Backend contract (additive, no migration)

- `PaymentSlipView` + `ocrError, ocrConfidence, dateOnly, uploadedByRole, sizeBytes, updatedAt` and
  `payment.{paidAmount, depositAmount, depositRemaining, status, invoiceNo, appointmentId, createdAt}`.
- `GET /slips/:id` → `PaymentSlipDetail` (+ `ocrText`, `duplicateOf`, `siblings[]`; staff only — the uploading customer
  gets nulls/empty).
- `GET /slips?view=&flag=&q=&from=&to=` — server-side tab / failed-check / search (name, phone, ref, sender, uploader,
  invoice no.) / Vientiane upload-day range.
- `GET /slips/summary?branchId=` → open counts + ₭ + oldest + over-SLA, today, 7-day (auto-match rate, median review
  minutes, mismatch counts, daily series), `slaMinutes` (30, `SLIP_REVIEW_SLA_MINUTES`).
- `POST /slips/bulk-approve {ids ≤ 50}` (Idempotency-Key) → `{ approved[], failed[{id,message}] }`.
- `POST /slips/:id/reprocess` — clears the OCR result and re-queues it (PENDING/stale, NEEDS_REVIEW, AUTO_MATCHED only);
  audit `SLIP_REPROCESS`.

## System gaps — ALL SHIPPED (2026-09-24)

Migration `20260923200000_slip_review_gaps` (additive: `SlipVerdict += REVERSED`, nullable columns on `payment_slips`).

| # | What shipped | Where |
|---|--------------|-------|
| S1 | **Bank proof** per slip: `MATCHED` (statement line matched to the tx) · `FOUND` (credit, same amount, ±1 day; reference match flagged) · `NOT_FOUND` (statement imported, nothing matches) · `NO_STATEMENT`. Computed in one batch per list. Row glyph + pane card. | `slips/bankProof.ts`, `slip.evidence.tsx` |
| S2 | **Near-duplicate**: needs the same amount **and** sender, plus either an ink-fingerprint distance ≤ 42 or the same transfer minute with a different reference; only against another bill's slip or a confirmed/reversed one. Image-only matching was rejected after measurement (different same-template slips scored 39.7, below any safe threshold). | `slips/imageSignals.ts`, `findNearDuplicate` |
| S3 | **Risk signals**: `EDITOR_SOFTWARE` (EXIF/XMP of the *original* upload), `QR_TEXT_MISMATCH` (bank QR ref ≠ printed ref), `LOW_CONFIDENCE` (<50). The first three block auto-match and bulk confirm; nothing auto-rejects. Flag `risk`. | `processSlip`, `RiskCard` |
| S4 | **SLA per branch** (default + overrides, `slaAlertEnabled`) in slip settings; BullMQ `slip-sla` sweep every 5 min notifies SUPER_ADMIN + branch admins, deduped per newest late slip. | `runSlipSlaAlerts`, `SlipSettingsCard` |
| S5 | **Claim lock**: `POST/DELETE /slips/:id/claim`, 3-min TTL, 60-s heartbeat from the open pane; review/bulk by someone else → 409 with the holder's name; "Take over" (`force`) is audited. | `claimSlip`, `ClaimBanner` |
| S6 | **Ask the customer** without rejecting: note + push (+ appointment chat when allowed); flag `infoRequested`; a new upload for the bill clears it. Mobile shows the note on the slip. | `requestSlipInfo`, `AskCustomerDialog` |
| S7 | **Reverse a confirmation** (BRANCH_ADMIN/SUPER_ADMIN): tx → `REVERSED`, slip → `REVERSED`, bill recomputed. Blocked when the bill is fully paid (receipt issued → void/refund in Finance), matched to the statement, or the month is closed — the reason is shown, not hidden. | `reverseSlip`, `ReverseDialog` |
| S8 | **Reject codes** (`AMOUNT_SHORT`, `WRONG_ACCOUNT`, `UNREADABLE`, `DUPLICATE`, `NOT_RECEIVED`, `OLD_SLIP`, `SUSPECTED_FAKE`, `OTHER`) sent by the presets, counted in the summary. | `SlipInsightsRow` |
| S9 | **Read accuracy per bank** (7 days) in the summary + insights row. | `getSlipSummary` |
| S10 | **CSV export** of the current filter (≤ 5000 rows, BOM for Excel, formula-injection escaped). | `GET /slips/export` |
| S11 | **Load more** in 100-row steps up to 1000; beyond that the page points to CSV. | `SlipReviewPage` |
| S12 | **Staff upload** from web-admin: pick an open bill, amount (owed / deposit chips), optional account, choose/drop/**paste** the image; original bytes are sent so the EXIF check still works. | `SlipUploadDialog` |

### Still open
- Near-duplicate needs the sender name to be read; slips whose sender OCR misses rely on exact-hash + reference dedupe only.
- EXIF only survives uploads that send original bytes (web-admin S12 does; check the mobile picker, which may re-encode).
- Reversal of a *fully paid* bill is deliberately not supported here — it belongs to Finance void/refund.
