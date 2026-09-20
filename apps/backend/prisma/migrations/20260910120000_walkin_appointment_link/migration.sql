-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('ONLINE', 'WALK_IN', 'ADMIN');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "source" "AppointmentSource" NOT NULL DEFAULT 'ONLINE';

-- AlterTable
ALTER TABLE "queue_tickets" ADD COLUMN "appointmentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "queue_tickets_appointmentId_key" ON "queue_tickets"("appointmentId");

-- AddForeignKey
ALTER TABLE "queue_tickets" ADD CONSTRAINT "queue_tickets_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
