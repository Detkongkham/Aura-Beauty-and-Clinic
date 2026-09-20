-- CreateEnum
CREATE TYPE "HomeServiceJobStatus" AS ENUM ('MATCHING', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_MATCH');

-- AlterTable
ALTER TABLE "staff_profiles" ADD COLUMN "isHomeServiceAvailable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lastKnownLatitude" DOUBLE PRECISION,
ADD COLUMN "lastKnownLongitude" DOUBLE PRECISION,
ADD COLUMN "lastLocationAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "home_service_trips" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "status" "HomeServiceJobStatus" NOT NULL DEFAULT 'MATCHING',
    "matchedStaffId" TEXT,
    "matchRadiusM" INTEGER,
    "lastLatitude" DOUBLE PRECISION,
    "lastLongitude" DOUBLE PRECISION,
    "lastPingAt" TIMESTAMP(3),
    "etaMinutes" INTEGER,
    "assignedAt" TIMESTAMP(3),
    "enRouteAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_service_trips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "home_service_trips_appointmentId_key" ON "home_service_trips"("appointmentId");

-- AddForeignKey
ALTER TABLE "home_service_trips" ADD CONSTRAINT "home_service_trips_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_service_trips" ADD CONSTRAINT "home_service_trips_matchedStaffId_fkey" FOREIGN KEY ("matchedStaffId") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
