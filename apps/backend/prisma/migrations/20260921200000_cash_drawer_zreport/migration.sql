-- AlterTable
ALTER TABLE "cash_drawer_sessions" ADD COLUMN     "zNo" TEXT,
ADD COLUMN     "zReport" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "cash_drawer_sessions_zNo_key" ON "cash_drawer_sessions"("zNo");

