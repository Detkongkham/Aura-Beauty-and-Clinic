-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "closeTime" TEXT NOT NULL DEFAULT '20:00',
ADD COLUMN     "code" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "openTime" TEXT NOT NULL DEFAULT '09:00',
ADD COLUMN     "province" TEXT;

-- CreateTable
CREATE TABLE "branch_closures" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_closures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "branch_closures_date_idx" ON "branch_closures"("date");

-- CreateIndex
CREATE UNIQUE INDEX "branch_closures_branchId_date_key" ON "branch_closures"("branchId", "date");

-- AddForeignKey
ALTER TABLE "branch_closures" ADD CONSTRAINT "branch_closures_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
