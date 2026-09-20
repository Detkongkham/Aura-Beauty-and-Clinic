-- Branch: amenities list
ALTER TABLE "branches" ADD COLUMN "amenities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Service: compare-at price, highlight chips, process steps
ALTER TABLE "services" ADD COLUMN "compareAtPrice" DECIMAL(16,2);
ALTER TABLE "services" ADD COLUMN "highlights" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "services" ADD COLUMN "steps" JSONB;
