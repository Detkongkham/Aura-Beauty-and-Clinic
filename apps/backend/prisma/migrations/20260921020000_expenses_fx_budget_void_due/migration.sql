-- Expenses audit E1/E2/E5/E8 (docs/expenses-audit.md): FX snapshot + LAK base amount, budgets, VOIDED, due date / invoice / VAT.
-- AlterEnum
ALTER TYPE "ExpenseStatus" ADD VALUE 'VOIDED';

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "amountBase" DECIMAL(16,2) NOT NULL DEFAULT 0,
ADD COLUMN     "dueDate" DATE,
ADD COLUMN     "fxRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "taxAmount" DECIMAL(16,2),
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- CreateTable
CREATE TABLE "expense_budgets" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expense_budgets_month_idx" ON "expense_budgets"("month");

-- CreateIndex
CREATE UNIQUE INDEX "expense_budgets_branchId_categoryId_month_key" ON "expense_budgets"("branchId", "categoryId", "month");

-- CreateIndex
CREATE INDEX "expenses_status_dueDate_idx" ON "expenses"("status", "dueDate");

-- AddForeignKey
ALTER TABLE "expense_budgets" ADD CONSTRAINT "expense_budgets_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_budgets" ADD CONSTRAINT "expense_budgets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_budgets" ADD CONSTRAINT "expense_budgets_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill E1: snapshot the booking rate for existing rows from exchange_rates (X → LAK); unknown = 1.
UPDATE "expenses" e
SET "fxRate" = COALESCE(
      (SELECT r."rate" FROM "exchange_rates" r WHERE r."baseCurrency" = e."currency" AND r."targetCurrency" = 'LAK'),
      1
    )
WHERE e."currency" <> 'LAK';
UPDATE "expenses" SET "amountBase" = ROUND("amount" * "fxRate", 2);
