-- Payroll P1 (docs/payroll-audit.md C1 + C3).

-- C1: one KPI goal per staff per month. Keep the paid row first, then the most recently updated.
DELETE FROM "staff_kpi_goals" g
USING (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "staffProfileId", "monthYear"
    ORDER BY "isBonusPaid" DESC, "updatedAt" DESC, id DESC
  ) AS rn
  FROM "staff_kpi_goals"
) d
WHERE g.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX "staff_kpi_goals_staffProfileId_monthYear_key"
  ON "staff_kpi_goals"("staffProfileId", "monthYear");

-- C3: who paid and when.
ALTER TABLE "staff_kpi_goals" ADD COLUMN "bonusPaidAt" TIMESTAMP(3), ADD COLUMN "bonusPaidById" TEXT;
ALTER TABLE "staff_commissions" ADD COLUMN "paidAt" TIMESTAMP(3), ADD COLUMN "paidById" TEXT;

-- Best-effort backfill for rows paid before this migration (the actor is unknown).
UPDATE "staff_kpi_goals" SET "bonusPaidAt" = "updatedAt" WHERE "isBonusPaid";
UPDATE "staff_commissions" SET "paidAt" = "updatedAt" WHERE "isPaid";

CREATE INDEX "staff_commissions_staffProfileId_idx" ON "staff_commissions"("staffProfileId");
