# ADR 0003 — Customer Mobile App (Phase 3)

Status: Accepted · 2026-09-02

## Context

Phase 3 delivers the customer-facing booking app (`implementation_plan.md` §5, Module 05).
Phase 3 Step A already shipped the real backend endpoints (`/catalog/*`, `/staff`,
`/booking/appointments/me` + `:id/{cancel,reschedule,review}`); Step B builds the app that
consumes them.

## Decisions

1. **Expo (SDK 52) + React Native 0.76**, bare TypeScript template. `registerRootComponent`
   entry (`index.ts`), not `expo-router`.
2. **Navigation: React Navigation v7** (`native-stack` + `bottom-tabs`), matching the plan's
   `navigation/` folder. Three-tab shell (Home / Bookings / Profile) behind an auth stack.
3. **Styling: NativeWind v4** with a `tailwind.config.js` that mirrors
   `apps/web-admin/src/index.css` tokens (Sky/Azure primary ramp + Soft Gold accent,
   Playfair Display / Plus Jakarta Sans / Noto Sans Lao). Colours resolved to concrete hex
   (RN has no CSS custom properties); `src/theme/index.ts` is the JS mirror for style props.
   Light mode only, consistent with Phase 2.
4. **Data: TanStack Query v5** over an **axios** instance (`services/http.ts`) with a request
   interceptor for the bearer token and a single-flight `401 → /auth/refresh → retry`
   response interceptor. Bare `authHttp` client for `/auth/*` avoids interceptor recursion.
5. **State: Zustand.** `auth.store` (session, persisted to `expo-secure-store`),
   `ui.store` (language, persisted to `AsyncStorage`), `booking-draft.store` (in-memory
   wizard draft, cleared on success/exit).
6. **Auth = phone + password**, `CUSTOMER` role only. `useAuthBootstrap` reads the persisted
   session on launch and verifies it with `GET /auth/me`; non-CUSTOMER sessions are cleared.
   Register calls `POST /auth/register` (server assigns `CUSTOMER`). Password reset is a stub
   ("contact the store") — no endpoint yet.
7. **Real backend, no mock layer.** Unlike web-admin (MSW / Option A), the mobile app talks
   to the live API so the Web↔Backend↔Mobile verification flow can be proven end to end.
   `EXPO_PUBLIC_API_BASE_URL` (default `http://localhost:4000/api/v1`).
8. **Shared contract via `@abcp/shared-types`** — the Step A view-models
   (`ServiceListItem`, `AppointmentListItem`, `Paginated<T>`, …) are imported directly; no
   local `types/models.ts` duplication.
9. **i18n: i18next**, `lo` default (device locale via `expo-localization`), `en` secondary.
   Backend error `code`s map to `errors.<CODE>` keys (`DOUBLE_BOOKING`, `SLOT_UNAVAILABLE`, …).
10. **Booking Wizard = 3 native-stack screens** (`WizardService` → `WizardDateTime` →
    `WizardConfirm`) sharing `booking-draft.store`; the same flow, entered at step 2 with
    `mode: 'reschedule'`, drives `PATCH /booking/appointments/:id/reschedule`.

## Consequences

- Metro needs monorepo config (`watchFolders` + `nodeModulesPaths` + `disableHierarchicalLookup`).
- `package.json` stays CommonJS (Expo tooling requirement) → ESLint flat config lives in
  `eslint.config.mjs`.
- No simulator in CI here; `pnpm --filter @abcp/mobile lint/typecheck/test` is the gate.
  Store/format logic has vitest unit coverage; RN component/e2e testing deferred.
- Icons/splash use Expo defaults (`assets/` is a placeholder) until brand art is added.

## Status updates

- **2026-09-10** — manual device run performed by the maintainer (screens render, navigation
  and live API against the local backend verified by hand). The CI gate is unchanged
  (lint/typecheck/test + `expo export`); on-device is a manual step on this setup.
- **2026-09-10** — cross-app E2E now covered by an automated backend test
  (`tests/integration/appointments-admin.test.ts`): a customer books via
  `POST /booking/appointments/me`, the reminder job is enqueued, and the appointment is
  visible through the new admin endpoints `GET /appointments` + `/appointments/calendar`
  + `GET /appointments/:id`, status changeable via `PATCH /appointments/:id/status`.
  web-admin still runs on MSW (`VITE_ENABLE_MOCKS=true`); pointing it at these real
  endpoints is the remaining Phase-2 backend-catch-up step (needs real admin auth + the
  rest of the admin endpoints).
- **2026-09-10** — brand icon / adaptive icon / splash / favicon generated from
  `assets/brand-logo.png` and wired into `app.json` (no longer Expo defaults).
- **2026-09-10** — profile edit + change password are now real: `PATCH /auth/me` and
  `POST /auth/change-password` on the backend (covered in `tests/integration/auth.test.ts`),
  consumed by `ProfileEditSheet` / `ChangePasswordSheet` on `ProfileScreen`. Password
  reset (logged-out) is still a stub — no endpoint. Promo banner + notifications screen +
  OAuth/biometric remain Phase 5.
