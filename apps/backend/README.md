# @abcp/backend

Express + TypeScript + Prisma. ໂຄງສ້າງແບບ feature-based domain module.

## ເລີ່ມໃຊ້ (local)

```bash
# 1. infra
pnpm docker:up                     # Postgres 16 + Redis 7

# 2. env
cp apps/backend/.env.example apps/backend/.env

# 3. prisma
pnpm --filter @abcp/backend db:generate
pnpm --filter @abcp/backend db:migrate      # ສ້າງ migration ທຳອິດ
pnpm --filter @abcp/backend db:seed

# 4. run
pnpm --filter @abcp/backend dev             # API :4000
tsx src/jobs/main.ts                         # worker process (ແຍກ terminal)
```

## ໂຄງສ້າງ

| path | ໜ້າທີ່ |
|------|--------|
| `src/config/` | env, logger, database (Prisma), redis |
| `src/constants/` | error codes, slot granularity |
| `src/middlewares/` | authGuard, roleGuard, validateRequest, errorHandler, rateLimiter |
| `src/utils/` | ApiError, asyncHandler, token (JWT), password (bcrypt), dateHelpers |
| `src/modules/auth/` | Module 01 — register/login/refresh/me |
| `src/modules/booking/` | Module 04 — slot engine + create appointment |
| `src/jobs/` | BullMQ queues + workers (reminder, waitlist) |
| `src/storage/` | local disk adapter (StorageAdapter interface) |
| `src/mail/` | mail transport stub |
| `prisma/schema/` | 8 domain schema files (37 ໂມດູນ) |
| `prisma/seed.ts` | ສາຂາ, admin, ບໍລິການ, ຊ່າງ + working hours, BOM, ລູກຄ້າ |

## ບັນຊີ seed

| role | phone | password |
|------|-------|----------|
| SUPER_ADMIN | 02000000000 | `Admin@12345` |
| BRANCH_ADMIN | 02000000001 | `Manager@12345` |
| STAFF | 02055500001 | `Staff@12345` |
| CUSTOMER | 02099900001 | `Customer@12345` |

## Test

```bash
pnpm --filter @abcp/backend test          # unit (slot engine) + integration (auth, ຕ້ອງມີ DB)
```
