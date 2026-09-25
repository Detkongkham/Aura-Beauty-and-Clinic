-- Payroll G1.8: per-service commission rate override.
CREATE TABLE "service_commission_rules" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "service_commission_rules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "service_commission_rules_serviceId_key" ON "service_commission_rules"("serviceId");
