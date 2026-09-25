/**
 * H7 (inventory 9D) — ຈອງ consumable ໃຫ້ນັດ CONFIRMED/IN_PROGRESS ທີ່ມີຢູ່ກ່ອນເປີດໃຊ້ຄຸນສົມບັດນີ້ (idempotent;
 * job reorder-point ທຸກຄືນກໍເຮັດອັນດຽວກັນ). ໃຊ້: `pnpm tsx scripts/backfill-stock-reservations.ts`
 */
import { prisma } from '../src/config/database.js';
import { backfillReservations } from '../src/modules/inventory/reservation.service.js';

const res = await backfillReservations();
console.log('stock reservations backfill:', res);
await prisma.$disconnect();
