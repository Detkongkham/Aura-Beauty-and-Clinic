-- Expenses audit E9 (petty-cash funds + ledger) and E10 (cross-branch cost allocation). docs/expenses-audit.md
-- CreateEnum
CREATE TYPE "CashFundEntryType" AS ENUM ('TOPUP', 'WITHDRAW', 'EXPENSE', 'REVERSAL', 'COUNT');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "paidFromCashFundId" TEXT;

-- CreateTable
CREATE TABLE "cash_funds" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LAK',
    "floatAmount" DECIMAL(16,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_funds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_fund_entries" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "type" "CashFundEntryType" NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "countedAmount" DECIMAL(16,2),
    "expenseId" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_fund_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_allocations" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,
    "amountBase" DECIMAL(16,2) NOT NULL,

    CONSTRAINT "expense_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cash_funds_branchId_name_key" ON "cash_funds"("branchId", "name");

-- CreateIndex
CREATE INDEX "cash_fund_entries_fundId_createdAt_idx" ON "cash_fund_entries"("fundId", "createdAt");

-- CreateIndex
CREATE INDEX "cash_fund_entries_expenseId_idx" ON "cash_fund_entries"("expenseId");

-- CreateIndex
CREATE INDEX "expense_allocations_branchId_idx" ON "expense_allocations"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "expense_allocations_expenseId_branchId_key" ON "expense_allocations"("expenseId", "branchId");

-- AddForeignKey
ALTER TABLE "cash_funds" ADD CONSTRAINT "cash_funds_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_funds" ADD CONSTRAINT "cash_funds_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_fund_entries" ADD CONSTRAINT "cash_fund_entries_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "cash_funds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_fund_entries" ADD CONSTRAINT "cash_fund_entries_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_fund_entries" ADD CONSTRAINT "cash_fund_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_allocations" ADD CONSTRAINT "expense_allocations_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_allocations" ADD CONSTRAINT "expense_allocations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paidFromCashFundId_fkey" FOREIGN KEY ("paidFromCashFundId") REFERENCES "cash_funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

