/*
  Warnings:

  - A unique constraint covering the columns `[purchasePaymentId]` on the table `gift_cards` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "GiftCardStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'DEPLETED', 'EXPIRED', 'VOID');

-- AlterTable
ALTER TABLE "gift_cards" ADD COLUMN     "issueReason" TEXT,
ADD COLUMN     "issuedByUserId" TEXT,
ADD COLUMN     "purchasePaymentId" TEXT,
ADD COLUMN     "status" "GiftCardStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "payment_transactions" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "statusCode" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_key_userId_endpoint_key" ON "idempotency_keys"("key", "userId", "endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "gift_cards_purchasePaymentId_key" ON "gift_cards"("purchasePaymentId");

-- CreateIndex
CREATE INDEX "gift_cards_status_idx" ON "gift_cards"("status");

-- AddForeignKey
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_purchasePaymentId_fkey" FOREIGN KEY ("purchasePaymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
