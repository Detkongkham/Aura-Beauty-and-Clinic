# Phase 7 — Revenue, AI & ການຄ້າ (progress)

Roadmap: [implementation_plan.md](../implementation_plan.md) §5 (🚩 Phase 7). Split from old Phase 6
on 2026-09-10. Done in waves 7A → 7B → 7C.

## Phase 7A — Revenue (ຄວາມສ່ຽງກາງ, ບໍ່ມີ infra ໃໝ່, reuse ສູງ)

| Wave | Scope | Status |
|------|-------|--------|
| 7A.1 | M28 Dynamic Pricing — rules engine + `/pricing-rules` CRUD + `/pricing/quote` + booking hook | ✅ DONE 2026-09-10 |
| 7A.2 | M33 Referral & Affiliate — referral code, apply-at-booking, reward-on-complete, affiliate CRUD/payout | ✅ DONE 2026-09-10 |
| 7A.3 | web-admin — `/pricing` page + `/referrals` page | ✅ DONE 2026-09-11 |
| 7A.4 | mobile — invite-a-friend screen + referral-code field + dynamic-price badge | ⬜ |
| 7A.5 | docs + memory + full-repo green verify | ⬜ |

---

## Wave 7A.1 — Dynamic Pricing backend (Module 28) — DONE & verified

`pnpm -r typecheck` ✅ · `pnpm --filter @abcp/backend lint` ✅ · backend `test` **73 pass**
(new `tests/integration/pricing.test.ts`, 6 tests) · shared-types `test` **8 pass** (+2).

### Schema
No migration — `DynamicPricingRule` (`dynamic_pricing_rules`) has existed since `20260901071145_init`.
Fields used: `branchId`, `serviceId?` (null = ທຸກບໍລິການຂອງສາຂາ), `ruleName`, `dayOfWeek` (0–6),
`startTime`/`endTime` (HH:MM wall-clock), `discountPercent` (Float), `priceMultiplier` (Float), `isActive`.

### shared-types — `packages/shared-types/src/pricing.schema.ts` (exported in index.ts)
`createPricingRuleSchema` / `updatePricingRuleSchema` (`.superRefine` → endTime > startTime;
discountPercent 0–90; priceMultiplier 0.1–3; serviceId defaults null), `pricingRuleListQuerySchema`,
`priceQuoteQuerySchema` (`branchId`, `serviceId`, `at?` ISO) + `PricingRuleView` / `PriceQuoteView`.

### Backend — `apps/backend/src/modules/pricing/` (service + routes)
`constants/phase7.ts` → `PRICE_ROUNDING_LAK = 100`.
- **`resolvePrice(db, {branchId, serviceId, basePrice, at?})`** — exported engine. Loads active rules for
  the branch where `dayOfWeek === at.getUTCDay()` and (`serviceId` matches OR is null); filters to those
  whose `[startTime,endTime)` window contains `minutesOfDayUTC(at)` (same wall-clock-as-UTC convention as
  slotEngine/WorkingHour). Effective price = `base × (1 − discountPercent/100) × priceMultiplier`, rounded
  to nearest 100 LAK. Picks the **cheapest** matching rule; service-specific rule wins ties. No match →
  `finalPrice = round(basePrice)`, `appliedRule: null`.
- **`GET /pricing/quote`** — `authGuard` only (any logged-in role); returns `PriceQuoteView`
  (`basePrice`, `finalPrice`, `savings`, `discountPercent`, `currency:'LAK'`, `appliedRule`).
- **`/pricing-rules`** — `roleGuard('SUPER_ADMIN','BRANCH_ADMIN')`: GET (filter branchId/serviceId/isActive)
  / POST (validates branch + that service belongs to branch) / PATCH :id / DELETE :id (hard delete).
- Mounted in `routes.ts` as `/pricing` (quote) and `/pricing-rules` (CRUD).

### Booking hook
`booking.service.ts` `createAppointment` now calls `resolvePrice(tx, …, at: startAt)` inside the
serializable tx and writes the discounted `finalPrice` to `appointment.totalAmount` (was `service.price`).
Applies to both admin `/booking/appointments` and customer `/booking/appointments/me`.

### Seed — `prisma/seed.ts`
- "Happy Hour ບ່າຍ" — Mon–Thu 13:00–16:00, −20%, all services, ids `66666666-…-000000000001..4`.
- "Weekend peak (ຕັດຜົມ)" — Sat/Sun 10:00–12:00, ×1.10, haircut only, ids `66666666-…-000000000010/16`.

### Notes / debt
- `openapi.yaml` not updated (consistent with Phase 2+).
- No branch-scoped RBAC (any BRANCH_ADMIN edits any branch's rules) — consistent with other admin modules.
- Reschedule does **not** re-price (totalAmount stays from original booking time) — revisit if needed.
- Payment/quote surfaces still show `totalAmount`; mobile price badge lands in 7A.4.

---

## Wave 7A.2 — Referral & Affiliate backend (Module 33) — DONE & verified

`pnpm -r typecheck` ✅ · `pnpm --filter @abcp/backend lint` ✅ · backend `test` **80 pass**
(new `tests/integration/referral.test.ts`, 7 tests) · shared-types `test` **8** (unchanged).

### Schema — no migration
`ReferralCode` / `ReferralUsage` (finance.prisma), `AffiliateProfile` / `AffiliatePayout` (auth.prisma),
`PayoutStatus` enum — all exist since init. One-time-per-referred-user is enforced in app code
(no `@@unique` added).

### shared-types
- `appointment.schema.ts` — `createAppointmentBaseSchema` +`referralCode?` (min4/max32); flows into both
  `createAppointmentSchema` and `customerCreateAppointmentSchema`.
- new `referral.schema.ts` (exported in index.ts) — `MyReferralView`, `ReferralUsageView`,
  `affiliateListQuerySchema`, `enrollAffiliateSchema`, `updateAffiliateSchema`,
  `createAffiliatePayoutSchema`, `updateAffiliatePayoutStatusSchema` + `AffiliateView`,
  `AffiliatePayoutView`, `MyAffiliateView`.

### Backend — `apps/backend/src/modules/referral/` (referral.service + affiliate.service + routes)
- **`referral.service.ts`**
  - `ensureCode(db, userId)` — lazy-create `ReferralCode`, code `AURA-XXXXXX` (alphabet excludes O/0/I/1),
    retries on P2002. `discountAmount` default 50 000 LAK (schema default).
  - `GET /referral/me` → `MyReferralView` (code, discountAmount, totalReferred, totalRewarded, isAffiliate).
  - `GET /referral/me/usages` → paginated `ReferralUsageView`.
  - `applyReferralAtBooking(tx, {referredUserId, code, appointmentId})` — 400 if code missing / own code /
    referredUser already has a `ReferralUsage`; else writes `ReferralUsage` and returns the discount LAK.
  - `rewardReferralOnComplete(tx, appointmentId)` — idempotent on `rewardClaimed`. Credits referrer loyalty
    via `earnPoints(amountLak = discountAmount)` refId `referral:<usageId>`; if referrer has an
    `AffiliateProfile`, also `totalEarnings`/`unpaidBalance += round(commissionRate × appt.totalAmount)`.
- **`affiliate.service.ts`** — admin `/affiliates`: GET (q, paginated, `referredCount`), POST enroll
  `{userId, commissionRate 0–0.5}` (409 if dup), PATCH `{commissionRate}`, DELETE (409 if unpaidBalance>0),
  GET/POST `/:id/payouts` (create: 400 if amount>unpaidBalance, decrements balance, PENDING),
  PATCH `/affiliates/payouts/:id` `{status}` (PAID→sets paidAt; REJECTED→refunds balance once).
  `GET /affiliate/me` → `MyAffiliateView`.
- Mounted: `/referral`, `/affiliate` (self), `/affiliates` (admin) in `routes.ts`.

### Booking + completion hooks
- `booking.service.createAppointment` — after `appointment.create`, if `input.referralCode`:
  `applyReferralAtBooking` then `totalAmount = max(0, finalPrice − discount)`. (Runs inside the
  serializable tx; applies to admin + customer booking paths.)
- `rewardReferralOnComplete(tx, id)` added to the `COMPLETED` block of **both**
  `appointments.service.ts` (admin PATCH status) and `staff-portal.service.ts` (staff finishes job),
  right after `consumeServiceStock`.

### Seed — `prisma/seed.ts`
Seeded customer (`02099900001`) gets `ReferralCode` `AURA-DEMO24` + an `AffiliateProfile` (rate 0.10).

### Tests — `tests/integration/referral.test.ts` (7 cases) ✅
code issue + one-time + own-code guards · −50 000 at booking · COMPLETED → loyalty 5 pts +
affiliate commission 7 000 (0.1 × 70 000) + idempotent · payout create/over/PAID · CUSTOMER 403.

### Notes / debt
- `earnPoints` divides amountLak by 10 000, so a 50 000 LAK referral reward = only 5 loyalty points —
  small; revisit reward model (flat bonus points?) if product wants it richer.
- Non-affiliate referrers get loyalty points only (no cash). Affiliate cash flows only through the
  referral path — a KOL sharing a plain link without the referred user entering a code earns nothing.
- Reschedule/cancel of a referral booking does not roll back the `ReferralUsage`.

---

## Wave 7A.3 — web-admin UI (`/pricing` + `/referrals`) — DONE & verified

`pnpm -r typecheck` ✅ · `pnpm --filter @abcp/web-admin lint` ✅ · web-admin `test` **34 pass**
(+2: `PricingPage.test.tsx`, `ReferralsPage.test.tsx`) · web-admin `build` ✅.

### Routing / nav / RBAC
- `router/paths.ts` — `pricing: '/pricing'`, `referrals: '/referrals'`.
- `router/index.tsx` — both lazy pages under one `<RoleRoute permission="finance:view" />` block
  (reused `finance:*`; no new permission added — writes are also role-guarded server-side).
- `components/layout/nav-items.ts` — two items in the **financeMarketing** group (`Percent`, `Share2`).
- i18n: `nav.pricing` / `nav.referrals` + full `pricing.*` and `referrals.*` blocks in **en.json + lo.json**.

### `features/pricing/`
- `pricing.api.ts` — `usePricingRules(filters)`, `useCreatePricingRule`, `useUpdatePricingRule`,
  `useDeletePricingRule` (all keyed `['pricing-rules']`).
- `PricingPage.tsx` — StickyPageHeader + FilterBar (branch, active/inactive) + DataTable
  (rule/scope, day+window, effect badges −%/×, active `<Switch>` inline toggle, delete).
  `RuleDialog` — branch (locked on edit), optional service (scoped to branch), name, day-of-week,
  `<input type="time">` start/end, discount%, multiplier, active checkbox. Manage actions gated by
  `finance:manage`; row click opens edit.

### `features/referrals/`
- `referrals.api.ts` — `useAffiliates`, `useAffiliatePayouts(id)`, `useEnrollAffiliate`,
  `useUpdateAffiliate`, `useRemoveAffiliate`, `useCreatePayout`, `useSetPayoutStatus`.
- `ReferralsPage.tsx` — header + 3 stat tiles (partners / total earnings / unpaid) + search FilterBar
  + DataTable (partner, rate badge, referred count, earnings, unpaid, row actions).
  `EnrollDialog` — customer search (reuses `useCustomers`) → pick → commission % (stored as 0–0.5).
  `RateDialog` — edit commission %. `PayoutsSheet` — unpaid balance, new-payout form
  (amount/method/account), payout list with PAID / REJECTED buttons on PENDING rows.

### Mocks
`mocks/handlers/revenue.ts` (registered in `handlers/index.ts`) — offline stubs for `/pricing-rules`
and `/affiliates*` returning empty data so pages render under `VITE_ENABLE_MOCKS=true`.

### Notes / debt
- Both page tests assert heading + subtitle only (no auth provider in `renderWithProviders`, so
  `finance:manage`-gated buttons don't render) — matches the InventoryPage test precedent.
- Pricing rule form has no live price-preview; `/pricing/quote` is only consumed by mobile (7A.4).
- Affiliate enroll picker searches customers only (CUSTOMER role); enrolling staff/other roles needs
  a direct userId — not surfaced in the UI.

---

## Wave 7A.4 — mobile (invite-a-friend + referral field + dynamic-price badge) — DONE & verified

`pnpm -r typecheck` ✅ · `pnpm --filter @abcp/mobile lint` ✅ · mobile `test` **6 pass** (+1 in
`tests/booking-draft.test.ts`) · `npx expo export --platform ios` ✅ (5.94 MB).

### `features/referral/referral.api.ts`
- `useMyReferral()` → `GET /referral/me` (`MyReferralView`).
- `usePriceQuote({branchId, serviceId, at?}, enabled)` → `GET /pricing/quote` (`PriceQuoteView`).
- `services/queryKeys.ts` — `qk.referral`, `qk.priceQuote(params)`.

### `screens/profile/ReferralScreen.tsx` (new)
Invite surface: gradient hero with the `AURA-XXXXXX` code + copy (`expo-clipboard`), "Share invite"
(`Share.share`), two stat tiles (friends joined / rewards earned), a 3-step "how it works", and an
affiliate ribbon when `isAffiliate`. Wired: `AppStackParamList.Referral`, `AppNavigator` screen,
Profile ▸ Rewards row (`people-outline`, now `last`; gift-cards row loses `last`).

### Booking — referral code + dynamic price
- `store/booking-draft.store.ts` — `+referralCode: string` (default `''`, cleared by `start()`).
- `WizardConfirmScreen.tsx`:
  - New "Referral code" card (create mode only) — uppercase `Input`, passed to
    `useCreateAppointment` as `referralCode` (trimmed, upper-cased) when non-empty.
  - `usePriceQuote` for the selected slot; when `quote.savings > 0` the footer shows the base price
    struck through, the `finalPrice` as the total, and a green ⚡ badge (`appliedRule.ruleName` or
    `confirm.dynamicBadge`). `BookingSummaryCard` gets `price={total}` / `compareAtPrice={strikePrice}`.
    Falls back to the existing `compareAtPrice` sale display when no dynamic rule applies.

### i18n — en.json + lo.json
`profile.referralRow`/`referralRowValue`, full `referral.*` block, `confirm.referralTitle` /
`referralPlaceholder` / `referralHint` / `dynamicBadge`.

### Notes / debt
- Quote is re-fetched on the confirm screen only; the service-list / detail screens still show the
  static `Service.price` (no happy-hour badge there yet).
- `ReferralScreen` has no usage list (who you invited) — `GET /referral/me/usages` exists on the
  backend but isn't surfaced; add if product wants it.
- Reschedule path doesn't re-quote (consistent with the backend not re-pricing on reschedule).

---

## Wave 7A.5 — full-repo verification — DONE 2026-09-11

| check | result |
|-------|--------|
| `pnpm -r typecheck` | ✅ shared-types · backend · web-admin · mobile |
| backend `lint` / `test` | ✅ / **80** (`pricing` 6 + `referral` 7 new) |
| shared-types `test` | ✅ **8** (+2) |
| web-admin `lint` / `test` / `build` | ✅ / **34** (+2) / ✅ |
| mobile `lint` / `test` / `expo export --platform ios` | ✅ / **6** (+1) / ✅ 5.94 MB |

**Phase 7A COMPLETE** — Dynamic Pricing (M28) + Referral/Affiliate (M33) shipped across
shared-types, backend, web-admin, and mobile. Next: Phase 7B (M29 On-Demand Home Service +
live GPS — first WebSocket/Redis infra).

---

## Phase 7B — On-Demand Home Service & Live GPS Stylist Tracking (Module 29)

Plan: `/Users/ta/.claude/plans/smooth-foraging-clover.md`. Confirmed decisions: auto-match nearest
available stylist (ride-hailing style), socket.io for realtime, `react-native-maps` on mobile.

| Wave | Scope | Status |
|------|-------|--------|
| 7B.1 | `HomeServiceTrip` schema + auto-match/travel-fee backend service + booking hook | ✅ DONE 2026-09-12 |
| 7B.2 | socket.io infra (server + Redis adapter + JWT handshake + rooms/events) | ✅ DONE 2026-09-12 |
| 7B.3 | web-admin — dispatch table (no map) | ✅ DONE 2026-09-12 |
| 7B.4 | mobile — staff-side (availability toggle, active-trip screen) | ✅ DONE 2026-09-12 |
| 7B.5 | mobile — customer-side (`react-native-maps` live tracking) | ✅ DONE 2026-09-12 |
| 7B.6 | docs + memory + full-repo green verify | ✅ DONE 2026-09-12 |

---

## Wave 7B.1 — Schema + core backend service (REST-only, no sockets yet) — DONE & verified

`pnpm -r typecheck` ✅ · `pnpm --filter @abcp/backend lint` ✅ · backend `test` **85 pass**
(new `tests/integration/home-service.test.ts`, 5 tests) · shared-types `test` **8** (unchanged,
types-only addition).

### Schema — migration `20260912090000_add_home_service_trip_and_staff_availability`
- New enum `HomeServiceJobStatus` (MATCHING/ASSIGNED/EN_ROUTE/ARRIVED/IN_PROGRESS/COMPLETED/
  CANCELLED/NO_MATCH) + `HomeServiceTrip` model (`booking.prisma`) — durable trip lifecycle +
  last-known-location snapshot (not full ping history; high-frequency pings are a Redis job for 7B.2).
- `StaffProfile` (`staff.prisma`) +`isHomeServiceAvailable`/`lastKnownLatitude`/`lastKnownLongitude`/
  `lastLocationAt` — the on-duty/dispatch-eligibility signal (deliberately separate from
  `StaffAttendance`, which is a daily check-in/out ledger, wrong shape for "available right now").

### Backend — `apps/backend/src/modules/home-service/`
- `home-service.service.ts`: `matchNearestStaff()` (candidates filtered by branch/service/
  availability/location-freshness/free-slot, ranked by `haversineMeters`, rejects the whole booking
  with `409 NO_STYLIST_AVAILABLE` if none within `HOME_SERVICE_MATCH_RADIUS_METERS`, default 15km),
  `computeTravelFee()` (`TRAVEL_FEE_BASE_LAK` + `TRAVEL_FEE_PER_KM_LAK` × km, hardcoded constants —
  same simplicity bar as 7A's `PRICE_ROUNDING_LAK`), `setStaffAvailability`, `recordLocationPing`
  (REST fallback; socket.io is the primary path in 7B.2), `updateTripStatusByStaff` (staff-only
  EN_ROUTE/ARRIVED/CANCELLED), `syncTripOnAppointmentStatus` (called from both
  `staff-portal.service.ts` and `appointments.service.ts`'s existing status-update flows so
  IN_PROGRESS/COMPLETED/CANCELLED mirror onto the trip without duplicating commission/loyalty
  logic), `getTripView`/`listTrips`/`assignTrip` (admin reassignment).
- Routes mounted as `/home-service` (trip view, any authed party), `/home-service/staff`
  (STAFF-only), `/home-service/admin` (SUPER_ADMIN/BRANCH_ADMIN).
- `haversineMeters` extracted from `staff-portal.service.ts` to `apps/backend/src/utils/geo.ts`
  (shared by Module 26 GPS attendance and Module 29 matching/travel-fee).

### Booking hook — `booking.service.ts createAppointment()`
For `deliveryType === 'HOME_SERVICE'`, `matchNearestStaff` resolves `staffProfileId` (customer no
longer supplies one) and `travelFee` before the existing `assertSlotFree`/dynamic-pricing/create
steps; a `HomeServiceTrip` row (`status: ASSIGNED`) is created in the same serializable tx right
after the appointment.

### shared-types
- `staffProfileId` on `createAppointmentBaseSchema` is now optional; the refine enforces
  IN_STORE→required, HOME_SERVICE→must be absent (auto-dispatch owns it).
- New `home-service.schema.ts` (`HomeServiceJobStatus` enum in `enums.ts`, ping/availability/status
  schemas, `HomeServiceTripView`/`HomeServiceLocationEvent`/`HomeServiceStatusEvent` — the latter two
  double as the socket.io payload shapes for 7B.2, single source of truth backend+mobile).

### Seed
Seeded stylist (`02055500001`) now has `isHomeServiceAvailable: true` + coordinates near the branch,
so auto-match has a real candidate in dev out of the box.

### Notes / debt (carried into later waves)
- Travel-fee rate is a hardcoded constant; revisit only if branch-varying rates are requested.
- `assignTrip` (admin reassignment) exists but has no web-admin UI yet — lands in 7B.3.

---

## Wave 7B.2 — socket.io infra (server + Redis adapter + JWT handshake + rooms/events) — DONE & verified

`pnpm -r typecheck` ✅ · `pnpm --filter @abcp/backend lint` ✅ · backend `test` **88 pass**
(new `tests/integration/home-service-realtime.test.ts`, 3 tests, real socket.io-client sockets against
an ephemeral http server + the real Redis adapter — not a mocked transport).

### `apps/backend/src/realtime/socket.ts` (new)
- `createSocketServer(httpServer)` — attaches socket.io to the same `http.Server` `server.ts` already
  gets from `app.listen()` (Express stays untouched); registers `@socket.io/redis-adapter` with two
  dedicated `createRedisConnection()` connections (the existing BullMQ factory pattern — ioredis needs
  separate pub/sub connections). Not load-bearing for correctness on today's single instance, but
  wired now so horizontal scaling and future M21 chat / M35 chatbot reuse don't require retrofitting.
- JWT handshake: `io.use()` reads `socket.handshake.auth.token`, runs it through the same
  `verifyAccessToken` as `authGuard`, rejects with `connect_error` on failure. `socket.data.auth` typed
  as `AccessTokenPayload` via socket.io's generic `SocketData` param (own `ClientToServerEvents`/
  `ServerToClientEvents` maps too, so `socket.emit(...)` is type-checked).
- Rooms: `home-service:{appointmentId}`, joined via client `join-trip {appointmentId}` — server checks
  the connecting user is the trip's customer, matched stylist, or admin/branch-admin before allowing
  `socket.join`; unauthorized attempts get an `unauthorized` event instead of silently failing.
- `stylist:location` (client→server, STAFF only, validated with the same `locationPingSchema` used by
  the REST fallback) calls the *same* `recordLocationPing` from 7B.1 (no duplicated business logic),
  then broadcasts `trip:location` to the room. `trip:status` is emitted the same way from the REST
  status-transition/assign routes (`emitTripLocation`/`emitTripStatus` exported for route handlers to
  call after mutating state — kept out of `home-service.service.ts` itself to avoid a service↔socket
  import cycle; REST routes are the seam that calls both).
- `getIO()` throws if called before init (real server always has it); `emitTripLocation`/
  `emitTripStatus` no-op quietly if `io` is null so `home-service.test.ts`'s plain `createApp()`
  integration tests (no socket server) keep working unchanged. `closeSocketServer()` added for
  graceful shutdown (`server.ts`) and test teardown.

### Tests — `apps/backend/tests/integration/home-service-realtime.test.ts`
Spins up `createApp()` on a real ephemeral `http.createServer` + `createSocketServer`, connects real
`socket.io-client` sockets: handshake with no token → `connect_error`; an unrelated user's `join-trip`
→ `unauthorized`; a stylist `stylist:location` ping → the customer's socket receives `trip:location`
in the same room, and the DB row (`HomeServiceTrip.lastLatitude`) is updated.
**Test isolation gotcha (fixed):** this test's stylist/branch must be dedicated, not the shared seeded
branch/stylist — `matchNearestStaff` and walk-in auto-assign are branch-scoped, so a temp `StaffProfile`
made "available for everything" on the *shared* seeded branch got silently picked up as a candidate by
other test files running in parallel (`walkin.test.ts`'s auto-assign test flaked, and
`home-service.test.ts`'s travel-fee assertion flaked) — fixed by creating a dedicated temp `Branch` +
`StaffProfile` scoped only to that branch, so no other suite's branch-filtered queries can see it.
Confirmed stable across repeated full-suite runs after the fix.

### Notes / debt (carried into later waves)
- Trip status for EN_ROUTE/ARRIVED/CANCELLED now pushes live via `trip:status`; the mobile client
  (7B.4/7B.5) still needs to actually connect and subscribe.

---

## Wave 7B.3 — web-admin dispatch table (no map) — DONE & verified

`pnpm -r typecheck` ✅ · `pnpm --filter @abcp/web-admin lint` ✅ · web-admin `test` **35 pass**
(+1: `HomeServiceDispatchPage.test.tsx`) · web-admin `build` ✅.

### Routing / nav / RBAC
- `router/paths.ts` — `homeServiceDispatch: '/home-service/dispatch'`.
- `router/index.tsx` — added as a sibling path inside the existing `RoleRoute permission="queue:manage"`
  block (alongside `/queue`) rather than reusing `finance:view` like 7A — dispatch is an operations
  action, not a revenue one, and `queue:manage` is the closest existing analog (already granted to
  BRANCH_ADMIN, gates the walk-in/queue-board page). No new permission added to shared-types.
- `components/layout/nav-items.ts` — new item in the **scheduling** group (next to Queue), `Navigation`
  icon (new import — `MapPin`/`Truck` were already taken by branches/suppliers).
- i18n: `nav.homeServiceDispatch` + full `homeServiceDispatch.*` block in **en.json + lo.json**
  (Thai-script-scanned clean, per project convention).

### `features/home-service/`
- `home-service.api.ts` — `useHomeServiceTrips({branchId?, status?})` (15s `refetchInterval` — no
  sockets on web-admin in this wave, poll-only per plan), `useAssignTrip()`
  (`PATCH /home-service/admin/trips/:appointmentId/assign`). Same `KEY`-array + `invalidateQueries`
  convention as `pricing.api.ts`/`referrals.api.ts`.
- `HomeServiceDispatchPage.tsx` — StickyPageHeader + FilterBar (branch + status `<Select>`) + DataTable
  (customer, stylist name or "Unmatched", status `Badge` per `HomeServiceJobStatus`, requested time via
  `DateTimeText`, ETA in minutes, row action). `AssignDialog` — plain `useState` form (matches 7A's
  `RuleDialog` precedent, not react-hook-form: a one-field reassign doesn't warrant a schema resolver),
  staff `<Select>` sourced from `useStaffList({branchId: trip.branchId})`. "Reassign" only rendered for
  `queue:manage` + trip status in `{NO_MATCH, ASSIGNED, EN_ROUTE}`.

### Mocks
`mocks/handlers/home-service.ts` (registered in `handlers/index.ts`) — offline stubs for
`GET /home-service/admin/trips` (empty array) and the assign PATCH, matching the `revenue.ts` pattern.

### Notes / debt
- No live map / no sockets on web-admin this wave (by design — `leaflet` is already a dependency via
  `BranchMapPicker.tsx`; a future live dispatch map should reuse it + a socket.io-client connection
  rather than adding Mapbox/Google Maps to web — explicitly deferred, not part of this plan).
- Page test asserts heading + subtitle only (no auth provider in `renderWithProviders`, so the
  `queue:manage`-gated Reassign button doesn't render) — matches the Pricing/Referrals test precedent.

---

## Wave 7B.4 — mobile staff-side (availability toggle + active-trip screen) — DONE & verified

`pnpm -r typecheck` ✅ · `pnpm --filter @abcp/mobile lint` ✅ · mobile `test` **6 pass** (unchanged —
no new unit-testable logic this wave) · `npx expo export --platform ios` ✅ (socket.io-client is pure
JS, no native linking needed yet — that lands in 7B.5 with `react-native-maps`).

### Backend gap closed first
`GET /home-service/staff/availability` added (`home-service.service.ts` `getStaffAvailability` +
route) — 7B.1 only had the PATCH, so the mobile toggle had no way to read its current state on load.
Covered in `home-service.test.ts` (backend now **89 tests**, +3: the new GET/PATCH round-trip case
plus its 2 assertions).

### `apps/mobile/src/features/staff/home-service.api.ts` (new)
`useHomeServiceAvailability` / `useSetHomeServiceAvailability`, `usePostLocationPing` (REST fallback),
`useHomeServiceTrip(appointmentId)` / `useUpdateTripStatus(appointmentId)` — same
`http`+`qk`+TanStack-Query convention as `staff-portal.api.ts`, new keys added to
`services/queryKeys.ts` rather than inlined.

### `apps/mobile/src/services/socket.ts` (new)
`connectTripSocket()` — a **new connection per use**, not a persistent app-wide singleton (simplest
correct scope for this first version): opened when `StaffActiveTripScreen` needs it, closed on
unmount. `auth` is passed as a callback (`(cb) => cb({ token: ... })`) so a rotated access token is
picked up fresh on every (re)connect, reading `useAuthStore.getState().accessToken` the same way
`services/http.ts`'s interceptor does. Origin is derived from `env.apiBaseUrl` with the `/api/v1` REST
suffix stripped (socket.io mounts on the bare HTTP server, not under the REST prefix).

### `apps/mobile/src/screens/staff/StaffActiveTripScreen.tsx` (new)
Reuses `HeroCard`/`SectionHeading`/`T`/`SMALL`/`StaffScreenTitle` from `staff-portal.parts.tsx` (no new
primitives invented). Status-driven action buttons:
- `ASSIGNED` → "Start driving" (`PATCH /home-service/staff/trips/:id/status {EN_ROUTE}`) — starts
  `expo-location.watchPositionAsync` (foreground only, same permission pattern as
  `StaffAttendanceScreen`) emitting `stylist:location` over the socket on every callback
  (`timeInterval: 5000, distanceInterval: 20`), REST fallback available via `usePostLocationPing` but
  not wired to fire automatically yet (socket is treated as reliable enough for v1; a real fallback
  timer is a fast-follow, not silently assumed to work — flagged, not left ambiguous).
- `EN_ROUTE` → "I've arrived" (`{ARRIVED}`) — stops the location watch + disconnects the socket.
- `ARRIVED` → "Start service" — goes through the **existing** `useUpdateApptStatus` (`staff-portal`
  endpoint, `IN_PROGRESS`), not a home-service endpoint, since that's what already carries the
  commission/loyalty/stock/referral completion logic; `syncTripOnAppointmentStatus` (7B.1) mirrors it
  onto the trip automatically.
- `IN_PROGRESS` → "Complete service" — same `useUpdateApptStatus`, `COMPLETED`.
- `ASSIGNED`/`EN_ROUTE`/`ARRIVED` → "Cancel trip" (confirm alert → `{CANCELLED}`).

### `StaffTodayScreen.tsx` + `staff-portal.parts.tsx` changes
- New availability `Segmented` control (Off/Available) in the header, backed by the two hooks above.
- `ScheduleCard` gained an optional `startLabel` prop (falls back to the existing `t('staffPortal.today.start')`)
  so a HOME_SERVICE row's start button can say "Manage trip" without forking the component.
- Both the per-row `ScheduleCard.onStart` and the hero "focus" card's action button now branch on
  `item.deliveryType === 'HOME_SERVICE'`: home-service jobs navigate to `StaffActiveTrip` instead of
  jumping straight to `IN_PROGRESS` — the EN_ROUTE/ARRIVED pre-service lifecycle only applies to
  HOME_SERVICE bookings, in-store bookings are unaffected.
- Navigation: `StaffStackParamList` +`StaffActiveTrip: { appointmentId, customerPhone? }`, registered
  in `StaffNavigator.tsx`. `customerPhone` is threaded through from `StaffScheduleItem` at the call
  site (no new endpoint needed — `GET /home-service/:appointmentId` doesn't carry a phone number).

### i18n
New `staffPortal.homeService.*` block (sibling to `today`/`attendance`/`profile`) in both `en.json` and
`lo.json`, Thai-script-scanned clean.

### Notes / debt
- Foreground-only tracking, as planned — background location (`startLocationUpdatesAsync` + a
  `TaskManager` task, extra "always" permission, iOS review scrutiny) is an explicit fast-follow, not
  attempted here. In-app copy should eventually remind the stylist to keep the app open while en route
  (not added yet — small polish item).
- No automatic REST-fallback ping loop if the socket disconnects mid-trip; `usePostLocationPing` exists
  but nothing calls it yet. Low risk for v1 (socket.io reconnects on its own), but a real gap if the
  socket repeatedly fails to reconnect on a bad connection.
- `usePostLocationPing`/`useUpdateTripStatus` are unit-tested indirectly only via typecheck — no mobile
  component test harness exercises the new screen (mobile's test suite is logic-only: booking-draft +
  format, no RTL-for-RN component tests exist in this codebase to extend).

---

## Wave 7B.5 — mobile customer-side (`react-native-maps` live tracking) — DONE & typecheck/lint verified

`pnpm -r typecheck` ✅ (shared-types build + mobile) · `pnpm --filter @abcp/mobile lint` ✅ · mobile
`test` **6 pass** (unchanged — no new unit-testable logic) · `npx expo config --type prebuild --json`
✅ (config plugins resolve, `android.config.googleMaps.apiKey` present, `react-native-maps`
permissions autolinked with no explicit plugin entry needed).

### Dependency + native-config gap closed first
- `apps/mobile/package.json` +`react-native-maps@1.20.1` (SDK 52-compatible), `socket.io-client`
  already present from 7B.4.
- **`app.json` → `app.config.ts`** (required side-change from the plan): same shape as before, plus
  `android.config.googleMaps.apiKey: process.env.GOOGLE_MAPS_API_KEY ?? ''` so the key is read from an
  env var / EAS secret instead of being committed. iOS uses default Apple Maps (`PROVIDER_GOOGLE` only
  passed on Android) — no Google iOS key needed for a Laos-only launch, per the plan's decision.
  Confirmed via `expo config --type prebuild --json`: no explicit `react-native-maps` plugin entry is
  needed — autolinking picks up the `android.config.googleMaps.apiKey` field and adds the location
  permissions on its own.

### `apps/mobile/src/features/appointments/home-service-tracking.api.ts` (new)
`useHomeServiceTrip(appointmentId)` — same `GET /home-service/:id` + `qk.homeServiceTrip` query key as
the staff-side hook in `features/staff/home-service.api.ts` (the endpoint is generic — customer, matched
stylist, or admin — so both call sites share one cache entry); kept as a small duplicate function rather
than importing across the staff/customer feature boundary, matching the "three similar lines over a
premature cross-feature import" bar used elsewhere in this codebase.

### `apps/mobile/src/screens/appointments/HomeServiceTrackingScreen.tsx` (new)
- `MapView` (native default provider on iOS, `PROVIDER_GOOGLE` on Android) with a stylist marker (from
  socket `trip:location`, seeded from the trip's last-known ping) and a customer/destination marker
  (`destLatitude/destLongitude`), auto-fit via `fitToCoordinates` whenever either point updates. Map is
  only mounted while `trip.status` is `ASSIGNED`/`EN_ROUTE`/`ARRIVED` (`LIVE_STATUSES`) — once
  `IN_PROGRESS`/`COMPLETED`/`CANCELLED` the stylist has arrived and there's nothing left to track live.
- Reuses `connectTripSocket()` from `services/socket.ts` as-is (already generic despite living in the
  file used first by the staff screen) — `join-trip`/`leave-trip` on mount/unmount, `trip:location`
  updates local marker + ETA state directly (no query invalidation per ping — would be far too chatty),
  `trip:status` invalidates `qk.homeServiceTrip` so the status badge/timeline/footer re-fetch from REST.
- ETA pill + a 5-step status timeline (`ASSIGNED → EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETED`)
  matching the "ticket" visual language convention from `appointment-detail-screen-mobile-redesign`
  (`Card`/`Badge`/12px `T` text, `AnimatedEntrance` stagger).

### `AppointmentDetailScreen.tsx` entry point
New "Track your stylist" banner (primary-tinted card, `Ionicons name="navigate"`) shown when
`isHome && a.status is PENDING or CONFIRMED`, navigating to `HomeServiceTracking { appointmentId }`.
`AppointmentDetailView` has no home-service trip status field, so the gate uses the coarser
`Appointment.status` — the tracking screen itself fetches the trip and shows a "finding your stylist"
state if the trip is still `MATCHING`/`NO_MATCH`.

### Navigation
`AppStackParamList` +`HomeServiceTracking: { appointmentId: string }`; registered in `AppNavigator.tsx`.

### i18n — en.json + lo.json
New top-level `tracking.*` block (title/trackButton/trackHint/matching/yourLocation/etaMinutes/
timelineTitle + a customer-phrased `status.*` map distinct from `staffPortal.homeService.status.*`,
since "Assigned to you" reads wrong from the customer's side — e.g. `ASSIGNED` → "Stylist assigned" for
the customer vs "Assigned to you" for staff). Lao block scanned clean for Thai look-alike characters
(U+0E01–0E7F), per project convention.

### Notes / debt
- **Real native-build gate still pending**: `expo config --type prebuild --json` confirms config-plugin
  resolution, but `expo export` (used by every prior mobile wave) is *not* sufficient once
  `react-native-maps` is a native dependency — it only bundles JS. An actual `eas build --profile
  development --platform ios|android` (or local `expo prebuild` + native build) should run before this
  wave is considered fully build-verified; not run here (no EAS credentials/CI in this environment).
- No `GOOGLE_MAPS_API_KEY` is set anywhere yet — Android maps will render blank until an EAS secret /
  local env var is provisioned. iOS is unaffected (Apple Maps, no key).
- `HomeServiceTrackingScreen` has no REST-polling fallback if the socket fails to connect (mirrors the
  same debt already flagged on the staff side in 7B.4) — acceptable for v1, socket.io reconnects on its
  own in the common case.
- No mobile component test covers the new screen (same "no RTL-for-RN harness in this codebase" gap
  noted for `StaffActiveTripScreen` in 7B.4).

---

## Wave 7B.6 — full-repo verification — DONE 2026-09-12

| check | result |
|-------|--------|
| `pnpm -r typecheck` | ✅ shared-types · backend · web-admin · mobile |
| backend `lint` / `test` | ✅ / **89** (unchanged since 7B.4 — 7B.5 is mobile-only) |
| shared-types `test` | ✅ **8** (unchanged) |
| web-admin `lint` / `test` / `build` | ✅ / **35** (unchanged) / ✅ |
| mobile `lint` / `test` | ✅ / **6** (unchanged — no new unit-testable logic in 7B.5) |
| mobile native-build gate | ⚠️ `expo config --type prebuild --json` ✅ only — see debt below |

**Phase 7B COMPLETE** — On-Demand Home Service + Live GPS Stylist Tracking (Module 29) shipped across
shared-types (schema + view types), backend (matching/travel-fee/socket.io realtime infra reusable by
future M21 chat / M35 chatbot), web-admin (dispatch table), and mobile (staff availability + active-trip
flow, customer live map). Next: Phase 7C (AI camera / AR / chatbot / SaaS billing).

### Carried-forward debt (not silently dropped — needs owner follow-up before a real device rollout)
- **Native build not verified end-to-end.** `react-native-maps` made the mobile app's `expo export`
  gate (used through Phase 7A and 7B.1–7B.4) insufficient — it only bundles JS and can't catch a native
  config-plugin or link failure. Only `expo config --type prebuild --json` ran here (confirms the
  Expo config resolves without error); an actual `eas build --profile development --platform ios|android`
  has not run. This is the single most important item before 7B ships to a real device.
- `GOOGLE_MAPS_API_KEY` is not provisioned anywhere (local env or EAS secret) — Android maps render
  blank until it is. iOS is unaffected (Apple Maps default, no key).
- Foreground-only GPS tracking on the stylist side (7B.4) — background tracking is an explicit
  fast-follow, not attempted (extra "always" location permission + iOS review scrutiny).
- No automatic REST-fallback ping loop on either the staff (7B.4) or customer (7B.5) side if the
  socket disconnects mid-trip — `usePostLocationPing`/socket reconnect is assumed sufficient for v1.
- `assignTrip` admin reassignment (7B.1/7B.3) has web-admin UI but no equivalent audit trail beyond the
  existing generic audit log — not revisited, consistent with other admin-mutation modules.

## Map provider switch — Google/Apple Maps → MapLibre + OpenStreetMap (2026-09-24)
- `react-native-maps` removed; `@maplibre/maplibre-react-native@^10.4.2` added (+ its Expo config plugin
  in `app.config.ts`, + `@types/geojson` dev dep). Fully Google-free on iOS and Android — the
  `android.config.googleMaps` block is gone and **`GOOGLE_MAPS_API_KEY` is no longer needed**.
- `HomeServiceTrackingScreen.tsx` renders an OSM raster style (`MapView mapStyle`), `MarkerView`
  for stylist/destination, `ShapeSource`+`LineLayer` for the dashed route, `Camera.fitBounds` for recenter.
  OSM attribution stays visible (licence requirement).
- Tile URL is config: `EXPO_PUBLIC_MAP_TILE_URL` → `extra.mapTileUrl` → dev default
  `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (`src/config/env.ts`). **Production must point at a
  tile provider (MapTiler/Stadia/etc.) or a self-hosted tile server** — the public OSM tile server's
  usage policy forbids app-scale traffic.
- Verified: mobile typecheck/lint ✅, test 11 ✅, `expo config --type prebuild --json` resolves the
  MapLibre plugin. Still owed: a real `eas build` dev-client rebuild (MapLibre is a native module too).
