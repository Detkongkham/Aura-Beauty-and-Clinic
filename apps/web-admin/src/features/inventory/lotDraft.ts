/** C5 — ຂໍ້ມູນ lot ທີ່ກຳລັງກອກ (ວັນທີເປັນ 'YYYY-MM-DD' ຫຼື '' = ບໍ່ລະບຸ). */
export interface LotDraft {
  lotNumber: string;
  expiryDate: string;
  mfgDate: string;
}

export const EMPTY_LOT: LotDraft = { lotNumber: '', expiryDate: '', mfgDate: '' };

/** ປ່ຽນ draft ເປັນ payload ທີ່ API ຮັບ (ວັນທີວ່າງ → ບໍ່ສົ່ງ). */
export function lotPayload(d: LotDraft) {
  return {
    lotNumber: d.lotNumber.trim(),
    ...(d.expiryDate ? { expiryDate: d.expiryDate } : {}),
    ...(d.mfgDate ? { mfgDate: d.mfgDate } : {}),
  };
}
