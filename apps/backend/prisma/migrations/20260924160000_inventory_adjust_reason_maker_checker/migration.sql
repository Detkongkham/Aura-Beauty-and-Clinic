-- CreateEnum
CREATE TYPE "StockAdjustReason" AS ENUM ('DAMAGED', 'EXPIRED', 'LOST_OR_THEFT', 'COUNT_VARIANCE', 'SAMPLE_OR_TESTER', 'INTERNAL_USE', 'CUSTOMER_COMPENSATION', 'SUPPLIER_RETURN', 'OPENING_BALANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "StockAdjustRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "attachmentUrl" TEXT,
ADD COLUMN     "reasonCode" "StockAdjustReason";

-- CreateTable
CREATE TABLE "stock_adjustment_requests" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "delta" DECIMAL(16,3) NOT NULL,
    "reason" "StockAdjustReason" NOT NULL,
    "notes" TEXT,
    "lotNumber" TEXT,
    "expiryDate" DATE,
    "mfgDate" DATE,
    "unitCost" DECIMAL(16,4) NOT NULL,
    "estimatedValue" DECIMAL(16,2) NOT NULL,
    "status" "StockAdjustRequestStatus" NOT NULL DEFAULT 'PENDING',
    "attachmentUrl" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "movementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_adjustment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_adjustment_requests_status_branchId_idx" ON "stock_adjustment_requests"("status", "branchId");

-- CreateIndex
CREATE INDEX "stock_adjustment_requests_productId_idx" ON "stock_adjustment_requests"("productId");

-- AddForeignKey
ALTER TABLE "stock_adjustment_requests" ADD CONSTRAINT "stock_adjustment_requests_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_requests" ADD CONSTRAINT "stock_adjustment_requests_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_requests" ADD CONSTRAINT "stock_adjustment_requests_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_requests" ADD CONSTRAINT "stock_adjustment_requests_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- H2 — ຍອດເປີດຂອງສິນຄ້າເກົ່າ (createProduct ຂຽນ notes = ຍອດເປີດ) ໃສ່ reason OPENING_BALANCE.
UPDATE "stock_movements" SET "reasonCode" = 'OPENING_BALANCE' WHERE "type" = 'ADJUSTMENT_ADD' AND "notes" = 'ຍອດເປີດ' AND "reasonCode" IS NULL;
