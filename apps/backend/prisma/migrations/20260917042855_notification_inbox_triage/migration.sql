-- AlterTable
ALTER TABLE "notification_logs" ADD COLUMN     "data" JSONB,
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedById" TEXT,
ADD COLUMN     "severity" TEXT NOT NULL DEFAULT 'info';

-- CreateIndex
CREATE INDEX "notification_logs_userId_sentAt_idx" ON "notification_logs"("userId", "sentAt");

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: severity from the free-form type (mirrors inferNotificationSeverity in system.service.ts).
UPDATE "notification_logs" SET "severity" = 'critical'
WHERE upper("type") LIKE '%RECONCILIATION%' OR upper("type") LIKE '%NO_MATCH%' OR upper("type") LIKE '%FAILED%';
UPDATE "notification_logs" SET "severity" = 'warning'
WHERE "severity" = 'info' AND (
  upper("type") LIKE '%SLA_LATE%' OR upper("type") LIKE '%LOW_STOCK%' OR upper("type") LIKE '%STAFF_LATE%'
  OR upper("type") LIKE '%TIMEOFF%' OR upper("type") LIKE '%CANCEL%'
);

-- Rows already read get a best-effort read timestamp so "read x ago" isn't blank.
UPDATE "notification_logs" SET "readAt" = "sentAt" WHERE "isRead" = true;
