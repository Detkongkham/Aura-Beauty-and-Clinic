-- CreateEnum
CREATE TYPE "QueueTicketPriority" AS ENUM ('NORMAL', 'VIP');

-- AlterTable
ALTER TABLE "queue_tickets" ADD COLUMN     "callCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "lastCalledAt" TIMESTAMP(3),
ADD COLUMN     "note" TEXT,
ADD COLUMN     "priority" "QueueTicketPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- Backfill lifecycle stamps from the old implicit fields.
UPDATE "queue_tickets" SET "startedAt" = "updatedAt" WHERE "status" IN ('IN_SERVICE', 'COMPLETED') AND "startedAt" IS NULL;
UPDATE "queue_tickets" SET "callCount" = 1, "lastCalledAt" = "calledAt" WHERE "calledAt" IS NOT NULL;
UPDATE "queue_tickets" SET "cancelledAt" = "updatedAt", "cancelReason" = 'OTHER' WHERE "status" = 'CANCELLED';
