-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('CONSULTATION', 'STAFF_INTERNAL', 'DIRECT');

-- DropForeignKey
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_branchId_fkey";

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "messageType" TEXT NOT NULL DEFAULT 'TEXT';

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "type" "ConversationType" NOT NULL DEFAULT 'CONSULTATION',
ALTER COLUMN "branchId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "chat_reports" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "reportedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_blocks" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_reports_status_idx" ON "chat_reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "chat_blocks_blockerId_blockedId_key" ON "chat_blocks"("blockerId", "blockedId");

-- CreateIndex
CREATE INDEX "conversations_type_idx" ON "conversations"("type");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
