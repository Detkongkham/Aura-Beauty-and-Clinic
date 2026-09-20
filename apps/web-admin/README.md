# @abcp/web-admin

Web Admin Portal for the Aura Beauty & Clinic Platform — **Phase 2** of the roadmap
(`implementation_plan.md` §5).

## Stack

| Concern | Choice |
| --- | --- |
| Build / dev | Vite 6 + React 18 + TypeScript |
| Styling | Tailwind CSS 3 + design tokens from [`docs/design.md`](../../docs/design.md) |
| Components | shadcn-style (Radix primitives + `class-variance-authority`), `cn()` helper |
| Routing | React Router 7 (data router) — added in step 3 |
| Server state | TanStack Query 5 |
| Client state | Zustand (UI prefs only) |
| Forms | React Hook Form + Zod (`@abcp/shared-types`) |
| i18n | i18next + react-i18next — `lo` (default) + `en` |
| API mocking | MSW 2 (browser for dev, node for tests) — **Option A** while backend endpoints are built |
| Tests | Vitest + Testing Library + jsdom |

## Scripts

```bash
pnpm --filter @abcp/web-admin dev        # http://localhost:5173  (MSW on by default)
pnpm --filter @abcp/web-admin build      # tsc -b && vite build
pnpm --filter @abcp/web-admin lint
pnpm --filter @abcp/web-admin typecheck
pnpm --filter @abcp/web-admin test
```

Or from the repo root via Turbo: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`.

## Environment

Copy `.env.example` → `.env.local`. Set `VITE_ENABLE_MOCKS=false` to hit the real backend
(`@abcp/backend` on `http://localhost:4000/api/v1`; its `CORS_ORIGINS` already allows `:5173`).

## Layout (target — filled over steps 3–5)

```
src/
  app/          providers (Query, i18n, Router, Toaster)
  router/       route table, ProtectedRoute, RoleRoute
  config/       env.ts, feature flags
  lib/          utils (cn), queryClient, rbac, formatters (currency/date)
  components/
    ui/         shadcn primitives
    layout/     AppShell, Sidebar, Topbar, PageHeader, BranchSwitcher
    shared/     DataTable, StatCard, EmptyState, ConfirmDialog, StatusPill
  features/     auth, dashboard, calendar, appointments, queue, services,
                staff, customers, branches, users-roles, settings, account,
                notifications, search, reports
  i18n/         setup + locales/{lo,en}.json
  mocks/        handlers, browser, server, fixtures/
  store/        Zustand UI slices
  test/         setup + test utils
```

## Design workflow

Every non-trivial page/component is gated by the `ui-ux-pro-max` skill — see
[`docs/design.md`](../../docs/design.md) §0 and
[`design-system/aura-admin/MASTER.md`](../../design-system/aura-admin/MASTER.md).
