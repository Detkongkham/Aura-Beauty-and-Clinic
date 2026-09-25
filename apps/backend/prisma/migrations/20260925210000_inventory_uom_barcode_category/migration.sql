-- AlterTable
ALTER TABLE "goods_receipt_lines" ADD COLUMN     "factorToBase" DECIMAL(16,6) NOT NULL DEFAULT 1,
ADD COLUMN     "uomId" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "abcClass" VARCHAR(1),
ADD COLUMN     "abcComputedAt" TIMESTAMP(3),
ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "baseUomId" TEXT,
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "gtin" TEXT;

-- AlterTable
ALTER TABLE "purchase_order_items" ADD COLUMN     "factorToBase" DECIMAL(16,6) NOT NULL DEFAULT 1,
ADD COLUMN     "uomId" TEXT,
ALTER COLUMN "unitCost" SET DATA TYPE DECIMAL(18,6);

-- AlterTable
ALTER TABLE "service_consumables" ADD COLUMN     "factorToBase" DECIMAL(16,6) NOT NULL DEFAULT 1,
ADD COLUMN     "uomId" TEXT;

-- AlterTable
ALTER TABLE "supplier_products" ADD COLUMN     "factorToBase" DECIMAL(16,6) NOT NULL DEFAULT 1,
ADD COLUMN     "uomId" TEXT;

-- CreateTable
CREATE TABLE "uoms" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameLo" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uoms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_uom_conversions" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "uomId" TEXT NOT NULL,
    "factorToBase" DECIMAL(16,6) NOT NULL,
    "isPurchaseDefault" BOOLEAN NOT NULL DEFAULT false,
    "isConsumeDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_uom_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameLo" TEXT,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uoms_code_key" ON "uoms"("code");

-- CreateIndex
CREATE UNIQUE INDEX "product_uom_conversions_productId_uomId_key" ON "product_uom_conversions"("productId", "uomId");

-- CreateIndex
CREATE INDEX "product_categories_branchId_isActive_idx" ON "product_categories"("branchId", "isActive");

-- CreateIndex
CREATE INDEX "product_categories_parentId_idx" ON "product_categories"("parentId");

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "products_branchId_gtin_key" ON "products"("branchId", "gtin");

-- CreateIndex
CREATE UNIQUE INDEX "products_branchId_barcode_key" ON "products"("branchId", "barcode");

-- AddForeignKey
ALTER TABLE "service_consumables" ADD CONSTRAINT "service_consumables_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "uoms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "uoms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_uom_conversions" ADD CONSTRAINT "product_uom_conversions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_uom_conversions" ADD CONSTRAINT "product_uom_conversions_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "uoms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_baseUomId_fkey" FOREIGN KEY ("baseUomId") REFERENCES "uoms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "uoms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "uoms"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ============================================================ M1 data backfill (data-only)
-- ໜ່ວຍມາດຕະຖານ (idempotent — seed.ts upsert ຊຸດດຽວກັນ).
INSERT INTO "uoms" ("id", "code", "name", "nameLo", "updatedAt") VALUES
  (gen_random_uuid()::text, 'piece',  'Piece',  'ອັນ',    CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'bottle', 'Bottle', 'ຕຸກ',    CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'box',    'Box',    'ກ່ອງ',   CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ml',     'ml',     'ມລ',     CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'g',      'g',      'ກຣາມ',   CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'set',    'Set',    'ຊຸດ',    CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'pack',   'Pack',   'ແພັກ',   CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'sachet', 'Sachet', 'ຊອງ',    CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'tube',   'Tube',   'ຫຼອດ',   CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'jar',    'Jar',    'ກະປຸກ',  CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- ຂໍ້ຄວາມ `unit` ທີ່ບໍ່ກົງກັບໜ່ວຍໃດ → ສ້າງ Uom ໃໝ່ຈາກຂໍ້ຄວາມ (code = ຂໍ້ຄວາມຕົວພິມນ້ອຍ).
INSERT INTO "uoms" ("id", "code", "name", "updatedAt")
SELECT gen_random_uuid()::text, lower(btrim(p.unit)), min(btrim(p.unit)), CURRENT_TIMESTAMP
  FROM "products" p
 WHERE btrim(p.unit) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM "uoms" u
      WHERE lower(btrim(p.unit)) IN (lower(u.code), lower(u.name), lower(coalesce(u."nameLo", '')))
   )
 GROUP BY lower(btrim(p.unit))
ON CONFLICT ("code") DO NOTHING;

-- Product.baseUomId ຈາກ unit (ກົງ code → name → nameLo).
UPDATE "products" p
   SET "baseUomId" = (
     SELECT u.id FROM "uoms" u
      WHERE lower(btrim(p.unit)) IN (lower(u.code), lower(u.name), lower(coalesce(u."nameLo", '')))
      ORDER BY (lower(u.code) = lower(btrim(p.unit))) DESC, u."createdAt" ASC
      LIMIT 1
   )
 WHERE p."baseUomId" IS NULL;
