# ADR 0002: Backend Foundation (Phase 1)

- Status: Accepted
- Date: 2026-09-01

## Context

Phase 1 ວາງຮາກຖານ backend: Express + Prisma (schema splitting), Auth (Module 01),
Booking Slot Engine (Module 04), BullMQ registry, storage adapter, openapi skeleton.

## Decisions

1. **ESM + NodeNext.** ທຸກ import ພາຍໃນໃຊ້ນາມສະກຸນ `.js` (TS ESM convention).
2. **Prisma schema folder** (`prisma/schema/*.prisma`) ແຍກ 8 domain ໄຟລ໌
   (auth, staff, catalog, booking, finance, clinical, inventory, system).
   enum ວາງໄວ້ໃນ domain ໄຟລ໌ທີ່ໃຊ້ຫຼັກ.
3. **Double-booking prevention** = `$transaction` (Serializable) + `SELECT … FOR UPDATE`
   raw query ເທິງຄິວທີ່ຊ້ອນ (staff/room/equipment) ແລ້ວ re-validate ຜ່ານ slot engine.
4. **Slot engine เป็น pure function** (`slotEngine.ts`) — ບໍ່ແຕະ DB, ທົດສອບໄດ້ 100%.
   ໃຊ້ half-open interval `[start, end)`, granularity 15 ນາທີ (ໃນ `constants`).
5. **JWT stateless refresh** ຊົ່ວຄາວ (ຍັງບໍ່ມີ `RefreshToken` model). TODO Phase 5:
   ເກັບ `jti` + rotation/blacklist ໃນ Redis ຫຼື table ໃໝ່.
6. **Time-of-day** ເກັບເປັນ string `"HH:MM"` (WorkingHour); slot engine ຕີຄວາມເປັນ
   UTC wall-clock. ຖ້າຮອງຮັບ timezone ຫຼາຍເຂດ ໃຫ້ເພີ່ມ `Branch.timezone` ພາຍຫຼັງ.
7. **BullMQ** — `src/jobs/queues.ts` = producer registry ດຽວ; worker ແລ່ນ process ແຍກ
   (`src/jobs/main.ts`). Job handler ຕອນນີ້ເປັນ stub (log only).

## Consequences

- Integration test ຕ້ອງມີ PostgreSQL; unit test (slot engine, shared-types) ບໍ່ຕ້ອງ.
- `pnpm db:generate` ຕ້ອງແລ່ນກ່ອນ typecheck/build (turbo `dependsOn`).
