# AGENT.md

ຄູ່ມືສຳລັບ AI Agent ທີ່ເຂົ້າມາເຮັດວຽກໃນ repo ນີ້. ອ່ານໄຟລ໌ນີ້ກ່ອນເລີ່ມທຸກໆ task.

## 1. ພາບລວມໂປຣເຈັກ

**Aura Beauty & Clinic Platform** (`abcp`) — ລະບົບຈອງຄິວນັດໝາຍບໍລິການ ແລະ ຈັດການຄລີນິກ/ຮ້ານເສີມສວຍແບບຄົບວົງຈອນ (37 ໂມດູນ), ຮອງຮັບຫຼາຍສາຂາ (multi-tenant) ແລະ ຂາຍຕໍ່ເປັນ SaaS.

**ສະຖານະປັດຈຸບັນ:** Phase 0 (Monorepo Bootstrap) ແລະ Phase 1 (Backend + DB Core) ສ້າງແລ້ວ.
- `packages/` — `config-tsconfig`, `config-eslint`, `shared-types` (Zod + enums, build/test ຜ່ານ).
- `apps/backend/` — Express + Prisma schema folder (8 domain ໄຟລ໌, 37 ໂມດູນ), Auth (Module 01),
  Booking Slot Engine (Module 04), BullMQ registry, storage adapter, seed, openapi skeleton.
- Migration ທຳອິດ `apps/backend/prisma/migrations/20260901071145_init` (55 tables); seed ແລ່ນໄດ້.
- Local DB = **project-local devstack** (`scripts/devstack.sh`, ບໍ່ໃຊ້ Docker/Homebrew/sudo):
  PostgreSQL 16 (prebuilt ຈາກ theseus-rs) + Redis (build source) ຢູ່ `abcp/.devstack/` (gitignored, ~100MB).
  ຄຳສັ່ງ: `pnpm db:setup` (ຄັ້ງທຳອິດ), `pnpm db:up`/`db:down`/`db:status`/`db:psql`.
  `pnpm dev` ມີ `predev` ທີ່ start devstack ໃຫ້ເອງ. ບໍ່ auto-start ຕອນ login → ຫຼັງ reboot `pnpm db:up`.
  role `abcp` / pw `abcp_dev_pw` / db `abcp` + `abcp_test`. Reset: `bash scripts/devstack.sh reset`.
- ຍັງບໍ່ມີ `apps/web-admin`, `apps/mobile` (Phase 2+). ຍັງບໍ່ແມ່ນ git repository.
- ກວດແລ້ວ ✅: `pnpm lint typecheck build`, `pnpm test` (8/8 — unit slot engine + integration auth),
  API boot + `/health` + login JWT.

**ເອກະສານຫຼັກ:** [implementation_plan.md](implementation_plan.md) ຄือ single source of truth — ມີ 37 ໂມດູນ, Master Prisma Schema ຄົບ, ໂຄງສ້າງໂຟນເດີ, design tokens, ແລະ roadmap 7 phase (Phase 0–6). ຢ່າຂັດກັບໄຟລ໌ນີ້; ຖ້າຈະປ່ຽນທິດທາງ ໃຫ້ຖາມ user ກ່ອນ.

## 2. Tech Stack (ຕາມແຜນ)

| ຊັ້ນ | ເຄື່ອງມື |
|------|----------|
| Monorepo | pnpm workspaces + Turborepo (`apps/*`, `packages/*`) |
| Backend | Express.js + TypeScript + Prisma (feature-based domain modules) |
| Database | PostgreSQL 16, Prisma schema folder (`previewFeatures = ["prismaSchemaFolder"]`) |
| Queue/Cache | Redis 7 + BullMQ (reminder, waitlist, scheduler workers) |
| Web Admin | React + Vite + TailwindCSS + Shadcn UI |
| Mobile | React Native (Expo) + NativeWind + Zustand |
| Shared | `packages/shared-types` — Zod schemas + inferred TS types (source of truth ຂອງ type) |
| Infra dev | `docker-compose.yml` (Postgres + Redis), GitHub Actions CI |
| i18n | ລາວ (lo), ໄທ (th), ອັງກິດ (en) — Noto Sans/Serif Lao + Latin font |

## 3. ໂຄງສ້າງໂຟນເດີເປົ້າໝາຍ

```
abcp/
├── packages/
│   ├── shared-types/      # Zod schemas + enums (import ເຂົ້າທຸກ app)
│   ├── config-eslint/
│   └── config-tsconfig/
├── apps/
│   ├── backend/           # Express + Prisma
│   │   ├── prisma/schema/ # split ຕາມ domain: auth, booking, catalog, staff,
│   │   │                  #   inventory, finance, clinical, system
│   │   └── src/           # config/ constants/ modules/ jobs/ mail/
│   │                      #   middlewares/ utils/ app.ts server.ts
│   ├── web-admin/         # React + Vite (pages/ components/ router/ services/ i18n/)
│   └── mobile/            # Expo (screens/ navigation/ components/ store/ theme/ i18n/)
├── docs/adr/              # Architecture Decision Records
├── turbo.json
└── pnpm-workspace.yaml
```

## 4. ຫຼັກການສະຖາປັດຕະຍະກຳ (ຢ່າລະເມີດ)

- **Type source of truth:** ນິຍາມ Zod schema/enum ໃນ `packages/shared-types` ກ່ອນ, ແລ້ວ infer TS type ຈາກມັນ. ຢ່າ duplicate type ໃນ backend ຫຼື frontend.
- **Backend = feature-based domain modules:** ແຕ່ລະໂມດູນ (ໃນ 37) ຢູ່ folder ຂອງຕົນເອງໃນ `src/modules/`, ບໍ່ແມ່ນແຍກຕາມ layer ລ້ວນໆ.
- **Prisma schema splitting:** model ຕ້ອງຢູ່ໄຟລ໌ domain ທີ່ຖືກຕ້ອງໃນ `prisma/schema/`, ບໍ່ແມ່ນໄຟລ໌ດຽວ.
- **Multi-tenant isolation:** ເກือบทุก model ມີ `branchId`. Query/mutation ທຸກອັນຕ້ອງ scope ຕາມ `branchId`.
- **DateTime ບໍ່ແມ່ນ String:** ເວລານັດໝາຍໃຊ້ `startAt`/`endAt` (DateTime) + composite index `[staffProfileId, startAt, endAt]` ສຳລັບ overlap query. ປ້ອງກັນ double-booking ດ້ວຍ DateTime range check + row-level lock.
- **Ledger pattern:** ຍອດເງິນ/ຄະແນນ (loyalty, gift card, stock) ຕ້ອງມີ transaction ledger (`LoyaltyTransaction`, `GiftCardTransaction`, `StockMovement`) — ຢ່າອັບເດດ balance ຊື່ໆໂດຍບໍ່ບັນທຶກ movement.
- **Money:** ໃຊ້ `Decimal(16, 2)`, ບໍ່ແມ່ນ Float. ທຸກ transaction ມີ field `currency` (LAK/THB/USD) + ຕາຕະລາງ `ExchangeRate`.
- **Split tender:** 1 `Payment` → ຫຼາຍ `PaymentTransaction` (ມັດຈຳ + ຄະແນນ + ເງິນສົດ ໃນບິນດຽວ).
- **Soft-delete:** `User`, `StaffProfile`, `Service`, `Branch`, `Product`, `Appointment` ໃຊ້ `deletedAt` / `isActive` — ຢ່າ hard delete; filter `deletedAt: null` ໃນ query ປົກກະຕິ.
- **Background jobs:** ວຽກ async (reminder 24h/1h, waitlist backfill, stock deduction) ຜ່ານ BullMQ worker ໃນ `src/jobs/`, ບໍ່ແມ່ນ inline ໃນ request handler.
- **Audit log:** action ສຳຄັນ (ປ່ຽນລາຄາ, ເບິ່ງຮູບຄົນເຈັບ, export ຂໍ້ມູນລູກຄ້າ) ຕ້ອງບັນທຶກ `AuditLog`.

## 5. Design tokens (web-admin + mobile)

- Concept: *Neo-Luxury Wellness & Medical Aesthetic*.
- Primary: `#4A154B` / `#6B21A8` (Deep Plum / Amethyst).
- Accent: `#D4AF37` / `#E2C799` (Champagne / Soft Gold — badge, ດາວຣີວິວ, ປຸ່ມໄຮໄລ້).
- Background: `#FAFAF9`; Surface: `#FFFFFF` + `shadow-sm`–`shadow-md`.
- Headings: Playfair Display / Plus Jakarta Sans. Body: Inter / Plus Jakarta Sans. ຄູ່ກັບ Noto Sans/Serif Lao ສະເໝີ.
- Transition 150–200ms ease-out; slot selection ໃຊ້ spring; haptic feedback ເທິງ mobile.

## 6. Skills (ບັງຄັບໃຊ້ເມື່ອກ່ຽວຂ້ອງ)

ໃນ `.claude/skills/` ມີ skill ຕິດຕັ້ງໄວ້. ຖ້າ task ໃດແໜ່ງເຂົ້າຂ່າຍ **ຕ້ອງ invoke skill ນັ້ນກ່ອນ** ຈຶ່ງເລີ່ມເຮັດວຽກ (ຖ້າມີໂອກາດແມ່ນແຕ່ 1% ວ່າ skill ຈະຊ່ວຍໄດ້ — ໃຫ້ເອີ້ນ):

- **`ui-ux-pro-max`** — ເອີ້ນທຸກຄັ້ງທີ່ແຕະ UI: ອອກແບບ/ສ້າງ/refactor component ຫຼື page ຂອງ `web-admin` ແລະ `mobile`, ເລືອກສີ/ຟອນ/spacing/layout, ເຮັດ navigation/animation/responsive, chart, accessibility review. ໃຫ້ຄ່າ design tokens ໃນ §5 ຂອງໄຟລ໌ນີ້ເປັນຕົວຕັ້ງ, ແລ້ວໃຊ້ skill ຫາ pattern ເພີ່ມ.
- **`using-superpowers`** — ອະທິບາຍວິທີຄົ້ນ ແລະ ໃຊ້ skill. ອ່ານຕອນເລີ່ມ session ຖ້າບໍ່ແນ່ໃຈວ່າມີ skill ໃດແດ່.

ກ່ອນຂຽນໂຄດ UI ໃດໆ: invoke `ui-ux-pro-max` ก่อน. ຢ່າຂ້າມເພາະຄິດວ່າ "ວຽກນ້ອຍ".

## 7. Workflow ສຳລັບ agent

- ພັດທະນາຕາມລຳດັບ phase: **0 (bootstrap) → 1 (backend + DB core) → 2 (web-admin) → 3 (customer mobile) → 4 (staff mobile) → 5 (finance/marketing) → 6 (AI/SaaS)**.
- ກ່ອນຂຽນໂຄດໂມດູນໃໝ່: ເປີດ `implementation_plan.md` ຫາ spec ຂອງໂມດູນນັ້ນ (§1) ແລະ model ທີ່ກ່ຽວຂ້ອງ (§2).
- ຄຳສັ່ງ (ຫຼັງ Phase 0): `pnpm dev` / `turbo run dev`, `turbo run lint test build`, `pnpm --filter backend prisma migrate dev`.
- ຂຽນ ADR ໃໝ່ໃນ `docs/adr/` ເມື່ອຕັດສິນໃຈເລື່ອງສະຖາປັດຕະຍະກຳ.
- ພາສາ: comment ແລະ doc ໃນ repo ນີ້ຂຽນເປັນພາສາລາວໄດ້ (ຕາມ implementation_plan). ຕອບ user ເປັນພາສາລາວ.

## 8. Testing

- Backend: Jest + Supertest ໃນ `apps/backend/tests/` (`unit/` slot engine + utils, `integration/` auth flow ດ້ວຍ test DB).
- shared-types: ກວດ Zod parse/refine (ເຊັ່ນ regex `^\d{2}:\d{2}$` ສຳລັບເວລາ).
- Database: ກວດ Prisma cascade delete, FK constraint, index performance.
- CI: `turbo run lint test build` ທຸກ PR.
- E2E manual: Admin ສ້າງສາຂາ/ບໍລິການ/ຕາຕະລາງຊ່າງ → ລູກຄ້າຈອງຜ່ານ mobile → ຂໍ້ມູນຂຶ້ນ web-admin ທັນທີ → job reminder/waitlist enqueue → appointment ສຳເລັດ ຕັດ stock ຕາມ BOM.
