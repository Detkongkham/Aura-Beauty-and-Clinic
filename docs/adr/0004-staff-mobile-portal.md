# ADR 0004 — Staff Mobile Portal (Phase 4)

Status: Accepted · 2026-09-10

## Context

Phase 4 (`implementation_plan.md` §5, Module 06 + parts of 09) adds the staff-facing side of
the mobile app: daily schedule, queue-status updates, GPS attendance, treatment records with
before/after photos, and a commission summary. The customer app (ADR 0003) already ships the
Expo shell, auth, http layer, i18n, theme and UI kit — Phase 4 reuses all of it.

## Decisions

1. **One app, role-switched at the navigator root.** `apps/mobile` now serves both `CUSTOMER`
   and `STAFF`. `useAuth` / `useAuthBootstrap` accept both roles (was `CUSTOMER`-only);
   `RootNavigator` renders `StaffNavigator` when `user.role === 'STAFF'`, else `AppNavigator`.
   No second entry point, no shared-code duplication. Other roles (admin) are still rejected
   at login (`errors.notAppUser`).
2. **`StaffNavigator`** = native-stack (`StaffTabs` → `StaffAppointmentDetail` → `TreatmentRecord`).
   `StaffTabsNavigator` = 4 tabs (Today / Attendance / Earnings / Profile) sharing the existing
   custom `TabBar` (its `ICONS` map gained the staff route names + a fallback).
3. **Backend module `apps/backend/src/modules/staff-portal/`** — all routes under
   `/staff-portal`, `authGuard` + `roleGuard('STAFF')`; `staffProfileId` is resolved from the
   JWT `sub` inside the service (`resolveStaffProfileId`), never trusted from the client.
   Endpoints:
   - `GET /schedule?date=` · `GET /appointments/:id` — the staff's own appointments only
     (`StaffScheduleItem`, code synthesized `A-XXXXXXXX`).
   - `PATCH /appointments/:id/status` — restricted transitions only
     (`PENDING|CONFIRMED → IN_PROGRESS → COMPLETED`); ownership enforced; other statuses 409.
     On `COMPLETED` it upserts `StaffCommission` (idempotent — `appointmentId` is unique;
     `payoutAmount = totalAmount × StaffProfile.commissionRate`).
   - `GET /attendance?month=` · `POST /attendance/check-in` · `POST /attendance/check-out` —
     Haversine geofence against the staff's **primary branch** `latitude/longitude`; radius =
     `STAFF_ATTENDANCE_RADIUS_METERS` env (default 300). Outside → 400. `ON_TIME` / `LATE`
     from today's `WorkingHour.startTime` (+5 min grace); `OVERTIME` past `endTime`. One open
     record per `(staffProfileId, date)`.
   - `GET /commission?month=` — `CommissionSummaryView`: totals, paid/unpaid split, per-service
     breakdown, and the `StaffKpiGoal` for that `monthYear` if present.
   - `GET /appointments/:id/treatment` · `PUT …/treatment` · `POST …/treatment/photos` —
     `TreatmentRecord` (unique per appointment) + `TreatmentPhoto` (`BEFORE|AFTER|PROGRESS`).
4. **Photo upload = base64 JSON, not multipart.** No `multer` dependency. The photos route
   mounts its own `express.json({ limit: '8mb' })` (global limit is 2 MB). The mobile client
   sends `expo-image-picker` output at `quality: 0.5, base64: true`; `contentType` is clamped
   to `image/jpeg|png|webp`. Files land via the existing local-disk `storage` adapter at
   `uploads/treatments/<recordId>/<uuid>.<ext>`; object storage is a later phase.
5. **No schema migration.** `Branch.latitude/longitude`, `StaffAttendance`, `TreatmentRecord`,
   `TreatmentPhoto`, `StaffCommission`, `StaffKpiGoal` all already exist. `shared-types` gains
   `staff-portal.schema.ts` (query + view types); `openapi.yaml` not updated (consistent with
   the other recent modules).
6. **New native deps:** `expo-location` (~18.0.10), `expo-image-picker` (~16.0.6), wired into
   `app.json` plugins with Lao permission strings. Requires a dev-client / prebuild rebuild
   before the portal runs on a device.
7. **Feedback UX:** no toast library added — mutations surface errors via `Alert.alert` and
   success via the screen re-rendering from query invalidation (`['staff-portal']` prefix) +
   `haptics.success()`. Consistent with the customer app.
8. **Typography = the customer app's flat scale** (`[[mobile-flat-type-scale]]` /
   `docs/design-mobile.md`). All staff screens use the shared `T` / `SMALL` / `EMPH` helpers in
   `staff-portal.parts.tsx` — 12/17 base (`className` controls weight + colour only), 10/14 for
   captions·pills·meta, 14/19 as the single emphasis step (screen title + one key metric).
   No `Text variant="display|title|heading"`, no `font-lao-bold`, no serif. The only larger
   numeral is the Earnings commission total (20px `font-display`). `StaffScreenTitle` = champagne
   foil eyebrow + 14px semibold title, matching `AppointmentsScreen`. Screen gutter `px-4` + list
   padding 16; cards `rounded-2xl` p-3–3.5 with `shadow.card`; `AnimatedEntrance` on list items.
   **`StaffProfileScreen` is a 1:1 copy of the customer `ProfileScreen` shell** — same brand
   eyebrow, `Gradient preset="wash"` hero with a `luxe` avatar ring, `SectionHeading` / `StatCell`
   / `AccountRow` helpers, account list (name/phone/email/password → the same `AccountSheets`),
   language `Segmented`, Face-ID switch + support row, destructive-outline logout. Adapted bits:
   title → `staffPortal.profile.title`, tier badge → `STAFF` on `brand` gradient, `#AUR-` →
   `#STF-` code, and the loyalty ribbon → staff stats (today's jobs / done this month /
   commission rate, from `useStaffSchedule` + `useCommissionSummary`).

9. **Tab screens carry a summary layer** (all client-side, no new endpoints). Shared blocks in
   `staff-portal.parts.tsx`: `HeroCard` (wash-gradient), `StatRibbon` + `StatCell`, `MiniBar`,
   `SectionHeading`.
   - **Today** — hero with now-serving / next-up / all-done state + a done/total `MiniBar` + a
     total·done·left `StatRibbon`; the list is grouped by `slotBucket` (morning/afternoon/evening);
     `ScheduleCard` gained a `highlight` state for the in-progress row, a dimmed style for
     done/cancelled, a customer-notes line, and a "recorded" badge when a treatment record exists.
   - **Attendance** — month nav (prev/next) so `useAttendanceState(month)` scopes the history; a
     `This month` ribbon (present days / on-time / late / hours) + a consecutive-day streak chip;
     the today card shows the status badge + branch + geofence radius inline; history rows get a
     worked-hours `MiniBar`.
   - **Earnings** — a second `useCommissionSummary(prevMonth)` powers a vs-last-month delta chip;
     hero gained a paid/unpaid split bar; ribbon is completed · avg-per-job · gross; KPI card shows
     remaining-to-goal / goal-reached + bonus; each by-service row gets a share `MiniBar`.

## Verification

- Backend: `pnpm --filter @abcp/backend test` — **46 integration tests green** (was 41), incl.
  new `tests/integration/staff-portal.test.ts` (5): book → schedule shows it → start/complete
  → commission persists → geofence 400/201/409 → treatment record + BEFORE photo → CUSTOMER 403.
- Monorepo `pnpm -r lint` + `pnpm -r typecheck` clean.
- `pnpm --filter @abcp/mobile test` (5) green; `expo export --platform ios` → 4.71 MB Hermes
  bundle (full graph compiles). Not run on a simulator/device here.

## Follow-up: walk-in = a real Appointment (2026-09-10)

Before this change `POST /appointments/walk-in` created only a `QueueTicket` — a dead-end row with
no staff, no time, no link, so walk-ins never reached the staff schedule, commission, treatment
records, or reporting. Reworked to the industry-standard model (Fresha/Zenoti): **a walk-in is an
`Appointment` created "now"**, and the `QueueTicket` is its waiting-room projection.

- **Migration `20260910120000_walkin_appointment_link`:** `Appointment.source` enum
  `ONLINE | WALK_IN | ADMIN` (default `ONLINE`); `QueueTicket.appointmentId String? @unique` +
  optional relation (`ON DELETE SET NULL`). Both additive, no backfill.
- **`createWalkIn` (queue.service):** one `$transaction` — resolve the staff (given `staffId`, else
  the eligible staff — serves the service at that branch — with the fewest active appointments
  today; none → 400), upsert the customer by phone (or a `walkin-<uuid>` guest), create the
  `Appointment` (`source: WALK_IN`, `status: CONFIRMED`, `startAt: now`, `endAt: now + duration`,
  `deliveryType: IN_STORE`, `totalAmount` = service price) + the linked `QueueTicket` (`WAITING`).
  Returns `{ ticket, appointmentId }` (`WalkInResult`).
- **Status mirror:** `mirrorTicketFromAppointment(tx, appointmentId, status)` (exported from
  queue.service, `updateMany` so it's a no-op for online appts) is called inside both the
  staff-portal and admin `updateAppointmentStatus` transactions — `IN_PROGRESS → IN_SERVICE`,
  `COMPLETED → COMPLETED`, `CANCELLED/NO_SHOW → CANCELLED`. On a WALK_IN going `IN_PROGRESS` the
  appointment's `startAt/endAt` are re-stamped to now so the Master Calendar block is honest.
- **Reads:** `StaffScheduleItem.isWalkIn` + `AdminAppointmentListItem.isWalkIn` now derive from
  `source`; `queue` `toTicketView.staffName` comes from the linked appointment's staff; dashboard
  `walkinRate14d` / `walkinsToday` are real. Mobile `ScheduleCard` + `StaffAppointmentDetailScreen`
  show a "Walk-in" badge.
- **web-admin:** no change — `WalkInSheet` already had the optional staff `<Select>` +
  `staffId` passthrough from the MSW era.
- **Concurrency:** `createAppointment` / `rescheduleAppointment` now wrap their Serializable
  transaction in `runSerializable()` — 3 attempts, retrying on `P2034` / `40001` / `40P01`
  (two clients booking the same slot at once is a real race, not a user error).
- **Tests:** new `tests/integration/walkin.test.ts` (2) — full lifecycle (issue → staff schedule
  with `isWalkIn` → start → ticket `IN_SERVICE` → complete → ticket `COMPLETED` + commission →
  admin list `isWalkIn`) + auto-assign. `admin-modules` walk-in test updated for the new shape.
  **Backend now 48 tests / 11 files green.**

## Still deferred

Real device run of the staff portal; per-screen mockup-first polish (Phase 3 had
`docs/design-mobile-*.md` mockups — Phase 4 screens use the UI kit directly); push
notifications for new/changed appointments (Phase 5); structured payroll export (Module 09
proper); commission `isPaid` toggling (admin/payroll side); staff profile avatar
(`AuthUser` has no `avatarUrl`).
