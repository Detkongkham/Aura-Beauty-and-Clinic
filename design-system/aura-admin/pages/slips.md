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

## System gaps — not built yet (2026-09-23)

| # | Gap | Why it matters |
|---|-----|----------------|
| S1 | **Bank-statement proof**: match slips against imported statement lines (recon import) and show "seen in bank" | A slip is a picture; the bank line is the proof. Strongest fraud control. |
| S2 | **Near-duplicate images** (perceptual hash) — today only exact sha256 | A re-saved / cropped screenshot passes the image check. |
| S3 | **Edited-screenshot heuristics** (EXIF/software tag, font/kerning anomalies, amount region re-render) | Fake slips are usually edited real ones. |
| S4 | **Per-branch SLA + over-SLA alert** (BullMQ job → manager push / Topbar) | 30 min is a constant; nobody is told when it's breached. |
| S5 | **Claim / presence lock** ("Noy is reviewing") via the slip socket room | Two reviewers can open the same slip; the second gets a 409. |
| S6 | **Ask the customer** (clearer photo, missing page) from the pane via Messaging (M38) without rejecting | Rejecting to ask a question is heavy-handed. |
| S7 | **Reverse an approved slip** (void the tender with reason + audit) | Approval is final today; mistakes need the refund flow. |
| S8 | **Structured reject reason codes** (store preset key + free text) | Enables "why slips fail" analytics per bank/branch. |
| S9 | **Per-bank read accuracy** (auto-match rate by bankCode) | Shows which bank template the parser needs work on. |
| S10 | **CSV export of decisions** (who, when, corrections) | Accountants/auditors ask for it. |
| S11 | **Paging past 100** in the queue (cursor / infinite scroll) | Busy branches with long history. |
| S12 | **Staff upload from web-admin** (counter receives a screenshot on LINE/WhatsApp) | Today uploads come from mobile only. |
