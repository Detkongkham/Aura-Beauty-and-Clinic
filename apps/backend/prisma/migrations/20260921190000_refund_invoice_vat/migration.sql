-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'VOIDED';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "invoiceNo" TEXT,
ADD COLUMN     "netAmount" DECIMAL(16,2),
ADD COLUMN     "refundedAmount" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
ADD COLUMN     "taxAmount" DECIMAL(16,2),
ADD COLUMN     "vatRate" DECIMAL(6,4),
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "allocations" JSONB,
ADD COLUMN     "creditNoteNo" TEXT,
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedReason" TEXT,
ADD COLUMN     "storeCreditAmount" DECIMAL(16,2) NOT NULL DEFAULT 0.0,
ADD COLUMN     "taxAmount" DECIMAL(16,2) NOT NULL DEFAULT 0.0;

-- CreateTable
CREATE TABLE "document_sequences" (
    "branchId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastNo" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("branchId","docType","year")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_invoiceNo_key" ON "payments"("invoiceNo");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_creditNoteNo_key" ON "refunds"("creditNoteNo");


-- Backfill: ອອກເລກໃບຮັບເງິນໃຫ້ບິນ FULLY_PAID ທີ່ມີຢູ່ແລ້ວ ຕາມລຳດັບ paidAt ຕໍ່ (ສາຂາ, ປີ ເວລາວຽງຈັນ)
-- ຮູບແບບຕ້ອງກົງກັບ documentNumbers.ts: INV-<ລະຫັດສາຂາ>-<ປີ>-<ລຳດັບ 6 ຫຼັກ>.
WITH numbered AS (
  SELECT p."id",
         COALESCE(NULLIF(b."code", ''), UPPER(LEFT(b."id", 4))) AS prefix,
         p."branchId",
         EXTRACT(YEAR FROM (p."paidAt" + INTERVAL '7 hours'))::int AS yr,
         ROW_NUMBER() OVER (
           PARTITION BY p."branchId", EXTRACT(YEAR FROM (p."paidAt" + INTERVAL '7 hours'))
           ORDER BY p."paidAt", p."id"
         ) AS n
  FROM "payments" p
  JOIN "branches" b ON b."id" = p."branchId"
  WHERE p."paymentStatus" IN ('FULLY_PAID', 'REFUNDED') AND p."paidAt" IS NOT NULL AND p."invoiceNo" IS NULL
)
UPDATE "payments" p
SET "invoiceNo" = 'INV-' || n.prefix || '-' || n.yr || '-' || LPAD(n.n::text, 6, '0')
FROM numbered n
WHERE p."id" = n."id";

INSERT INTO "document_sequences" ("branchId", "docType", "year", "lastNo", "updatedAt")
SELECT p."branchId", 'INV', EXTRACT(YEAR FROM (p."paidAt" + INTERVAL '7 hours'))::int, COUNT(*), NOW()
FROM "payments" p
WHERE p."invoiceNo" IS NOT NULL AND p."paidAt" IS NOT NULL
GROUP BY p."branchId", EXTRACT(YEAR FROM (p."paidAt" + INTERVAL '7 hours'))
ON CONFLICT DO NOTHING;
