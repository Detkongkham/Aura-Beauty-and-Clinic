-- Customer-app package self-purchase (additive).

-- CreateEnum
CREATE TYPE "UserPackageStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'VOID');

-- AlterTable
ALTER TABLE "packages" ADD COLUMN "description" TEXT,
ADD COLUMN "imageUrl" TEXT,
ADD COLUMN "validityDays" INTEGER NOT NULL DEFAULT 365;

-- AlterTable (existing rows backfill to ACTIVE via default)
ALTER TABLE "user_packages" ADD COLUMN "status" "UserPackageStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "purchasePaymentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "user_packages_purchasePaymentId_key" ON "user_packages"("purchasePaymentId");

-- CreateIndex
CREATE INDEX "user_packages_userId_status_idx" ON "user_packages"("userId", "status");

-- AddForeignKey
ALTER TABLE "user_packages" ADD CONSTRAINT "user_packages_purchasePaymentId_fkey" FOREIGN KEY ("purchasePaymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
