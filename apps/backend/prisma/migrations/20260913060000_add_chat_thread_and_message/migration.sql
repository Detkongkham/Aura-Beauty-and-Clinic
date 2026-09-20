-- DropForeignKey
ALTER TABLE "conversation_participants" DROP CONSTRAINT "conversation_participants_conversationId_fkey";
-- DropForeignKey
ALTER TABLE "chat_messages" DROP CONSTRAINT "chat_messages_conversationId_fkey";
-- DropIndex
DROP INDEX "conversation_participants_conversationId_userId_key";
-- DropIndex
DROP INDEX "chat_messages_conversationId_createdAt_idx";
-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "appointmentId" TEXT,
ADD COLUMN     "lastMessageAt" TIMESTAMP(3);
-- AlterTable
ALTER TABLE "conversation_participants" DROP COLUMN "conversationId",
ADD COLUMN     "threadId" TEXT NOT NULL;
-- AlterTable
ALTER TABLE "chat_messages" DROP COLUMN "conversationId",
DROP COLUMN "message",
ADD COLUMN     "body" TEXT NOT NULL,
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "senderRole" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
ADD COLUMN     "threadId" TEXT NOT NULL;
-- CreateIndex
CREATE UNIQUE INDEX "conversations_appointmentId_key" ON "conversations"("appointmentId");
-- CreateIndex
CREATE UNIQUE INDEX "conversation_participants_threadId_userId_key" ON "conversation_participants"("threadId", "userId");
-- CreateIndex
CREATE INDEX "chat_messages_threadId_createdAt_idx" ON "chat_messages"("threadId", "createdAt");
-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
