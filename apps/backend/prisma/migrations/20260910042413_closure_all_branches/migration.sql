-- DropIndex
DROP INDEX "branch_closures_branchId_date_key";

-- AlterTable
ALTER TABLE "branch_closures" ALTER COLUMN "branchId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "branch_closures_branchId_date_idx" ON "branch_closures"("branchId", "date");
