-- C4 (docs/inventory-audit.md) — Weighted Average Cost costing.
-- costPrice now doubles as the running WAC; widened to 4dp so repeated receipts don't drift.
-- StockMovement gets a valued ledger: unitCost (WAC in effect) + valueChange (signed LAK).
-- Existing rows keep unitCost/valueChange = NULL (no fabricated historical costs).

-- AlterTable
ALTER TABLE "products" ALTER COLUMN "costPrice" SET DATA TYPE DECIMAL(16,4);

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "unitCost" DECIMAL(16,4),
ADD COLUMN     "valueChange" DECIMAL(16,2);
