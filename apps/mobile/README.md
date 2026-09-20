# @abcp/mobile — Aura Customer App

React Native (Expo SDK 52) customer-facing booking app. Phase 3, Module 05.

## Run

```bash
pnpm db:up                       # from repo root — Postgres + Redis
pnpm --filter @abcp/backend dev  # API on :4000  (pnpm db:seed once for content)
pnpm --filter @abcp/mobile start # Expo dev server → press i / a, or scan in Expo Go
```

Point the app at a non-localhost API when using a real device:

```bash
EXPO_PUBLIC_API_BASE_URL=http://<your-lan-ip>:4000/api/v1 pnpm --filter @abcp/mobile start
```

Seeded customer login: phone `02099900001`, password `Customer@12345`.

## Checks

```bash
pnpm --filter @abcp/mobile lint
pnpm --filter @abcp/mobile typecheck
pnpm --filter @abcp/mobile test
```

## Layout

```
src/
  config/      env (EXPO_PUBLIC_API_BASE_URL), DEFAULT_BRANCH_ID
  theme/       JS mirror of tailwind tokens (Sky/Azure + Soft Gold, light only)
  i18n/        i18next — lo (default) / en
  navigation/  Root → Auth stack | App stack (Tabs + detail + wizard)
  store/       auth (secure-store) · ui (async-storage) · booking-draft (memory)
  services/    http (axios + 401 refresh) · apiError · queryKeys
  components/  ui/ primitives · shared/ (Screen, StatusPill, state views)
  features/    auth · catalog · booking · appointments  (query/mutation hooks + widgets)
  screens/     auth · home · catalog · booking (3-step wizard) · appointments · profile
```

Backend contract: `apps/backend/openapi.yaml` + `@abcp/shared-types`.
