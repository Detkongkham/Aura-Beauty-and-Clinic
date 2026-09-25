-- M13 retail/OTC sales (SOLD/SALE_RETURN) + M7 PO revision history. Additive only.
-- CreateEnum
CREATE TYPE "RetailSaleStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'VOIDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'SOLD';
ALTER TYPE "StockMovementType" ADD VALUE 'SALE_RETURN';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "isSellable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "retailPrice" DECIMAL(16,2);

-- CreateTable
CREATE TABLE "purchase_order_revisions" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" "POStatus",
    "toStatus" "POStatus",
    "changedByUserId" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB NOT NULL,
    "diff" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "purchase_order_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retail_sales" (
    "id" TEXT NOT NULL,
    "saleNumber" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT,
    "paymentId" TEXT NOT NULL,
    "status" "RetailSaleStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "subtotal" DECIMAL(16,2) NOT NULL,
    "discountTotal" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(16,2) NOT NULL,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "paidAt" TIMESTAMP(3),
    "stockPostedAt" TIMESTAMP(3),
    "stockError" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retail_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retail_sale_lines" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" DECIMAL(16,3) NOT NULL,
    "uomId" TEXT,
    "factorToBase" DECIMAL(16,6) NOT NULL DEFAULT 1,
    "uomQty" DECIMAL(16,3) NOT NULL,
    "unitPrice" DECIMAL(16,2) NOT NULL,
    "discount" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(16,2) NOT NULL,
    "cogs" DECIMAL(16,2),
    "qtyReturned" DECIMAL(16,3) NOT NULL DEFAULT 0,

    CONSTRAINT "retail_sale_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retail_sale_return_lines" (
    "id" TEXT NOT NULL,
    "saleLineId" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "qty" DECIMAL(16,3) NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "restock" BOOLEAN NOT NULL DEFAULT true,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retail_sale_return_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_revisions_purchaseOrderId_revisionNo_key" ON "purchase_order_revisions"("purchaseOrderId", "revisionNo");

-- CreateIndex
CREATE UNIQUE INDEX "retail_sales_saleNumber_key" ON "retail_sales"("saleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "retail_sales_paymentId_key" ON "retail_sales"("paymentId");

-- CreateIndex
CREATE INDEX "retail_sales_branchId_createdAt_idx" ON "retail_sales"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "retail_sales_status_idx" ON "retail_sales"("status");

-- CreateIndex
CREATE INDEX "retail_sale_lines_saleId_idx" ON "retail_sale_lines"("saleId");

-- CreateIndex
CREATE INDEX "retail_sale_lines_productId_idx" ON "retail_sale_lines"("productId");

-- CreateIndex
CREATE INDEX "retail_sale_return_lines_refundId_idx" ON "retail_sale_return_lines"("refundId");

-- CreateIndex
CREATE INDEX "retail_sale_return_lines_saleLineId_idx" ON "retail_sale_return_lines"("saleLineId");

-- AddForeignKey
ALTER TABLE "purchase_order_revisions" ADD CONSTRAINT "purchase_order_revisions_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sale_lines" ADD CONSTRAINT "retail_sale_lines_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "retail_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sale_lines" ADD CONSTRAINT "retail_sale_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sale_lines" ADD CONSTRAINT "retail_sale_lines_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "uoms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_sale_return_lines" ADD CONSTRAINT "retail_sale_return_lines_saleLineId_fkey" FOREIGN KEY ("saleLineId") REFERENCES "retail_sale_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;


