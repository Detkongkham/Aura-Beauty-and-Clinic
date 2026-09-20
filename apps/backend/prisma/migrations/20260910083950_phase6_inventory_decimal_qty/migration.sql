-- DropIndex
DROP INDEX "products_branchId_stockQty_idx";

-- AlterTable
ALTER TABLE "products" ALTER COLUMN "stockQty" SET DEFAULT 0,
ALTER COLUMN "stockQty" SET DATA TYPE DECIMAL(16,3),
ALTER COLUMN "minStockQty" SET DEFAULT 5,
ALTER COLUMN "minStockQty" SET DATA TYPE DECIMAL(16,3);

-- AlterTable
ALTER TABLE "purchase_order_items" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(16,3);

-- AlterTable
ALTER TABLE "stock_movements" ALTER COLUMN "qty" SET DATA TYPE DECIMAL(16,3),
ALTER COLUMN "balanceAfter" SET DATA TYPE DECIMAL(16,3);

-- CreateIndex
CREATE INDEX "products_branchId_isActive_idx" ON "products"("branchId", "isActive");

-- CreateIndex
CREATE INDEX "purchase_orders_branchId_status_idx" ON "purchase_orders"("branchId", "status");

-- CreateIndex
CREATE INDEX "stock_movements_branchId_createdAt_idx" ON "stock_movements"("branchId", "createdAt");
