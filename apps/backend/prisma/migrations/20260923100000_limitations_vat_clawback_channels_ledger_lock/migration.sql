-- CreateEnum
CREATE TYPE "VatMode" AS ENUM ('INCLUSIVE', 'EXCLUSIVE');

-- AlterTable
ALTER TABLE "campaign_recipients" ADD COLUMN     "channels" "ConsentChannel"[] DEFAULT ARRAY[]::"ConsentChannel"[];

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "vatMode" "VatMode";

-- CreateTable
CREATE TABLE "line_links" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lineUserId" TEXT,
    "linkCode" TEXT,
    "linkCodeExpiresAt" TIMESTAMP(3),
    "linkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "line_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_clawbacks" (
    "id" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "monthYear" TEXT NOT NULL,
    "isSettled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_clawbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "line_links_userId_key" ON "line_links"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "line_links_lineUserId_key" ON "line_links"("lineUserId");

-- CreateIndex
CREATE UNIQUE INDEX "line_links_linkCode_key" ON "line_links"("linkCode");

-- CreateIndex
CREATE UNIQUE INDEX "commission_clawbacks_refundId_key" ON "commission_clawbacks"("refundId");

-- CreateIndex
CREATE INDEX "commission_clawbacks_staffProfileId_monthYear_idx" ON "commission_clawbacks"("staffProfileId", "monthYear");

-- CreateIndex
CREATE INDEX "commission_clawbacks_monthYear_idx" ON "commission_clawbacks"("monthYear");

-- AddForeignKey
ALTER TABLE "line_links" ADD CONSTRAINT "line_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_clawbacks" ADD CONSTRAINT "commission_clawbacks_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill: ບິນເກົ່າທີ່ມີ VAT ລ້ວນແຕ່ເປັນແບບລວມພາສີ (inclusive).
UPDATE "payments" SET "vatMode" = 'INCLUSIVE' WHERE "vatRate" IS NOT NULL AND "vatMode" IS NULL;

-- =====================================================================
-- ຂໍ້ຈຳກັດ 10C — ລັອກເອກະສານການເງິນທີ່ອອກແລ້ວ ໃນລະດັບຖານຂໍ້ມູນ (trigger), ບໍ່ແມ່ນແຕ່ "ບໍ່ມີ endpoint".
-- ການແກ້ໄຂຫຼັງອອກເອກະສານ = ອອກໃບຄືນເງິນ (CN) ເທົ່ານັ້ນ. ຂໍ້ຄວາມ error ຂຶ້ນຕົ້ນດ້ວຍ 'LEDGER_LOCKED:' (API → 409).
-- ໝາຍເຫດ: ບໍ່ລັອກ DELETE (test cleanup + FK cascade ໃຊ້ຢູ່); API ບໍ່ມີທາງລຶບຕາຕະລາງເຫຼົ່ານີ້.
-- =====================================================================

-- 1) ບິນທີ່ອອກເລກ INV ແລ້ວ: ຍອດ/ພາສີ/ເລກ/ວັນທີ ບໍ່ປ່ຽນ. ປ່ຽນໄດ້ສະເພາະ refundedAmount (ເພີ່ມຂຶ້ນເທົ່ານັ້ນ)
--    ແລະ paymentStatus → REFUNDED.
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
     OR NEW."appointmentId" IS DISTINCT FROM OLD."appointmentId"
     OR NEW."bookingGroupId" IS DISTINCT FROM OLD."bookingGroupId"
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

CREATE TRIGGER payments_ledger_lock
  BEFORE UPDATE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION abcp_lock_issued_payment();

-- 2) ລາຍການຮັບເງິນ: ລັອກເມື່ອບິນອອກ INV ແລ້ວ ຫຼື ຕົກຢູ່ໃນກະລິ້ນຊັກທີ່ປິດແລ້ວ (ຂອງສາຂາບິນ).
--    ຫ້າມ INSERT ຍ້ອນຫຼັງ (createdAt) ເຂົ້າໄປໃນກະທີ່ປິດແລ້ວ. ຜູກບັນຊີທະນາຄານ (bankAccountId) ຍັງເຮັດໄດ້.
CREATE OR REPLACE FUNCTION abcp_tx_in_closed_shift(p_payment_id TEXT, p_at TIMESTAMP(3)) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM "cash_drawer_sessions" s
    JOIN "payments" p ON p."branchId" = s."branchId"
    WHERE p."id" = p_payment_id AND s."status" = 'CLOSED'
      AND s."openedAt" <= p_at AND s."closedAt" > p_at
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION abcp_lock_payment_tx() RETURNS trigger AS $$
DECLARE
  inv TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."createdAt" < now() - interval '1 minute' AND abcp_tx_in_closed_shift(NEW."paymentId", NEW."createdAt") THEN
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
     OR NEW."giftCardId" IS DISTINCT FROM OLD."giftCardId"
     OR NEW."loyaltyAccountId" IS DISTINCT FROM OLD."loyaltyAccountId"
     OR NEW."userPackageId" IS DISTINCT FROM OLD."userPackageId"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR (OLD."status" = 'SUCCESS' AND NEW."status" IS DISTINCT FROM OLD."status") THEN
    RAISE EXCEPTION 'LEDGER_LOCKED: payment transaction % belongs to an issued invoice or closed shift', OLD."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_transactions_ledger_lock
  BEFORE INSERT OR UPDATE ON "payment_transactions"
  FOR EACH ROW EXECUTE FUNCTION abcp_lock_payment_tx();

-- 3) ໃບຄືນເງິນ (CN) ທີ່ອອກເລກແລ້ວ ບໍ່ປ່ຽນ.
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
     OR NEW."bankAccountId" IS DISTINCT FROM OLD."bankAccountId" THEN
    RAISE EXCEPTION 'LEDGER_LOCKED: credit note % is issued and cannot be modified', OLD."creditNoteNo";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER refunds_ledger_lock
  BEFORE UPDATE ON "refunds"
  FOR EACH ROW EXECUTE FUNCTION abcp_lock_issued_refund();

-- 4) ກະລິ້ນຊັກທີ່ປິດແລ້ວ: ຫຼັງອອກເລກ Z ບໍ່ປ່ຽນຫຍັງເລີຍ; ລະຫວ່າງປິດ→ອອກ Z (transaction ດຽວກັນ) ປ່ຽນໄດ້ສະເພາະ zNo/zReport.
CREATE OR REPLACE FUNCTION abcp_lock_closed_drawer() RETURNS trigger AS $$
BEGIN
  IF OLD."status" <> 'CLOSED' THEN
    RETURN NEW;
  END IF;
  IF OLD."zNo" IS NOT NULL THEN
    IF (to_jsonb(NEW) - 'updatedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'updatedAt') THEN
      RAISE EXCEPTION 'LEDGER_LOCKED: Z-report % is final and cannot be modified', OLD."zNo";
    END IF;
  ELSIF (to_jsonb(NEW) - 'updatedAt' - 'zNo' - 'zReport') IS DISTINCT FROM (to_jsonb(OLD) - 'updatedAt' - 'zNo' - 'zReport') THEN
    RAISE EXCEPTION 'LEDGER_LOCKED: closed cash-drawer session % cannot be modified', OLD."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cash_drawer_sessions_ledger_lock
  BEFORE UPDATE ON "cash_drawer_sessions"
  FOR EACH ROW EXECUTE FUNCTION abcp_lock_closed_drawer();

CREATE OR REPLACE FUNCTION abcp_lock_closed_drawer_movement() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "cash_drawer_sessions" WHERE "id" = NEW."sessionId" AND "status" = 'CLOSED')
     OR (TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM "cash_drawer_sessions" WHERE "id" = OLD."sessionId" AND "status" = 'CLOSED')) THEN
    RAISE EXCEPTION 'LEDGER_LOCKED: cash-drawer session is closed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cash_drawer_movements_ledger_lock
  BEFORE INSERT OR UPDATE ON "cash_drawer_movements"
  FOR EACH ROW EXECUTE FUNCTION abcp_lock_closed_drawer_movement();
