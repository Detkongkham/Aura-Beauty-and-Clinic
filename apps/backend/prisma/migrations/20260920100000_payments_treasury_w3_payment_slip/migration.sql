-- CreateEnum
CREATE TYPE "SlipOcrStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "SlipVerdict" AS ENUM ('PENDING', 'AUTO_MATCHED', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'DUPLICATE');

-- CreateTable
CREATE TABLE "payment_slips" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "declaredAmount" DECIMAL(16,2),
    "imageKey" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imageHash" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "ocrStatus" "SlipOcrStatus" NOT NULL DEFAULT 'PENDING',
    "ocrEngine" TEXT,
    "ocrMs" INTEGER,
    "ocrRaw" JSONB,
    "ocrError" TEXT,
    "qrPayload" TEXT,
    "bankCode" TEXT,
    "amount" DECIMAL(16,2),
    "currency" TEXT,
    "txnRef" TEXT,
    "transferredAt" TIMESTAMP(3),
    "senderName" TEXT,
    "receiverAccount" TEXT,
    "matchScore" INTEGER NOT NULL DEFAULT 0,
    "mismatchFields" TEXT[],
    "verdict" "SlipVerdict" NOT NULL DEFAULT 'PENDING',
    "dedupeKey" TEXT,
    "rejectReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "paymentTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "payment_slips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_slips_dedupeKey_key" ON "payment_slips"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "payment_slips_paymentTransactionId_key" ON "payment_slips"("paymentTransactionId");

-- CreateIndex
CREATE INDEX "payment_slips_paymentId_idx" ON "payment_slips"("paymentId");

-- CreateIndex
CREATE INDEX "payment_slips_imageHash_idx" ON "payment_slips"("imageHash");

-- CreateIndex
CREATE INDEX "payment_slips_verdict_createdAt_idx" ON "payment_slips"("verdict", "createdAt");

-- CreateIndex
CREATE INDEX "payment_slips_branchId_verdict_idx" ON "payment_slips"("branchId", "verdict");

-- AddForeignKey
ALTER TABLE "payment_slips" ADD CONSTRAINT "payment_slips_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_slips" ADD CONSTRAINT "payment_slips_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_slips" ADD CONSTRAINT "payment_slips_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_slips" ADD CONSTRAINT "payment_slips_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_slips" ADD CONSTRAINT "payment_slips_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_slips" ADD CONSTRAINT "payment_slips_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "payment_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
