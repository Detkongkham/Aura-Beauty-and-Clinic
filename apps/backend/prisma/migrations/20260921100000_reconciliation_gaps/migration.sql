-- ໂມດູນ 39 — ຊ່ອງວ່າງການກະທົບຍອດ G1 (statement import/lines), G2 (settlesNet), G3 (resolution), G4 (opening/closing), G5 (period lock), G7 (refund bank account).
-- CreateEnum
CREATE TYPE "StatementSource" AS ENUM ('MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "VarianceResolution" AS ENUM ('BANK_FEE', 'TIMING', 'WRONG_ACCOUNT', 'UNBOOKED_SLIP', 'DATA_ENTRY', 'OTHER');

-- CreateEnum
CREATE TYPE "StatementLineDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "StatementLineMatch" AS ENUM ('UNMATCHED', 'MATCHED', 'IGNORED');

-- AlterTable
ALTER TABLE "bank_statement_entries" ADD COLUMN     "closingBalance" DECIMAL(16,2),
ADD COLUMN     "openingBalance" DECIMAL(16,2),
ADD COLUMN     "resolution" "VarianceResolution",
ADD COLUMN     "resolutionNote" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedById" TEXT,
ADD COLUMN     "source" "StatementSource" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "payment_providers" ADD COLUMN     "settlesNet" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "bankAccountId" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "bank_statement_imports" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "creditTotal" DECIMAL(16,2) NOT NULL,
    "debitTotal" DECIMAL(16,2) NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "importedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_statement_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_lines" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "statementDate" DATE NOT NULL,
    "postedAt" TIMESTAMP(3),
    "direction" "StatementLineDirection" NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "balance" DECIMAL(16,2),
    "description" TEXT,
    "reference" TEXT,
    "seq" INTEGER NOT NULL,
    "dedupeHash" TEXT NOT NULL,
    "matchStatus" "StatementLineMatch" NOT NULL DEFAULT 'UNMATCHED',
    "matchedTxId" TEXT,
    "matchedExpenseId" TEXT,
    "matchedRefundId" TEXT,
    "matchedById" TEXT,
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_periods" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "closedById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "summary" JSONB NOT NULL,

    CONSTRAINT "reconciliation_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_statement_imports_bankAccountId_createdAt_idx" ON "bank_statement_imports"("bankAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_lines_matchedTxId_key" ON "bank_statement_lines"("matchedTxId");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_lines_matchedExpenseId_key" ON "bank_statement_lines"("matchedExpenseId");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_lines_matchedRefundId_key" ON "bank_statement_lines"("matchedRefundId");

-- CreateIndex
CREATE INDEX "bank_statement_lines_bankAccountId_statementDate_idx" ON "bank_statement_lines"("bankAccountId", "statementDate");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_lines_bankAccountId_dedupeHash_key" ON "bank_statement_lines"("bankAccountId", "dedupeHash");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_periods_branchId_month_key" ON "reconciliation_periods"("branchId", "month");

-- CreateIndex
CREATE INDEX "refunds_bankAccountId_paidAt_idx" ON "refunds"("bankAccountId", "paidAt");

-- AddForeignKey
ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_imports_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_importId_fkey" FOREIGN KEY ("importId") REFERENCES "bank_statement_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- G12 — ສິດໃໝ່ payments:reconcile: ໃຫ້ທຸກ role ທີ່ມີ payments:manage ຢູ່ແລ້ວ (ບໍ່ໃຫ້ສູນເສຍການເຂົ້າເຖິງ).
UPDATE "roles"
SET "permissions" = array_append("permissions", 'payments:reconcile')
WHERE 'payments:manage' = ANY("permissions") AND NOT ('payments:reconcile' = ANY("permissions"));
