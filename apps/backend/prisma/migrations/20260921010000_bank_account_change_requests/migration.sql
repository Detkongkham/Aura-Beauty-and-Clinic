-- CreateEnum
CREATE TYPE "BankAccountChangeKind" AS ENUM ('CREATE', 'UPDATE', 'QR');

-- CreateEnum
CREATE TYPE "BankAccountChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "bank_account_change_requests" (
    "id" TEXT NOT NULL,
    "kind" "BankAccountChangeKind" NOT NULL,
    "status" "BankAccountChangeStatus" NOT NULL DEFAULT 'PENDING',
    "branchId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "payload" JSONB NOT NULL,
    "before" JSONB,
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_account_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_account_change_requests_status_branchId_idx" ON "bank_account_change_requests"("status", "branchId");

-- CreateIndex
CREATE INDEX "bank_account_change_requests_bankAccountId_status_idx" ON "bank_account_change_requests"("bankAccountId", "status");

-- AddForeignKey
ALTER TABLE "bank_account_change_requests" ADD CONSTRAINT "bank_account_change_requests_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_account_change_requests" ADD CONSTRAINT "bank_account_change_requests_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_account_change_requests" ADD CONSTRAINT "bank_account_change_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_account_change_requests" ADD CONSTRAINT "bank_account_change_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

