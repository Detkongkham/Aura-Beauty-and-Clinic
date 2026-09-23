-- ໂມດູນ 39 G10 — ກະທົບຍອດເງິນສົດໃນລິ້ນຊັກ (ຕໍ່ກະ).
-- CreateEnum
CREATE TYPE "CashDrawerStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashDrawerMovementType" AS ENUM ('DROP', 'PAYIN', 'PAYOUT');

-- CreateTable
CREATE TABLE "cash_drawer_sessions" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LAK',
    "status" "CashDrawerStatus" NOT NULL DEFAULT 'OPEN',
    "openedById" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openingFloat" DECIMAL(16,2) NOT NULL,
    "openingNote" TEXT,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "expectedAmount" DECIMAL(16,2),
    "countedAmount" DECIMAL(16,2),
    "variance" DECIMAL(16,2),
    "denominations" JSONB,
    "closingNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_drawer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_drawer_movements" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "CashDrawerMovementType" NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_drawer_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_drawer_sessions_branchId_openedAt_idx" ON "cash_drawer_sessions"("branchId", "openedAt");

-- CreateIndex
CREATE INDEX "cash_drawer_sessions_branchId_status_idx" ON "cash_drawer_sessions"("branchId", "status");

-- CreateIndex
CREATE INDEX "cash_drawer_movements_sessionId_createdAt_idx" ON "cash_drawer_movements"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "cash_drawer_movements" ADD CONSTRAINT "cash_drawer_movements_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cash_drawer_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ລິ້ນຊັກທີ່ເປີດຢູ່ໄດ້ພຽງອັນດຽວຕໍ່ສາຂາ (ກັນ race ຂອງການເປີດພ້ອມກັນ).
CREATE UNIQUE INDEX "cash_drawer_sessions_one_open_per_branch" ON "cash_drawer_sessions"("branchId") WHERE "status" = 'OPEN';
