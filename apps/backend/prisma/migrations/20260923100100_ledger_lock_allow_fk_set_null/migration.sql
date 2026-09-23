-- ຂໍ້ຈຳກັດ 10C (ຕໍ່) — (1) ຫ້າມ INSERT ລາຍການຮັບເງິນທີ່ createdAt ຕົກໃນກະທີ່ປິດແລ້ວ ໂດຍບໍ່ມີຊ່ວງຜ່ອນຜັນ
-- (createdAt ແລະ closedAt ມາຈາກໂມງຂອງ app ດຽວກັນ). (2) ການລຶບແຖວທີ່ອ້າງອີງ (ບັດຂອງຂວັນ/ບັນຊີຄະແນນ/ແພັກເກັດ/ກຸ່ມຈອງ/ບັນຊີທະນາຄານ) ມີ FK `ON DELETE SET NULL`
-- ເຊິ່ງ Postgres ເຮັດເປັນ UPDATE ໃສ່ແຖວທີ່ລັອກ. ອະນຸຍາດສະເພາະ "ປ່ຽນເປັນ NULL" (referential action); ການປ່ຽນໄປຄ່າອື່ນຍັງຖືກຫ້າມ.

CREATE OR REPLACE FUNCTION abcp_fk_changed(old_v TEXT, new_v TEXT) RETURNS boolean AS $$
  SELECT new_v IS NOT NULL AND new_v IS DISTINCT FROM old_v;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION abcp_lock_issued_payment() RETURNS trigger AS $$
BEGIN
  IF OLD."invoiceNo" IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW."invoiceNo" IS DISTINCT FROM OLD."invoiceNo"
     OR NEW."totalAmount" IS DISTINCT FROM OLD."totalAmount"
     OR NEW."depositAmount" IS DISTINCT FROM OLD."depositAmount"
     OR NEW."currency" IS DISTINCT FROM OLD."currency"
     OR NEW."branchId" IS DISTINCT FROM OLD."branchId"
     OR abcp_fk_changed(OLD."appointmentId", NEW."appointmentId")
     OR abcp_fk_changed(OLD."bookingGroupId", NEW."bookingGroupId")
     OR NEW."vatRate" IS DISTINCT FROM OLD."vatRate"
     OR NEW."vatMode" IS DISTINCT FROM OLD."vatMode"
     OR NEW."taxAmount" IS DISTINCT FROM OLD."taxAmount"
     OR NEW."netAmount" IS DISTINCT FROM OLD."netAmount"
     OR NEW."paidAt" IS DISTINCT FROM OLD."paidAt"
     OR NEW."voidedAt" IS DISTINCT FROM OLD."voidedAt" THEN
    RAISE EXCEPTION 'LEDGER_LOCKED: invoice % is issued and cannot be modified (use a credit note)', OLD."invoiceNo";
  END IF;
  IF NEW."paymentStatus" IS DISTINCT FROM OLD."paymentStatus" AND NEW."paymentStatus" <> 'REFUNDED' THEN
    RAISE EXCEPTION 'LEDGER_LOCKED: invoice % status can only move to REFUNDED', OLD."invoiceNo";
  END IF;
  IF NEW."refundedAmount" < OLD."refundedAmount" THEN
    RAISE EXCEPTION 'LEDGER_LOCKED: invoice % refundedAmount cannot decrease', OLD."invoiceNo";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION abcp_lock_payment_tx() RETURNS trigger AS $$
DECLARE
  inv TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF abcp_tx_in_closed_shift(NEW."paymentId", NEW."createdAt") THEN
      RAISE EXCEPTION 'LEDGER_LOCKED: cannot back-date a payment transaction into a closed cash-drawer shift';
    END IF;
    RETURN NEW;
  END IF;

  SELECT "invoiceNo" INTO inv FROM "payments" WHERE "id" = OLD."paymentId";
  IF inv IS NULL AND NOT abcp_tx_in_closed_shift(OLD."paymentId", OLD."createdAt") THEN
    RETURN NEW;
  END IF;
  IF NEW."paymentId" IS DISTINCT FROM OLD."paymentId"
     OR NEW."method" IS DISTINCT FROM OLD."method"
     OR NEW."amount" IS DISTINCT FROM OLD."amount"
     OR NEW."currency" IS DISTINCT FROM OLD."currency"
     OR abcp_fk_changed(OLD."giftCardId", NEW."giftCardId")
     OR abcp_fk_changed(OLD."loyaltyAccountId", NEW."loyaltyAccountId")
     OR abcp_fk_changed(OLD."userPackageId", NEW."userPackageId")
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR (OLD."status" = 'SUCCESS' AND NEW."status" IS DISTINCT FROM OLD."status") THEN
    RAISE EXCEPTION 'LEDGER_LOCKED: payment transaction % belongs to an issued invoice or closed shift', OLD."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION abcp_lock_issued_refund() RETURNS trigger AS $$
BEGIN
  IF OLD."creditNoteNo" IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW."creditNoteNo" IS DISTINCT FROM OLD."creditNoteNo"
     OR NEW."paymentId" IS DISTINCT FROM OLD."paymentId"
     OR NEW."amount" IS DISTINCT FROM OLD."amount"
     OR NEW."storeCreditAmount" IS DISTINCT FROM OLD."storeCreditAmount"
     OR NEW."taxAmount" IS DISTINCT FROM OLD."taxAmount"
     OR NEW."allocations"::text IS DISTINCT FROM OLD."allocations"::text
     OR NEW."status" IS DISTINCT FROM OLD."status"
     OR NEW."method" IS DISTINCT FROM OLD."method"
     OR NEW."paidAt" IS DISTINCT FROM OLD."paidAt"
     OR abcp_fk_changed(OLD."bankAccountId", NEW."bankAccountId") THEN
    RAISE EXCEPTION 'LEDGER_LOCKED: credit note % is issued and cannot be modified', OLD."creditNoteNo";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
