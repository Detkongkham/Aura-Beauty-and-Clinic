-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID');

-- CreateEnum
CREATE TYPE "ExpenseCategoryKind" AS ENUM ('OPERATING', 'PAYROLL', 'INVENTORY');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paidFromAccountId" TEXT,
ADD COLUMN     "paidReference" TEXT,
ADD COLUMN     "purchaseOrderId" TEXT,
ADD COLUMN     "recurringExpenseId" TEXT,
ADD COLUMN     "recurringPeriod" TEXT,
ADD COLUMN     "rejectedReason" TEXT,
ADD COLUMN     "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "supplierId" TEXT,
ADD COLUMN     "title" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameLo" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "kind" "ExpenseCategoryKind" NOT NULL DEFAULT 'OPERATING',
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_attachments" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "imageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "imageHash" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "ocrStatus" TEXT,
    "ocrRaw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_expenses" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LAK',
    "dayOfMonth" INTEGER NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastGeneratedPeriod" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_code_key"
 ON "expense_categories"("code");

-- CreateIndex
CREATE INDEX "expense_attachments_expenseId_idx" ON "expense_attachments"("expenseId");

-- CreateIndex
CREATE INDEX "expense_attachments_imageHash_idx" ON "expense_attachments"("imageHash");

-- CreateIndex
CREATE INDEX "recurring_expenses_branchId_isActive_idx" ON "recurring_expenses"("branchId", "isActive");

-- CreateIndex
CREATE INDEX "expenses_branchId_status_expenseDate_idx" ON "expenses"("branchId", "status", "expenseDate");

-- CreateIndex
CREATE INDEX "expenses_categoryId_idx" ON "expenses"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_recurringExpenseId_recurringPeriod_key" ON "expenses"("recurringExpenseId", "recurringPeriod");


-- Backfill (ລາຍຈ່າຍເກົ່າກ່ອນມີ workflow): ໝວດ "ອື່ນໆ", ຜູ້ສ້າງ = SUPER_ADMIN ຄົນທຳອິດ, ສະຖານະ PAID
-- (dashboard ເກົ່ານັບທຸກແຖວເປັນລາຍຈ່າຍຈິງຢູ່ແລ້ວ → ຮັກສາຕົວເລກເດີມ).
INSERT INTO "expense_categories" ("id", "code", "nameLo", "nameEn", "kind", "sortOrder", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000e09', 'OTHER', 'ອື່ນໆ', 'Other', 'OPERATING', 90, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

UPDATE "expenses" SET
  "categoryId" = (SELECT "id" FROM "expense_categories" WHERE "code" = 'OTHER'),
  "createdById" = (SELECT "id" FROM "users" WHERE "role" = 'SUPER_ADMIN' ORDER BY "createdAt" ASC LIMIT 1),
  "title" = COALESCE(NULLIF("category", ''), "notes", ''),
  "status" = 'PAID',
  "paidAt" = "expenseDate"
WHERE "categoryId" IS NULL;

ALTER TABLE "expenses" ALTER COLUMN "categoryId" SET NOT NULL,
ALTER COLUMN "createdById" SET NOT NULL,
DROP COLUMN "category";

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_attachments" ADD CONSTRAINT "expense_attachments_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paidFromAccountId_fkey" FOREIGN KEY ("paidFromAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "recurring_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

