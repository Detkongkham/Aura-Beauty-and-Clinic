/**
 * One-off: ເລື່ອນນັດອະນາຄົດທີ່ຖືກບັນທຶກແບບ "wall-clock UTC" (ກ່ອນແກ້ slot engine ໃຫ້ອ່ານເວລາວຽງຈັນ) −7 ຊມ.
 *
 * ກ່ອນແກ້: working hour 09:00 → slot 09:00Z (= 16:00 ວຽງຈັນ). ຫຼັງແກ້: 09:00 ວຽງຈັນ = 02:00Z.
 * ຂໍ້ມູນປົນກັນ (walk-in / seed-bulk ບັນທຶກ instant ຖືກຢູ່ແລ້ວ) → ເລື່ອນສະເພາະແຖວທີ່ "ແນ່ນອນ":
 *   ONLINE/ADMIN · PENDING/CONFIRMED · startAt > now ·
 *   ເວລາ UTC ຢູ່ໃນ working hours ຂອງຊ່າງ (dow UTC) ແຕ່ ເວລາວຽງຈັນ ບໍ່ຢູ່ (dow ວຽງຈັນ).
 * ແຖວທີ່ທັງສອງແບບຢູ່ໃນ working hours = ບໍ່ແນ່ນອນ → ລາຍງານ, ບໍ່ແຕະ.
 *
 *   pnpm tsx scripts/fix-appointment-timezone.ts            # dry-run
 *   pnpm tsx scripts/fix-appointment-timezone.ts --apply    # ບັນທຶກຈິງ
 */
import { prisma } from '../src/config/database.js';
import {
  minutesOfDayVientiane,
  timeStringToMinutes,
  vientianeDayOfWeek,
} from '../src/utils/dateHelpers.js';

const APPLY = process.argv.includes('--apply');
const SHIFT_MS = 7 * 3_600_000;

type Wh = { dayOfWeek: number; startTime: string; endTime: string; isDayOff: boolean };

function inHours(whs: Wh[], dow: number, startMin: number, durMin: number): boolean {
  const wh = whs.find((w) => w.dayOfWeek === dow);
  if (!wh || wh.isDayOff) return false;
  return startMin >= timeStringToMinutes(wh.startTime) && startMin + durMin <= timeStringToMinutes(wh.endTime);
}

const now = new Date();
const rows = await prisma.appointment.findMany({
  where: {
    deletedAt: null,
    source: { in: ['ONLINE', 'ADMIN'] },
    status: { in: ['PENDING', 'CONFIRMED'] },
    startAt: { gt: now },
  },
  select: {
    id: true,
    startAt: true,
    endAt: true,
    staffProfile: { select: { workingHours: { select: { dayOfWeek: true, startTime: true, endTime: true, isDayOff: true } } } },
  },
});

const shift: typeof rows = [];
const ambiguous: typeof rows = [];
for (const a of rows) {
  const whs = a.staffProfile.workingHours;
  const dur = Math.round((a.endAt.getTime() - a.startAt.getTime()) / 60_000);
  const asUtcWallClock = inHours(whs, a.startAt.getUTCDay(), a.startAt.getUTCHours() * 60 + a.startAt.getUTCMinutes(), dur);
  const asLocal = inHours(whs, vientianeDayOfWeek(a.startAt), minutesOfDayVientiane(a.startAt), dur);
  if (asUtcWallClock && !asLocal) shift.push(a);
  else if (asUtcWallClock && asLocal) ambiguous.push(a);
}

console.log(`future ONLINE/ADMIN active: ${rows.length}`);
console.log(`→ shift −7h: ${shift.length}`);
console.log(`→ ambiguous (left untouched): ${ambiguous.length}`, ambiguous.map((a) => `${a.id} ${a.startAt.toISOString()}`));
console.log(`→ already local / other: ${rows.length - shift.length - ambiguous.length}`);

if (APPLY && shift.length > 0) {
  await prisma.$transaction(
    shift.map((a) =>
      prisma.appointment.update({
        where: { id: a.id },
        data: { startAt: new Date(a.startAt.getTime() - SHIFT_MS), endAt: new Date(a.endAt.getTime() - SHIFT_MS) },
      }),
    ),
  );
  console.log(`applied: ${shift.length} appointments shifted`);
} else if (!APPLY) {
  console.log('dry-run — pass --apply to write');
}
await prisma.$disconnect();
