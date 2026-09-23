-- Slip review gaps S2/S3/S5/S6/S7/S8 (2026-09-23) — additive only.

-- S7: a confirmed slip can be reversed.
ALTER TYPE "SlipVerdict" ADD VALUE 'REVERSED';

ALTER TABLE "payment_slips"
  ADD COLUMN "imagePhash" TEXT,
  ADD COLUMN "nearDuplicateOfId" TEXT,
  ADD COLUMN "riskSignals" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "claimedById" TEXT,
  ADD COLUMN "claimedAt" TIMESTAMP(3),
  ADD COLUMN "infoRequestedAt" TIMESTAMP(3),
  ADD COLUMN "infoRequestNote" TEXT,
  ADD COLUMN "rejectCode" TEXT,
  ADD COLUMN "reversedById" TEXT,
  ADD COLUMN "reversedAt" TIMESTAMP(3),
  ADD COLUMN "reverseReason" TEXT;

CREATE INDEX "payment_slips_imagePhash_idx" ON "payment_slips"("imagePhash");

ALTER TABLE "payment_slips" ADD CONSTRAINT "payment_slips_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_slips" ADD CONSTRAINT "payment_slips_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
