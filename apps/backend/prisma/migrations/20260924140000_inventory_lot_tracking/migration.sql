-- C5 (docs/inventory-audit.md) — Lot / batch / expiry tracking (additive only).
-- Product.trackLot opt-in; StockLot per (product, branch, lotNumber); StockMovement.lotId for recall
-- traceability; lot info carried on PO items + transfer items.

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "trackLot" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "purchase_order_items" ADD COLUMN     "expiryDate" DATE,
ADD COLUMN     "lotNumber" TEXT,
ADD COLUMN     "mfgDate" DATE;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "lotId" TEXT;

-- AlterTable
ALTER TABLE "stock_transfer_items" ADD COLUMN     "expiryDate" DATE,
ADD COLUMN     "lotNumber" TEXT,
ADD COLUMN     "mfgDate" DATE;

-- CreateTable
CREATE TABLE "stock_lots" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "expiryDate" DATE,
    "mfgDate" DATE,
    "qtyOnHand" DECIMAL(16,3) NOT NULL,
    "unitCost" DECIMAL(16,4) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "poItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_lots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_lots_productId_expiryDate_idx" ON "stock_lots"("productId", "expiryDate");

-- CreateIndex
CREATE INDEX "stock_lots_branchId_expiryDate_idx" ON "stock_lots"("branchId", "expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "stock_lots_productId_branchId_lotNumber_key" ON "stock_lots"("productId", "branchId", "lotNumber");

-- CreateIndex
CREATE INDEX "stock_movements_lotId_idx" ON "stock_movements"("lotId");

-- AddForeignKey
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "stock_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

