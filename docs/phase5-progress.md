# Phase 5 — Finance, Marketing & Notifications — Progress

Source of truth for scope: [implementation_plan.md](../implementation_plan.md) §Phase 5 (line ~1452).
5 roadmap items → mapped to modules 08, 10, 13, 19, 20, 23, 24.

## Status legend
- [ ] not started  · [~] in progress  · [x] done  · [!] blocked

---

## Wave 1 — Backend + shared-types

### shared-types (`packages/shared-types/src/`)
- [x] `payment.schema.ts` — split tender, deposit rate, QR intent, views
- [x] `loyalty.schema.ts` — earn/redeem, tier thresholds, account + ledger views
- [x] `giftcard.schema.ts` — issue / redeem / balance, views
- [x] `notification.schema.ts` — push device register, list, mark read, prefs
- [x] `marketing.schema.ts` — campaign CRUD, trigger rule, recipient views
- [x] `waitlist.schema.ts` — join / leave / my-entries
- [x] add all to `index.ts`

### Prisma
- [x] `PushDevice` model (finance? no → `system.prisma`) + migration `20260910130000_phase5_push_devices`
- [x] `LoyaltyTier` thresholds are app-config, not schema

### Backend modules (`apps/backend/src/modules/`)
- [x] `payments/` — create payment, add tenders (split), deposit intent (BCEL mock + Stripe mock), get, admin list — Module 08
- [x] `loyalty/` — my account, ledger, earn hook, redeem, tier recompute — Module 19
- [x] `gift-cards/` — issue, my cards, lookup by code, redeem (ledger) — Module 13
- [x] `notifications/` — register/unregister push device, extends system notifications — Module 23
- [x] `marketing/` — campaign CRUD + manual run + recipients — Module 24
- [x] `waitlist/` — join, leave, my entries — Module 20
- [x] `queue/` — `POST /queue/check-in` QR check-in — Module 10

### Services / infra
- [x] `src/services/push.ts` — Expo push adapter (fetch to exp.host, no dep) + `sendToUser()`
- [x] `src/services/payments/gateway.ts` — `bcelMockQr()`, `stripeMockCharge()`
- [x] `src/constants/phase5.ts` — deposit rates, loyalty tiers, earn rate

### Jobs (`apps/backend/src/jobs/`)
- [x] `reminder.job.ts` — real: NotificationLog + Expo push, 24h/1h dedupe
- [x] `waitlist.job.ts` — real: notify candidates, keep entries
- [x] `marketing.job.ts` + repeatable queue — birthday / win-back daily sweep
- [x] `queues.ts` — add `marketingQueue`, scheduler bootstrap
- [x] `worker.ts` — register marketing worker

### Wiring
- [x] booking `cancelAppointment` → enqueue `waitlistQueue`
- [x] appointment `COMPLETED` (staff-portal + appointments) → loyalty EARN + ensure Payment
- [x] `routes.ts` — mount payments, loyalty, gift-cards, marketing, waitlist routers

---

## Wave 1 — VERIFIED
- `pnpm --filter backend typecheck` ✅  `lint` ✅  `test` ✅ (53 pass, incl. new `tests/integration/phase5-finance.test.ts`)
- migration `20260910130000_phase5_push_devices` applied to local DB
- New API surface (all under `/api/v1`):
  - `POST /payments`, `GET /payments`, `GET /payments/summary`, `GET /payments/:id`,
    `GET /payments/by-appointment/:id`, `POST /payments/:id/deposit-intent`,
    `POST /payments/:id/settle-mock`, `POST /payments/:id/tenders`
  - `GET /loyalty/me`, `GET /loyalty/me/ledger`, `GET /loyalty/accounts`, `POST /loyalty/accounts/:userId/adjust`
  - `POST /gift-cards`, `GET /gift-cards/me`, `GET /gift-cards/lookup`, `GET /gift-cards`
  - `POST /marketing/campaigns` (+GET/PATCH/DELETE), `GET .../recipients`, `POST .../:id/run`
  - `POST /waitlist`, `GET /waitlist/me`, `DELETE /waitlist/:id`
  - `POST /notifications/devices`, `DELETE /notifications/devices`
  - `POST /queue/check-in`

## Wave 2 — Web Admin (`apps/web-admin/src/features/`)
Route access: reuse `reports:view` for read; write buttons shown to admin roles (backend already role-guards).
Replace `ComingSoonPage` for `ROUTES.finance` + `ROUTES.marketing`; add `ROUTES.loyalty`, `ROUTES.giftCards`.
- [ ] `finance/FinancePage.tsx` — summary tiles (gross/deposits/outstanding) + payments table + method breakdown + CSV
- [ ] `finance/PaymentDetailDrawer.tsx` — tenders timeline
- [ ] `loyalty/LoyaltyPage.tsx` — accounts + tiers + manual adjust dialog
- [ ] `marketing/CampaignsPage.tsx` — CRUD + run + recipients drawer
- [ ] `giftcards/GiftCardsPage.tsx` — issue dialog + list + balance lookup
- [ ] `*.api.ts` per feature (axios `http` + react-query), nav-items entries, i18n lo/en

## Wave 2 — Web Admin — DONE & verified
`pnpm --filter web-admin typecheck` ✅ `lint` ✅ `test` ✅ (31 pass)
- `features/finance/` — FinancePage (KPI tiles, method breakdown, table, CSV) + PaymentDetailSheet + finance.api/lib
- `features/loyalty/` — LoyaltyPage (accounts, tiers, adjust dialog) + loyalty.api
- `features/marketing/` — CampaignsPage + CampaignFormDialog + RecipientsSheet + marketing.api
- `features/giftcards/` — GiftCardsPage (list, balance lookup, issue dialog) + giftcards.api
- router: replaced ComingSoon for `/finance` + `/marketing`; added `/loyalty` + `/gift-cards` (paths.ts, index.tsx)
- nav-items: new `financeMarketing` group · i18n lo+en merged (no Thai contamination)

## Wave 3 — Mobile — DONE & verified
`pnpm --filter mobile typecheck` ✅ `lint` ✅ `test` ✅ (5 pass). Added deps: `expo-notifications` 0.29.14, `expo-device` 7.0.3.
- `lib/push.ts` — Expo token register/unregister; wired into `useAuth` login/register/logout
- `features/loyalty/loyalty.api.ts`, `features/giftcards/giftcards.api.ts`, `features/waitlist/waitlist.api.ts`
- `screens/profile/LoyaltyScreen.tsx` — points hero, tier progress, paginated ledger
- `screens/profile/GiftCardsScreen.tsx` — card list (copy code) + issue sheet
- `ProfileScreen` — real loyalty points/tier (was placeholder `LOYALTY` const); new Rewards section → Loyalty / Gift cards
- `WizardDateTimeScreen` — `WaitlistCta` shown when a day has zero slots
- nav: `Loyalty` + `GiftCards` in `AppStackParamList` + `AppNavigator` · i18n lo+en merged

## Wave 4 — follow-ups — DONE & verified
All 3 apps + shared-types: typecheck ✅ lint ✅ test ✅
- [x] **Mobile deposit/checkout** — `react-native-svg` + `react-native-qrcode-svg` added; `features/payments/payments.api.ts`; `screens/booking/PaymentScreen.tsx` (open bill → BCEL One QR intent → scan QR → "I've paid" `settle-mock` → confirmed state); `Payment` in `AppStackParamList`/`AppNavigator`; CTA in `BookingSuccessScreen` footer (create bookings with an appointmentId); i18n `payment.*` + `success.payDeposit` lo+en.
- [x] **`app.json`** — `expo-notifications` plugin (icon `adaptive-icon.png`, color `#7C3AED`, `defaultChannel: default`); `lib/push.ts` now passes `Constants…eas.projectId` to `getExpoPushTokenAsync` when present. Real device push still needs `eas init` (projectId) + APNs key / FCM `google-services.json` — outside app.json, done via EAS credentials.
- [x] **RBAC** — added `finance:view`/`finance:manage`/`marketing:view`/`marketing:manage` to `PERMISSIONS` + `BRANCH_ADMIN_PERMISSIONS` (SUPER_ADMIN gets all automatically); web-admin routes now gate finance/loyalty/gift-cards on `finance:view` and marketing on `marketing:view`; nav-items updated; `permissionGroups.ts` + `users.permissionGroup.{finance,marketing}` i18n so the permission matrix shows the new rows.

## Wave 5 — final follow-ups — DONE & verified
All apps + shared-types: typecheck ✅ lint ✅ test ✅ (backend 54 — added split-tender integration case)
- [x] **Seed** — `prisma/seed.ts` upserts `AppSetting` `finance.depositRate = 0.2` + 8 `NotificationTemplate` rows (reminder 24h/1h, waitlist, receipt, loyalty, gift card, birthday, win-back). `pnpm db:seed` run.
- [x] **EAS scaffolding** — `apps/mobile/eas.json` (development/preview/production profiles) + `apps/mobile/PUSH_SETUP.md` (exact `eas init` / `eas credentials` / `EXPO_ACCESS_TOKEN` steps). Real projectId + APNs/FCM keys still require the owner's Expo/Apple/Firebase accounts — cannot be provisioned from here.
- [x] **Mobile split-tender / full payment** — `PaymentScreen` now has a `Deposit (QR)` / `Pay in full` segmented toggle; full mode is a split-tender editor (loyalty points + gift card + cash-at-store, auto-balancing) → `POST /payments/:id/tenders` → FULLY_PAID state. `useAddTenders` in `payments.api.ts`; i18n `payment.*` lo+en.

## Note — "UI renders as plain text" after this session
Adding native deps mid-session (`react-native-svg`, `react-native-qrcode-svg`, `expo-notifications`,
`expo-device`) desyncs Metro's transform cache → NativeWind classes silently no-op (see
[[mobile-nativewind-global-css]]). **Fix: restart Metro with a clean cache** —
`pnpm --filter mobile start --clear` (or in `apps/mobile`: `npx expo start -c`).
Verified: `npx expo export` for **both** ios+android bundles cleanly; `expo-doctor` only flags a
pre-existing `react-native 0.76.6→0.76.9` minor. `src/lib/push.ts` was also changed to lazy-`require`
the native modules inside the function (out of the startup graph).

## Truly remaining (needs the owner's external accounts, not code)
- [ ] `eas init` to write a real `extra.eas.projectId`, and `eas credentials` for APNs key / FCM `google-services.json`.
- [ ] Set `EXPO_ACCESS_TOKEN` in `apps/backend/.env` for live push delivery.

---

## Notes / decisions
- Deposit rate: default 20%, admin-configurable 20–50% via `AppSetting` key `finance.depositRate`.
- Loyalty earn: 1 point per 10,000 LAK of `Payment.totalAmount` on COMPLETED. Tiers: SILVER 0 / GOLD 500 / PLATINUM 2000 lifetime earned points.
- Gateways are **mock** (no real BCEL/Stripe network). QR payload is a signed-ish opaque string; `POST /payments/:id/settle-mock` marks it paid (dev/demo).
- Push: Expo push API is called with plain `fetch`; no `expo-server-sdk` dependency added. Fails silently if `EXPO_ACCESS_TOKEN` unset — logs only.
