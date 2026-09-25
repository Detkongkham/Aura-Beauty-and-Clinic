-- CreateEnum
CREATE TYPE "CancellationFeeKind" AS ENUM ('NO_SHOW', 'LATE_CANCEL');

-- AlterTable
ALTER TABLE "exchange_rates" ADD COLUMN     "fetchedAt" TIMESTAMP(3),
ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "gift_card_transactions" ADD COLUMN     "isBreakage" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "gift_cards" ADD COLUMN     "breakageAmount" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
ADD COLUMN     "expiredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "forfeitKind" "CancellationFeeKind",
ADD COLUMN     "forfeitedAmount" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
ADD COLUMN     "forfeitedAt" TIMESTAMP(3),
ADD COLUMN     "serviceChargeAmount" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
ADD COLUMN     "serviceChargeRate" DECIMAL(6,4);

-- CreateTable
CREATE TABLE "gratuities" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "note" TEXT,
    "collectedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gratuities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gratuity_shares" (
    "id" TEXT NOT NULL,
    "gratuityId" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "paidOutAt" TIMESTAMP(3),
    "paidOutById" TEXT,

    CONSTRAINT "gratuity_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gratuities_branchId_createdAt_idx" ON "gratuities"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "gratuities_paymentId_idx" ON "gratuities"("paymentId");

-- CreateIndex
CREATE INDEX "gratuity_shares_staffProfileId_paidOutAt_idx" ON "gratuity_shares"("staffProfileId", "paidOutAt");

-- AddForeignKey
ALTER TABLE "gratuities" ADD CONSTRAINT "gratuities_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gratuities" ADD CONSTRAINT "gratuities_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gratuities" ADD CONSTRAINT "gratuities_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gratuity_shares" ADD CONSTRAINT "gratuity_shares_gratuityId_fkey" FOREIGN KEY ("gratuityId") REFERENCES "gratuities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gratuity_shares" ADD CONSTRAINT "gratuity_shares_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gratuity_shares" ADD CONSTRAINT "gratuity_shares_paidOutById_fkey" FOREIGN KEY ("paidOutById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Wave 11 — ບິນທີ່ອອກເລກ INV ແລ້ວ: ຄ່າບໍລິການ (service charge) ຖືກລັອກ; ຄ່າປັບທີ່ຢຶດແລ້ວ ຫຼຸດລົງບໍ່ໄດ້.
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
     OR NEW."voidedAt" IS DISTINCT FROM OLD."voidedAt"
     OR NEW."serviceChargeRate" IS DISTINCT FROM OLD."serviceChargeRate"
     OR NEW."serviceChargeAmount" IS DISTINCT FROM OLD."serviceChargeAmount" THEN
    RAISE EXCEPTION 'LEDGER_LOCKED: invoice % is issued and cannot be modified (use a credit note)', OLD."invoiceNo";
  END IF;
  IF NEW."paymentStatus" IS DISTINCT FROM OLD."paymentStatus" AND NEW."paymentStatus" <> 'REFUNDED' THEN
    RAISE EXCEPTION 'LEDGER_LOCKED: invoice % status can only move to REFUNDED', OLD."invoiceNo";
  END IF;
  IF NEW."refundedAmount" < OLD."refundedAmount" THEN
    RAISE EXCEPTION 'LEDGER_LOCKED: invoice % refundedAmount cannot decrease', OLD."invoiceNo";
  END IF;
  IF NEW."forfeitedAmount" < OLD."forfeitedAmount" THEN
    RAISE EXCEPTION 'LEDGER_LOCKED: invoice % forfeitedAmount cannot decrease', OLD."invoiceNo";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
