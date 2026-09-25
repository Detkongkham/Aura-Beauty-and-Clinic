-- AlterTable
ALTER TABLE "bank_statement_lines" ADD COLUMN     "matchedCashFundEntryId" TEXT;

-- AlterTable
ALTER TABLE "cash_fund_entries" ADD COLUMN     "bankAccountId" TEXT;

-- AlterTable
ALTER TABLE "recurring_expenses" ADD COLUMN     "allocations" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_lines_matchedCashFundEntryId_key" ON "bank_statement_lines"("matchedCashFundEntryId");

-- AddForeignKey
ALTER TABLE "cash_fund_entries" ADD CONSTRAINT "cash_fund_entries_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

