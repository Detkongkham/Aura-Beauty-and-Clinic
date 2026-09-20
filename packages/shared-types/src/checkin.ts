/**
 * QR Check-in ໜ້າຮ້ານ (Module 10) — ຮູບແບບ payload ຂອງ QR ສາຂາ + ຊ່ວງເວລາທີ່ check-in ໄດ້.
 * ໃຊ້ຮ່ວມກັນ: web-admin (ສ້າງ/ພິມ QR), mobile (ສະແກນ), backend (`POST /queue/check-in`).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ສາມາດ check-in ໄດ້ກ່ອນເວລານັດບໍ່ເກີນ 24 ຊມ. ແລະ ຫຼັງເວລານັດບໍ່ເກີນ 4 ຊມ. */
export const CHECK_IN_OPENS_BEFORE_MS = 24 * 3_600_000;
export const CHECK_IN_CLOSES_AFTER_MS = 4 * 3_600_000;

/** payload ຂອງ QR ສາຂາ — `aura://check-in?branch=<uuid>`. */
export function buildBranchCheckInPayload(branchId: string): string {
  return `aura://check-in?branch=${branchId}`;
}

/** ອ່ານ branchId ຈາກຂໍ້ຄວາມທີ່ສະແກນໄດ້. ຮັບທັງ payload ເຕັມ ແລະ uuid ເປົ່າ; ອື່ນໆ → null. */
export function parseBranchCheckInPayload(raw: string): string | null {
  const text = raw.trim();
  if (UUID_RE.test(text)) return text.toLowerCase();
  const m = /^aura:\/\/check-in\?(?:.*&)?branch=([^&\s]+)/i.exec(text);
  const id = m?.[1] ? decodeURIComponent(m[1]) : null;
  return id && UUID_RE.test(id) ? id.toLowerCase() : null;
}

export type CheckInWindowState = 'too-early' | 'open' | 'closed';

/** ສະຖານະຊ່ວງ check-in ຂອງນັດ ທຽບກັບເວລາປັດຈຸບັນ. */
export function checkInWindow(startAt: string | Date, now: number = Date.now()): CheckInWindowState {
  const start = new Date(startAt).getTime();
  if (start - now > CHECK_IN_OPENS_BEFORE_MS) return 'too-early';
  if (now - start > CHECK_IN_CLOSES_AFTER_MS) return 'closed';
  return 'open';
}
