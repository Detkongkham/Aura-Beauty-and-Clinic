/**
 * Wave 10A (ອຸດ C3) — UUID ຕໍ່ "ການກົດ 1 ຄັ້ງ" ສົ່ງເປັນ header `Idempotency-Key` ໃສ່ທຸກ POST
 * ການເງິນ. Hermes ບໍ່ຮັບປະກັນວ່າມີ `crypto.randomUUID` ຢູ່ທຸກ runtime — ໃຊ້ Math.random v4 ແທນ
 * ເພາະບໍ່ຕ້ອງການຄວາມແໜ້ນໜາລະດັບ cryptographic, ພຽງແຕ່ unique ພໍ.
 */
export function newIdempotencyKey(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
