-- Wave 10A (ອຸດ H5) — ກັນ earnPoints() ໃຫ້ຄະແນນຊ້ຳ (refId ດຽວກັນ) ຈາກ 2+ call site ຮ່ວມກັນ.
-- Partial index (ສະເພາະ type='EARN') ເພາະ REDEEM/ADJUST refId ບໍ່ຈຳເປັນຕ້ອງບັງຄັບ unique ແບບດຽວກັນ.
CREATE UNIQUE INDEX "loyalty_transactions_earn_ref_unique"
  ON "loyalty_transactions" ("loyaltyAccountId", "refId")
  WHERE "type" = 'EARN' AND "refId" IS NOT NULL;
