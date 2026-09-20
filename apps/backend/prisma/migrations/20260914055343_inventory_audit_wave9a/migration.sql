-- Inventory audit ຄື້ນ 9A (docs/inventory-audit.md) — C1 safety net, C3 branch-scoped SKU,
-- H1 ledger createdByUserId, M17 dedupe PO items, C2 allowNegativeStock, L3 refId index.

-- DropIndex
DROP INDEX "products_sku_key";

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "createdByUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "products_branchId_sku_key" ON "products"("branchId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_items_purchaseOrderId_productId_key" ON "purchase_order_items"("purchaseOrderId", "productId");

-- CreateIndex
CREATE INDEX "stock_movements_refId_idx" ON "stock_movements"("refId");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- C1 — safety net ຊັ້ນສຸດທ້າຍ: ຫ້າມ stockQty ຕິດລົບ ໃນລະດັບ DB, ເຖິງແມ່ນ logic ຊັ້ນ app ຈະຜິດ.
-- ໃຊ້ trigger ແທນ CHECK constraint ທຳມະດາ ເພາະຕ້ອງອະນຸຍາດຂໍ້ຍົກເວັ້ນເມື່ອ branches.allowNegativeStock = true
-- (CHECK constraint ທຳມະດາອ້າງອີງຕາຕະລາງອື່ນບໍ່ໄດ້).
CREATE OR REPLACE FUNCTION check_products_stock_non_negative() RETURNS TRIGGER AS $$
DECLARE
  allow_negative BOOLEAN;
BEGIN
  IF NEW."stockQty" < 0 THEN
    SELECT "allowNegativeStock" INTO allow_negative FROM "branches" WHERE id = NEW."branchId";
    IF NOT COALESCE(allow_negative, false) THEN
      RAISE EXCEPTION 'stockQty ຂອງສິນຄ້າ % ຈະຕິດລົບບໍ່ໄດ້ (branch % ບໍ່ໄດ້ເປີດ allowNegativeStock)', NEW.id, NEW."branchId";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_stock_non_negative ON "products";
CREATE TRIGGER trg_products_stock_non_negative
  BEFORE INSERT OR UPDATE OF "stockQty" ON "products"
  FOR EACH ROW EXECUTE FUNCTION check_products_stock_non_negative();
