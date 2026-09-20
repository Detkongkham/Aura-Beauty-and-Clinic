# ADR 0001: Monorepo Bootstrap (pnpm workspaces + Turborepo)

- Status: Accepted
- Date: 2026-09-01

## Context

Aura Beauty & Clinic Platform (`abcp`) ປະກອບດ້ວຍ backend (Express + Prisma), web-admin
(React + Vite) ແລະ mobile (Expo) ທີ່ຕ້ອງ share type ດຽວກັນ (37 ໂມດູນ, Prisma schema
ຄົບ). ຕ້ອງການ single source of truth ຂອງ type ແລະ pipeline ດຽວສຳລັບ lint/test/build.

## Decision

- ໃຊ້ **pnpm workspaces** (`apps/*`, `packages/*`) + **Turborepo** ເປັນ task runner.
- `packages/shared-types` = source of truth ຂອງ Zod schema + inferred TS type.
- `packages/config-tsconfig` + `packages/config-eslint` = config ໃຊ້ຮ່ວມ.
- Local infra ຜ່ານ `docker-compose.yml` (PostgreSQL 16 + Redis 7).
- CI: `.github/workflows/ci.yml` — install → db:generate → migrate → lint → typecheck → test → build.

## Consequences

- ທຸກ app import type ຈາກ `@abcp/shared-types` ເທົ່ານັ້ນ — ຫ້າມ duplicate type.
- Prisma client ຖືກ generate ກ່ອນ `build`/`test` (ຜ່ານ `db:generate` dependsOn).
- ຕ້ອງມີ Docker running ສຳລັບ migrate/seed/integration test ໃນ local.
