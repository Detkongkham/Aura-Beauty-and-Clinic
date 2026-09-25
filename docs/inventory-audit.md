# ວິເຄາະລະບົບສາງ / ສະຕັອກ (Inventory) — ທຽບກັບມາດຕະຖານສາກົນ

> ວັນທີວິເຄາະ: 2026-09-14
> ຂອບເຂດທີ່ກວດ: `apps/backend/prisma/schema/inventory.prisma`, `apps/backend/src/modules/inventory/*`,
> `packages/shared-types/src/inventory.schema.ts`, `apps/web-admin/src/features/inventory/*`,
> `apps/backend/tests/integration/inventory.test.ts`, ການເຊື່ອມກັບ `catalog` (BOM) ແລະ `finance`.
> ມາດຕະຖານທີ່ໃຊ້ອ້າງອີງ: **IAS 2 / IFRS (Inventories)**, **GS1 (GTIN/barcode, UoM)**,
> **WMS/ERP practice (SAP MM, Odoo, NetSuite)**, **GMP / ASEAN Cosmetic Directive (lot & expiry)**,
> **ISO 9001 §8.5.2 (traceability)**, **COSO / internal control (segregation of duties, 3-way match)**.

---

## 1. ສະຫຼຸບຜູ້ບໍລິຫານ (Executive Summary)

ລະບົບປັດຈຸບັນເປັນ **"stock counter + movement log" ທີ່ເຮັດໄດ້ດີໃນລະດັບ MVP** — ມີ Product, StockMovement
ledger, Supplier, Purchase Order, ແລະ BOM auto-deduct ທີ່ idempotent ຕໍ່ `appt:<id>` (ຈຸດນີ້ອອກແບບດີ).
ແຕ່ **ຍັງບໍ່ຜ່ານມາດຕະຖານສາກົນ** ໃນ 3 ແກນຫຼັກ:

| ແກນ | ສະຖານະ | ຄວາມສ່ຽງ |
|---|---|---|
| **A. ການຕີມູນຄ່າສະຕັອກ (Valuation / Costing)** | ❌ ບໍ່ມີ FIFO/WAC ເລີຍ | ງົບການເງິນຜິດ, COGS ຜິດ — ຜິດ IAS 2 |
| **B. ການສືບຍ້ອນ (Traceability: lot / expiry / ຜູ້ເຮັດ)** | ❌ ບໍ່ມີ | ຜິດ GMP/ASEAN Cosmetic, ເອີ້ນຄືນສິນຄ້າບໍ່ໄດ້, ບໍ່ຮູ້ໃຜປັບສະຕັອກ |
| **C. ຄວາມຖືກຕ້ອງຂອງຂໍ້ມູນ (Concurrency / negative stock / reconciliation)** | ❌ ມີ bug ຈິງ | ຕົວເລກສະຕັອກຜິດແບບງຽບໆ ໃນ production |

**ຂໍ້ຜິດພາດລະດັບ Critical ທີ່ພົບ 5 ຂໍ້** (ດູ §2) — ໃນນັ້ນມີ **bug ຈິງ 3 ຂໍ້ທີ່ເຮັດໃຫ້ຂໍ້ມູນຜິດ**
(race condition, ສະຕັອກຕິດລົບຜ່ານ BOM, SKU unique ຂ້າມສາຂາ) ທີ່ຄວນແກ້ກ່ອນເປີດໃຊ້ຫຼາຍສາຂາ.

**ຄະແນນຄວາມພ້ອມ:**

| ດ້ານ | ຄະແນນ | ໝາຍເຫດ |
|---|---|---|
| Data model ພື້ນຖານ | 6/10 | Decimal(16,3) ຖືກຕ້ອງ, soft-delete ມີ, ແຕ່ຂາດ lot/UoM/location |
| Ledger & audit trail | 4/10 | ມີ ledger ແຕ່ບໍ່ມີ `userId`, ບໍ່ມີ cost, ບໍ່ reconcile |
| Costing / Accounting | 1/10 | ບໍ່ມີ WAC/FIFO, ບໍ່ post COGS ເຂົ້າ GL |
| Procurement (PO → GRN → Invoice) | 3/10 | ຮັບເຄື່ອງແບບ all-or-nothing, ບໍ່ມີ 3-way match |
| ການຄວບຄຸມພາຍໃນ (approval, reason code) | 2/10 | ປັບສະຕັອກໄດ້ອິດສະຫຼະ ບໍ່ມີເຫດຜົນ/ຜູ້ອະນຸມັດ |
| ການນັບສະຕັອກ (Stock-take / cycle count) | 0/10 | ບໍ່ມີເລີຍ |
| ລາຍງານ & KPI | 2/10 | ມີແຕ່ stats 6 ຕົວເລກ, ບໍ່ມີ turnover/aging/shrinkage |
| UI/UX (web-admin) | 7/10 | 4 ແທັບຄົບ, ແຕ່ບໍ່ມີ export, ບໍ່ມີໜ້າ product detail |
| Mobile | 0/10 | ບໍ່ມີໜ້າສະຕັອກໃນ `apps/mobile` ເລີຍ |
| **ລວມ** | **≈ 2.8/10** | ພຽງພໍສຳລັບຮ້ານດຽວຂະໜາດນ້ອຍ, ຍັງບໍ່ພໍສຳລັບຫຼາຍສາຂາ / ຄລີນິກ |

---

## 2. ບັນຫາລະດັບ CRITICAL (ຕ້ອງແກ້ກ່ອນ)

### C1. Race condition ໃນການອັບເດດ `stockQty` — ຕົວເລກສະຕັອກຈະຜິດແບບງຽບໆ

**ຈຸດ:** [inventory.service.ts:402-417](apps/backend/src/modules/inventory/inventory.service.ts#L402-L417)
(`adjustStock`), [:452-462](apps/backend/src/modules/inventory/inventory.service.ts#L452-L462)
(`consumeServiceStock`), [:640-652](apps/backend/src/modules/inventory/inventory.service.ts#L640-L652)
(`receivePurchaseOrder`).

ທຸກບ່ອນໃຊ້ຮູບແບບ **read → ຄິດໄລ່ໃນ JS → write ຄ່າເຕັມ**:

```ts
const balance = qnum(product.stockQty) + input.delta;   // ອ່ານ
await tx.product.update({ data: { stockQty: qdec(balance) } });  // ຂຽນທັບ
```

Postgres default isolation ແມ່ນ `READ COMMITTED` → ສອງ transaction ພ້ອມກັນ (ເຊັ່ນ ພະນັກງານ 2 ຄົນກົດ
"ຈົບນັດໝາຍ" ພ້ອມກັນ, ຫຼື ຮັບ PO ພ້ອມກັບຕັດ BOM) ຈະ **lost update**: ອັນໜຶ່ງຂຽນທັບອີກອັນ.
`balanceAfter` ໃນ ledger ກໍຈະຜິດຕາມ → ledger ກັບ `products.stockQty` ຈະບໍ່ກົງກັນຕະຫຼອດໄປ.

**ວິທີແກ້:**
1. ໃຊ້ atomic increment ຂອງ DB ແທນການຂຽນຄ່າເຕັມ:
   ```ts
   const updated = await tx.product.update({
     where: { id },
     data: { stockQty: { increment: qdec(delta) } },  // ຫຼື decrement
     select: { stockQty: true },
   });
   const balanceAfter = updated.stockQty;  // ເອົາຄ່າຈາກ DB ບໍ່ແມ່ນຄິດເອງ
   ```
2. ຫຼື lock ແຖວກ່ອນ: `SELECT ... FOR UPDATE` ຜ່ານ `$queryRaw` ໃນ transaction ດຽວກັນ.
3. ເພີ່ມ **CHECK constraint** ໃນ DB: `ALTER TABLE products ADD CONSTRAINT stock_non_negative CHECK (stock_qty >= 0);`
   — ເປັນ safety net ຊັ້ນສຸດທ້າຍ ເຖິງແມ່ນ logic ຊັ້ນ app ຈະຜິດ.

---

### C2. `consumeServiceStock` ປ່ອຍໃຫ້ສະຕັອກຕິດລົບ (ບໍ່ສອດຄ່ອງກັບ `adjustStock`)

**ຈຸດ:** [inventory.service.ts:452](apps/backend/src/modules/inventory/inventory.service.ts#L452)

`adjustStock` ມີການກວດ `if (balance < 0) throw ApiError.conflict(...)` ແຕ່ `consumeServiceStock` **ບໍ່ກວດ** —
ຫັກລົງໄປເລີຍ. ນັດໝາຍທີ່ຈົບໂດຍທີ່ຢາ/ນ້ຳຢາໝົດແລ້ວ ຈະເຮັດໃຫ້ `stockQty` ຕິດລົບ ແລະ `totalStockValue`
ໃນ `inventoryStats` ກາຍເປັນຄ່າລົບ → ງົບຜິດ.

**ວິທີແກ້ (ແນະນຳແບບ ERP ມາດຕະຖານ):** ເພີ່ມ setting ລະດັບສາຂາ `allowNegativeStock: boolean`
- `false` (default) → throw `409` ພ້ອມບອກວ່າສິນຄ້າໃດຂາດ, ຝ່າຍໜ້າຮ້ານຕ້ອງປັບສະຕັອກກ່ອນປິດນັດ
- `true` → ອະນຸຍາດ ແຕ່ຕ້ອງສ້າງ **exception record** ໃຫ້ຜູ້ຈັດການຕາມແກ້ (backflush exception)

ຢ່າງໜ້ອຍທີ່ສຸດ: ຕ້ອງບໍ່ຄິດ `totalStockValue` ຈາກຄ່າລົບ.

---

### C3. `products.sku` ເປັນ `@unique` ລະດັບທົ່ວລະບົບ — ໃຊ້ SKU ດຽວກັນ 2 ສາຂາບໍ່ໄດ້

**ຈຸດ:** [inventory.prisma:36](apps/backend/prisma/schema/inventory.prisma#L36)

`Product` ຜູກກັບ `branchId` ແຕ່ `sku String @unique` ເປັນ global. ໝາຍຄວາມວ່າ:
- "SHAMPOO-001" ມີໄດ້ພຽງສາຂາດຽວໃນທັງລະບົບ → ສາຂາອື່ນຕ້ອງຕັ້ງ `SHAMPOO-001-B2` ຊຶ່ງຜິດຫຼັກ SKU ສາກົນ
  (SKU ຄວນເປັນ **ລະຫັດສິນຄ້າ**, ບໍ່ແມ່ນລະຫັດ stock record)
- ລາຍງານລວມທຸກສາຂາຈະ group ບໍ່ໄດ້
- soft-delete ແລ້ວ SKU ຍັງຖືກຈອງຕະຫຼອດໄປ → ສ້າງສິນຄ້າຊື່ເກົ່າຄືນບໍ່ໄດ້ (409 ຕະຫຼອດ)

**ວິທີແກ້ (ແນະນຳ — ນີ້ຄືໂຄງສ້າງມາດຕະຖານ):** ແຍກ **Item master** ອອກຈາກ **Stock balance**:

```prisma
model Product {            // item master — ລະດັບອົງກອນ, ບໍ່ມີ branchId
  id       String @id @default(uuid())
  sku      String @unique
  gtin     String? @unique      // barcode GS1
  name     String
  categoryId String?
  baseUomId  String
  trackLot   Boolean @default(false)
  shelfLifeDays Int?
  ...
  stocks   ProductStock[]
}

model ProductStock {       // ຍອດຄົງເຫຼືອ ຕໍ່ສາຂາ (ຫຼື ຕໍ່ location)
  productId   String
  branchId    String
  onHand      Decimal @db.Decimal(16,3)
  reserved    Decimal @default(0) @db.Decimal(16,3)
  minStockQty Decimal @db.Decimal(16,3)
  reorderQty  Decimal?
  avgCost     Decimal @db.Decimal(16,4)   // WAC — ດູ C4
  @@id([productId, branchId])
}
```
ຖ້າຍັງບໍ່ຢາກ refactor ໃຫຍ່ໃນຮອບນີ້: ຢ່າງໜ້ອຍປ່ຽນເປັນ `@@unique([branchId, sku])`
ແລະ ປ່ອຍ SKU ຄືນເມື່ອ soft-delete (ຕໍ່ທ້າຍ `sku` ດ້ວຍ `:deleted:<timestamp>`).

---

### C4. ບໍ່ມີວິທີຕີມູນຄ່າສະຕັອກ (Costing method) — ຜິດ IAS 2

**ຈຸດ:** `Product.costPrice` ເປັນຄ່າດຽວທີ່ແກ້ດ້ວຍມືໄດ້
([inventory.service.ts:298-300](apps/backend/src/modules/inventory/inventory.service.ts#L298-L300)),
ແລະ `stockValue = stockQty × costPrice` ([:181](apps/backend/src/modules/inventory/inventory.service.ts#L181)).

ບັນຫາ:
- **ຮັບ PO ບໍ່ອັບເດດ cost ເລີຍ** — `receivePurchaseOrder` ບັນທຶກ `PurchaseOrderItem.unitCost`
  ແຕ່ບໍ່ນຳມາຄິດ moving average. ຊື້ຄັ້ງທຳອິດ 10,000 ກີບ ຄັ້ງທີສອງ 15,000 ກີບ → ມູນຄ່າຍັງຄິດ 10,000 ໝົດ
- **ຄ່າ cost ປ່ຽນຍ້ອນຫຼັງ** — ແກ້ `costPrice` ມື້ນີ້ ແລ້ວມູນຄ່າສະຕັອກ **ຂອງທຸກໄລຍະທີ່ຜ່ານມາ** ປ່ຽນຕາມ
  → ປິດງົບເດືອນແລ້ວຕົວເລກຍັງຂ້ຽນໄດ້ = ຜິດຫຼັກບັນຊີ
- **ບໍ່ມີ COGS** — ບໍ່ມີການບັນທຶກຕົ້ນທຶນສິນຄ້າທີ່ຖືກໃຊ້ໄປໃນນັດໝາຍ ເຂົ້າໄປໃນລະບົບການເງິນ
  (`finance.prisma` ບໍ່ມີຄວາມສຳພັນກັບ inventory ເລີຍ)

**ວິທີແກ້ (ແນະນຳ Weighted Average Cost — ງ່າຍກວ່າ FIFO ແລະ IAS 2 ຮັບຮອງ):**

1. ເພີ່ມ `avgCost Decimal @db.Decimal(16,4)` ໃສ່ stock record
2. ຕອນຮັບເຄື່ອງ (PURCHASE_IN):
   ```
   avgCost ໃໝ່ = (onHand_ເກົ່າ × avgCost_ເກົ່າ + qtyຮັບ × unitCostຮັບ) / (onHand_ເກົ່າ + qtyຮັບ)
   ```
3. ເພີ່ມໃສ່ `StockMovement`: `unitCost Decimal(16,4)` ແລະ `valueChange Decimal(16,2)`
   → ໄດ້ **valued stock ledger** ທີ່ພິມອອກເປັນເອກະສານບັນຊີໄດ້ ແລະ ຄິດມູນຄ່າ ຍ້ອນຫຼັງ ຕາມວັນທີໃດກໍໄດ້
4. ຕອນ `SERVICE_CONSUMED` → ບັນທຶກ COGS (qty × avgCost ຂະນະນັ້ນ) ຜູກກັບ `appointmentId`
   → ຮ້ານຈະຮູ້ **ກຳໄລຕໍ່ບໍລິການທີ່ແທ້ຈິງ** (ລາຍຮັບ − ຄ່າຄອມ − ຕົ້ນທຶນວັດຖຸ)
5. ຖ້າຕ້ອງການ FIFO ຕາມກົດໝາຍ: ຕ້ອງມີ lot layer (ດູ C5) ແລ້ວຕັດແບບ FIFO/FEFO

---

### C5. ບໍ່ມີ Lot / Batch / ວັນໝົດອາຍຸ — ຜິດມາດຕະຖານເຄື່ອງສຳອາງ & ຄລີນິກ

> ✅ **FIXED 2026-09-24 (ຄື້ນ 9C)** — ລາຍລະອຽດ + ຂໍ້ແຕກຕ່າງຈາກ sketch ຂ້າງລຸ່ມ ໃນຫົວຂໍ້ "ຄື້ນ 9C".

ທຸລະກິດນີ້ (ຮ້ານເສີມສວຍ + ຄລີນິກຜິວໜັງ) ໃຊ້ **ເຄື່ອງສຳອາງ, ນ້ຳຢາເຄມີ, ຢາສີດ/filler**
ຊຶ່ງທັງ **ASEAN Cosmetic Directive** ແລະ **GMP** ບັງຄັບໃຫ້ສືບຍ້ອນ lot ໄດ້. ປັດຈຸບັນ:
- ບໍ່ມີ model ໃດເກັບ lot number / ວັນໝົດອາຍຸ / ວັນຜະລິດ
- ຖ້າຜູ້ຜະລິດປະກາດ **recall lot ໃດໜຶ່ງ** → ຫາບໍ່ໄດ້ວ່າຂອງ lot ນັ້ນຖືກໃຊ້ກັບລູກຄ້າຄົນໃດແດ່
- ບໍ່ມີການເຕືອນສິນຄ້າໃກ້ໝົດອາຍຸ → ເສຍຫາຍທາງການເງິນ ແລະ ຄວາມສ່ຽງຕໍ່ລູກຄ້າ
- ບໍ່ມີ **FEFO** (First-Expired-First-Out) ຕອນຕັດສະຕັອກ

**ວິທີແກ້:**
```prisma
model StockLot {
  id          String   @id @default(uuid())
  productId   String
  branchId    String
  lotNumber   String
  expiryDate  DateTime? @db.Date
  mfgDate     DateTime? @db.Date
  qtyOnHand   Decimal  @db.Decimal(16,3)
  unitCost    Decimal  @db.Decimal(16,4)
  receivedAt  DateTime @default(now())
  poItemId    String?
  @@unique([productId, branchId, lotNumber])
  @@index([productId, expiryDate])
}
```
+ `StockMovement.lotId String?`
+ `Product.trackLot Boolean` (ບໍ່ແມ່ນທຸກສິນຄ້າຕ້ອງຕິດຕາມ lot — ຜ້າເຊັດມື ບໍ່ຕ້ອງ)
+ ຕັດສະຕັອກແບບ FEFO ເມື່ອ `trackLot = true`
+ Job ແຈ້ງເຕືອນ `expiryDate <= today + 60 ວັນ` (ຕໍ່ກັບລະບົບ notification ທີ່ມີຢູ່ແລ້ວ)
+ ຫົວ ledger ໃນໜ້ານັດໝາຍ ຄວນສະແດງ lot ທີ່ໃຊ້ກັບລູກຄ້າ → recall ໄດ້ໃນ 1 query

---

## 3. ບັນຫາລະດັບ HIGH

### H1. Ledger ບໍ່ບອກວ່າ **ໃຜ** ເປັນຄົນເຮັດ
`StockMovement` ບໍ່ມີ `createdByUserId` ([inventory.prisma:52-71](apps/backend/prisma/schema/inventory.prisma#L52-L71)).
ການປັບສະຕັອກດ້ວຍມືເປັນຈຸດສ່ຽງທຸດຈະລິດອັນດັບ 1 ໃນທຸກລະບົບສາງ. ຖ້າສະຕັອກຫາຍ ຈະສືບບໍ່ໄດ້ວ່າໃຜປັບ.
`AuditLog` middleware ດັກໄດ້ກໍຈິງ ແຕ່ `oldValue` ເປັນ `null` ສະເໝີ
([auditLog.ts:9](apps/backend/src/middlewares/auditLog.ts#L9)) ແລະ ບໍ່ໄດ້ຜູກກັບແຖວ ledger.

**ແກ້:** ເພີ່ມ `createdByUserId String?` + relation `User`, ບັນທຶກທຸກຈຸດທີ່ສ້າງ movement,
ສະແດງຖັນ "ຜູ້ເຮັດລາຍການ" ໃນ [StockLedgerPage.tsx](apps/web-admin/src/features/inventory/StockLedgerPage.tsx).

### H2. ບໍ່ມີເຫດຜົນ (Reason code) ແລະ ການອະນຸມັດ ຂອງການປັບສະຕັອກ
`stockAdjustSchema` ມີພຽງ `delta` + `notes` ແບບຂໍ້ຄວາມອິດສະຫຼະ
([inventory.schema.ts:118-122](packages/shared-types/src/inventory.schema.ts#L118-L122)).
ມາດຕະຖານສາກົນຕ້ອງມີ **reason code ແບບ enum** ເພື່ອອອກລາຍງານການສູນເສຍ (shrinkage report):

```
DAMAGED | EXPIRED | LOST_OR_THEFT | COUNT_VARIANCE | SAMPLE_OR_TESTER |
INTERNAL_USE | CUSTOMER_COMPENSATION | SUPPLIER_RETURN | OPENING_BALANCE
```
+ ຂີດຈຳກັດມູນຄ່າ: ປັບເກີນ X ກີບ ຕ້ອງໃຫ້ SUPER_ADMIN ອະນຸມັດ (maker-checker)
+ ບັງຄັບໃສ່ `notes` ເມື່ອ reason = LOST_OR_THEFT / COUNT_VARIANCE
+ ຮອງຮັບແນບຮູບ (ຂອງເສຍຫາຍ)

### H3. ບໍ່ມີການນັບສະຕັອກຈິງ (Stock-take / Cycle count)
ບໍ່ມີ model, endpoint ຫຼື ໜ້າຈໍໃດໆ. ນີ້ເປັນ **ໂມດູນບັງຄັບ** ຂອງທຸກລະບົບສາງມາດຕະຖານ
(ບັນຊີຕ້ອງພິສູດຍອດປາຍງວດດ້ວຍການນັບຈິງ).

**ຕ້ອງເພີ່ມ:**
```prisma
model StockCount {
  id, branchId, countNumber, status (DRAFT|COUNTING|PENDING_APPROVAL|POSTED|CANCELLED),
  type (FULL|CYCLE|SPOT), scheduledAt, startedAt, postedAt,
  countedByUserId, approvedByUserId, notes
  lines StockCountLine[]
}
model StockCountLine {
  countId, productId, lotId?, systemQty, countedQty, variance, varianceValue, reasonCode?, notes
}
```
Flow: ສ້າງໃບນັບ (snapshot ຍອດລະບົບ) → ນັບ (ຄວນນັບຜ່ານມືຖື/ສະແກນ barcode) → ອະນຸມັດ →
post ອອກເປັນ `ADJUSTMENT_ADD/DEDUCT` ພ້ອມ reason `COUNT_VARIANCE` ໃນ transaction ດຽວ.
ພ້ອມ **ລັອກສິນຄ້າ** ບໍ່ໃຫ້ເຄື່ອນໄຫວລະຫວ່າງນັບ (ຫຼື ໃຊ້ snapshot + delta reconciliation).

### H4. ຮັບເຄື່ອງໄດ້ແຕ່ແບບ "ຮັບໝົດ" — ບໍ່ມີ GRN / ຮັບບາງສ່ວນ / 3-way match
`receivePurchaseOrder` ຮັບເຕັມຈຳນວນທຸກລາຍການໃນຄັ້ງດຽວ
([inventory.service.ts:626-665](apps/backend/src/modules/inventory/inventory.service.ts#L626-L665)).
ໃນຄວາມເປັນຈິງ ຜູ້ສະໜອງສົ່ງບໍ່ຄົບ / ສົ່ງເປັນຮອບ / ສົ່ງຂອງເສຍມາ ເປັນເລື່ອງປົກກະຕິ.

**ຕ້ອງເພີ່ມ:**
- `PurchaseOrderItem.qtyReceived Decimal @default(0)` + status ຕໍ່ແຖວ
- `POStatus` ເພີ່ມ `PARTIALLY_RECEIVED`
- model `GoodsReceipt` + `GoodsReceiptLine` (ວັນຮັບ, ຜູ້ຮັບ, ເລກໃບສົ່ງຂອງຜູ້ສະໜອງ, lot, ວັນໝົດອາຍຸ, ຈຳນວນປະຕິເສດ)
- ຮັບເກີນ (over-receipt) ຕ້ອງມີ tolerance % ທີ່ຕັ້ງຄ່າໄດ້
- **3-way match**: PO ↔ GRN ↔ ໃບເກັບເງິນຜູ້ສະໜອງ (`SupplierInvoice`) — ຈຸດຄວບຄຸມພາຍໃນທີ່ສຳຄັນທີ່ສຸດຂອງຝ່າຍຈັດຊື້

### H5. `RETURN_TO_SUPPLIER` ເປັນ enum ທີ່ຕາຍແລ້ວ
ມີໃນ Prisma enum, ໃນ zod schema, ໃນ UI badge ([StockLedgerPage.tsx:20](apps/web-admin/src/features/inventory/StockLedgerPage.tsx#L20))
ແລະ ໃນ i18n — ແຕ່ **ບໍ່ມີໂຄ້ດໃດໃນ backend ສ້າງ movement ປະເພດນີ້ເລີຍ**. ຜູ້ໃຊ້ຈະກັ່ນຕອງແລ້ວເຫັນວ່າງເປົ່າຕະຫຼອດ.
→ ຕ້ອງເຮັດ endpoint ຄືນສິນຄ້າຜູ້ສະໜອງ (ຜູກກັບ PO/GRN, ອອກ debit note) ຫຼື ເອົາອອກຈາກ UI ໄປກ່ອນ.

### H6. ບໍ່ມີການໂອນສາຂາ (Inter-branch transfer)
ຫຼາຍສາຂາແຕ່ບໍ່ມີທາງຍ້າຍຂອງລະຫວ່າງກັນຢ່າງຖືກຕ້ອງ — ປັດຈຸບັນຕ້ອງ "ຫັກອອກສາຂາ A + ເພີ່ມສາຂາ B"
ດ້ວຍມື 2 ຄັ້ງ ໂດຍບໍ່ມີສາຍພົວພັນ, ບໍ່ມີສະຖານະ "ກຳລັງຂົນສົ່ງ" (in-transit), ບໍ່ມີການຢືນຢັນປາຍທາງ.
**ຕ້ອງເພີ່ມ:** `StockTransfer` + `StockTransferLine`, movement type `TRANSFER_OUT` / `TRANSFER_IN`,
ສະຖານະ `DRAFT → IN_TRANSIT → RECEIVED`, ພ້ອມ in-transit stock ທີ່ນັບເປັນຊັບສິນແຕ່ບໍ່ຢູ່ສາຂາໃດ.

### H7. ບໍ່ມີການຈອງ (Reservation) — `stockQty` ບໍ່ບອກວ່າ "ໃຊ້ໄດ້ຈິງ" ເທົ່າໃດ
ມາດຕະຖານ ERP ຕ້ອງແຍກ **On hand / Reserved / Available / On order**.
ປັດຈຸບັນມີແຕ່ຕົວເລກດຽວ → ນັດໝາຍ 10 ຄົນທີ່ຈອງໄວ້ອາທິດໜ້າ ບໍ່ໄດ້ຖືກນັບວ່າຈະໃຊ້ນ້ຳຢາໄປເທົ່າໃດ
→ ຮ້ານຈະຮູ້ວ່າຂອງໝົດ ກໍຕໍ່ເມື່ອລູກຄ້ານັ່ງຢູ່ເທິງຕັ່ງແລ້ວ.

**ແກ້:** ຈອງ consumable ຕອນນັດໝາຍ `CONFIRMED`, ປົດຈອງຕອນ `CANCELLED`/`NO_SHOW`,
ປ່ຽນຈອງເປັນຕັດຈິງຕອນ `COMPLETED`. `available = onHand − reserved`.
UI ຕ້ອງສະແດງ 3 ຕົວເລກ ບໍ່ແມ່ນຕົວດຽວ.

---

## 4. ບັນຫາລະດັບ MEDIUM

| # | ບັນຫາ | ຈຸດ | ຂໍ້ແນະນຳ |
|---|---|---|---|
| M1 | **ບໍ່ມີລະບົບໜ່ວຍນັບ (UoM)** — `unit` ເປັນ `String` ອິດສະຫຼະ ("ຂວດ", "ml", "ກ່ອງ") | [inventory.prisma:41](apps/backend/prisma/schema/inventory.prisma#L41) | ສ້າງ `Uom` + `UomConversion` (ຊື້ເປັນ "ກ່ອງ 12 ຂວດ" ເກັບເປັນ "ຂວດ" ໃຊ້ເປັນ "ml"). ບໍ່ມີສິ່ງນີ້ → ຮັບ PO ໜ່ວຍໜຶ່ງ ຕັດ BOM ອີກໜ່ວຍໜຶ່ງ = ຕົວເລກຜິດ |
| M2 | **ບໍ່ມີ barcode / GTIN** | schema | ເພີ່ມ `gtin`, `barcode` (GS1) → ສະແກນຮັບເຄື່ອງ/ນັບສະຕັອກຜ່ານມືຖືໄດ້ |
| M3 | **ບໍ່ມີໝວດສິນຄ້າ (Category)** | schema | `ProductCategory` — ຈຳເປັນສຳລັບລາຍງານ ແລະ ABC analysis |
| M4 | **`lowStock` filter ດຶງທຸກແຖວມາກັ່ນໃນ memory** | [inventory.service.ts:196-227](apps/backend/src/modules/inventory/inventory.service.ts#L196-L227) | ໃຊ້ raw SQL ທຽບ 2 ຖັນ (`stock_qty <= min_stock_qty`) ຫຼື ເກັບ `isLowStock` ເປັນ generated column + index. ປັດຈຸບັນ 10,000 SKU = ດຶງໝົດທຸກຄັ້ງ |
| M5 | **PO number ເປັນ random hex** `PO-A1B2C3D4` | [inventory.service.ts:494-496](apps/backend/src/modules/inventory/inventory.service.ts#L494-L496) | ຕ້ອງເປັນ sequential ຕໍ່ສາຂາ/ປີ: `PO-2026-VTE-00042` — ກວດສອບເອກະສານໄດ້, ຮູ້ວ່າຂາດເລກໃດ. ພ້ອມ retry ເມື່ອ unique violation (ຕອນນີ້ collision = 500) |
| M6 | **ບໍ່ມີການອະນຸມັດ PO** | routes | ເພີ່ມ `PENDING_APPROVAL`, `approvedByUserId`, ວົງເງິນອະນຸມັດຕໍ່ role |
| M7 | **ແກ້ PO ດ້ວຍ delete + recreate items** | [inventory.service.ts:600-612](apps/backend/src/modules/inventory/inventory.service.ts#L600-L612) | ເສຍປະຫວັດ id ຂອງແຖວ. ຄວນ upsert ຕາມ `productId` + ເກັບ revision history |
| M8 | **Supplier ບໍ່ມີຂໍ້ມູນຈັດຊື້ຈິງ** | schema | ຕ້ອງມີ: ເລກສຸນຍາກອນ/VAT, ເງື່ອນໄຂຊຳລະ (NET30), lead time ວັນ, ສະກຸນເງິນ, ບັນຊີທະນາຄານ, `isActive`, soft-delete, ຜູ້ຕິດຕໍ່ຫຼາຍຄົນ, ລາຍການລາຄາຕໍ່ສິນຄ້າ (`SupplierProduct`: unitCost, MOQ, leadTimeDays) |
| M9 | **Supplier ບໍ່ຜູກສາຂາ ແລະ ບໍ່ມີ branch scope** | [inventory.routes.ts:44-66](apps/backend/src/modules/inventory/inventory.routes.ts#L44-L66) | BRANCH_ADMIN ສາຂາໜຶ່ງ ແກ້/ລຶບ supplier ຂອງທຸກສາຂາໄດ້ — ຜິດຫຼັກ `assertBranchScope` ທີ່ໃຊ້ບ່ອນອື່ນ |
| M10 | **ບໍ່ມີສະກຸນເງິນ / ອັດຕາແລກປ່ຽນ ໃນ PO** | schema | ຜູ້ສະໜອງເຄື່ອງສຳອາງມັກອອກໃບເກັບເງິນເປັນ THB/USD. ຕ້ອງມີ `currency` + `fxRate` + ລັອກອັດຕາຕອນຮັບເຄື່ອງ |
| M11 | **ຈຸດສັ່ງຊື້ໃໝ່ຢູ່ບົນ `minStockQty` ຄົງທີ່** | schema | ມາດຕະຖານ: `reorderPoint = ການໃຊ້ສະເລ່ຍຕໍ່ວັນ × lead time + safety stock`. ຄິດອັດຕະໂນມັດຈາກ ledger ຍ້ອນຫຼັງ 90 ວັນ + ແນະນຳ PO ອັດຕະໂນມັດ |
| M12 | **ບໍ່ມີການປະສານກັບບັນຊີ (GL posting)** | finance module | ຕ້ອງ post: ຮັບເຄື່ອງ → Dr Inventory / Cr AP; ໃຊ້ໄປ → Dr COGS / Cr Inventory; ປັບສະຕັອກ → Dr Shrinkage expense. `Expense` model ປັດຈຸບັນບໍ່ກ່ຽວກັບ inventory ເລີຍ |
| M13 | **ບໍ່ມີການຂາຍສິນຄ້າໜ້າຮ້ານ (retail / OTC)** | ທົ່ວລະບົບ | ສິນຄ້າຖືກຕັດໄດ້ແຕ່ຜ່ານ BOM ບໍລິການ. ຮ້ານເສີມສວຍຂາຍແຊມພູ/ຄຣີມກັບບ້ານເປັນລາຍໄດ້ຫຼັກສ່ວນໜຶ່ງ → ຕ້ອງມີ `retailPrice`, movement type `SOLD`, ຜູກກັບ `Payment` |
| M14 | **ບໍ່ມີໜ້າສະຕັອກໃນແອັບມືຖື** | `apps/mobile` | ພະນັກງານນັບສະຕັອກ/ເບີກຂອງ/ສະແກນ ຕ້ອງເຮັດຜ່ານມືຖື. ນີ້ຄືວິທີການເຮັດງານຈິງຂອງສາງທັງໝົດໃນສາກົນ |
| M15 | **ບໍ່ມີການ export (CSV/Excel/PDF)** | web-admin | ບັນຊີ/ຜູ້ກວດສອບຕ້ອງການໄຟລ໌. ໜ້າອື່ນມີ CSV ແລ້ວ (ເບິ່ງ Appointments) ແຕ່ inventory ບໍ່ມີ |
| M16 | **ຕົວກັ່ນຕອງວັນທີ `to` ຕັດວັນສຸດທ້າຍອອກ** | [inventory.service.ts:380](apps/backend/src/modules/inventory/inventory.service.ts#L380) | `lte: new Date('2026-09-14')` = ຕອນທ່ຽງຄືນ → ລາຍການໃນມື້ນັ້ນຫາຍໝົດ. ໃຊ້ `lt: ວັນຖັດໄປ` ຫຼື end-of-day ຕາມເຂດເວລາ Vientiane |
| M17 | **`PurchaseOrderItem` ບໍ່ມີ `@@unique([purchaseOrderId, productId])`** | schema | ໃສ່ສິນຄ້າດຽວກັນ 2 ແຖວໃນ PO ດຽວໄດ້ |
| M18 | **N+1 query ຕອນຮັບເຄື່ອງ** | [inventory.service.ts:640](apps/backend/src/modules/inventory/inventory.service.ts#L640) | loop `findUnique` ຕໍ່ລາຍການ. PO 100 ລາຍການ = 300 queries ໃນ transaction ດຽວ → lock ດົນ, ສ່ຽງ timeout |
| M19 | **ບໍ່ມີ reconciliation job** | — | ຕ້ອງມີ job ປະຈຳຄືນ ທຽບ `SUM(movements) == products.stockQty` ແລ້ວແຈ້ງເຕືອນເມື່ອບໍ່ກົງ. ນີ້ຄືຕົວດັກ bug C1 |
| M20 | **ບໍ່ມີ soft-delete ໃນ Supplier ແລະ ບໍ່ມີ `isActive`** | schema | ຜູ້ສະໜອງທີ່ເຊົາໃຊ້ແລ້ວ ຍັງເລືອກໄດ້ໃນ dropdown ຕະຫຼອດ |

---

## 5. ບັນຫາລະດັບ LOW / ຄຸນນະພາບ

- **L1** — `qnum()` ໃຊ້ `|| 0` ([:41-45](apps/backend/src/modules/inventory/inventory.service.ts#L41-L45)) → `NaN` ຈະກາຍເປັນ `0` ແບບງຽບໆ ແທນທີ່ຈະ throw
- **L2** — ການຄິດເລກໃຊ້ `number` (float) ແທນ `Prisma.Decimal` ຕະຫຼອດ → ຄ່າສະສົມຜິດໃນລະດັບ 3 ຕຳແໜ່ງທົດສະນິຍົມ. ຄວນຄິດດ້ວຍ Decimal ທັງໝົດ ແລ້ວແປງເປັນ number ສະເພາະຕອນສົ່ງອອກ API
- **L3** — ບໍ່ມີ index ໃສ່ `StockMovement.refId` (ແຕ່ `consumeServiceStock` query ດ້ວຍ refId ທຸກຄັ້ງ → seq scan)
- **L4** — ບໍ່ມີໜ້າ "ລາຍລະອຽດສິນຄ້າ" (product detail) ໃນ web-admin — ເບິ່ງ ledger ສະເພາະສິນຄ້າໜຶ່ງບໍ່ໄດ້ (API ຮອງຮັບ `productId` ແລ້ວ ແຕ່ UI ບໍ່ໄດ້ໃຊ້)
- **L5** — ຕົວກັ່ນຕອງ `StockLedgerPage` ບໍ່ມີຊ່ອງເລືອກສິນຄ້າ ແລະ ບໍ່ມີຕົວກັ່ນຕອງວັນທີ (ທັງໆທີ່ API ຮອງຮັບ `from`/`to`)
- **L6** — Test coverage: 6 test cases ເທົ່ານັ້ນ. ຂາດ test ສຳລັບ concurrency, ສະຕັອກຕິດລົບຜ່ານ BOM, ການຕີມູນຄ່າ, ການຮັບ PO ຊ້ຳ, soft-delete + SKU
- **L7** — `deleteProduct` ບໍ່ກວດວ່າສິນຄ້າຍັງມີສະຕັອກເຫຼືອຢູ່ ຫຼື ຍັງຖືກອ້າງອີງໃນ `ServiceConsumable` → ລຶບໄປແລ້ວ BOM ຈະ `continue` ຂ້າມແບບງຽບໆ ([:441](apps/backend/src/modules/inventory/inventory.service.ts#L441)) = ບໍລິການຕັດສະຕັອກບໍ່ໄດ້ໂດຍບໍ່ມີໃຜຮູ້
- **L8** — `inventoryStats` ດຶງທຸກ product ມາຄິດໃນ JS ([:340-367](apps/backend/src/modules/inventory/inventory.service.ts#L340-L367)) → ຄວນໃຊ້ SQL aggregate

---

## 6. ສິ່ງທີ່ຂາດທັງໝົດເມື່ອທຽບກັບ ERP ມາດຕະຖານ (Feature gap checklist)

| ຄວາມສາມາດ | ມາດຕະຖານສາກົນ | ລະບົບເຮົາ |
|---|---|---|
| Item master ແຍກຈາກ stock ຕໍ່ສາຂາ | ✅ ບັງຄັບ | ❌ |
| ໝວດສິນຄ້າ / ABC classification | ✅ | ❌ |
| UoM + ການແປງໜ່ວຍ | ✅ ບັງຄັບ | ❌ |
| Barcode / GTIN + ສະແກນ | ✅ | ❌ |
| Lot / Batch / Serial | ✅ ບັງຄັບ (ເຄື່ອງສຳອາງ/ຢາ) | ❌ |
| ວັນໝົດອາຍຸ + FEFO + ແຈ້ງເຕືອນ | ✅ ບັງຄັບ | ❌ |
| ຫຼາຍ location ໃນສາຂາ (ຊັ້ນວາງ/ຕູ້ເຢັນ) | ✅ | ❌ |
| Costing WAC / FIFO | ✅ ບັງຄັບ (IAS 2) | ❌ |
| Valued stock ledger | ✅ ບັງຄັບ | ❌ |
| COGS posting → GL | ✅ ບັງຄັບ | ❌ |
| On hand / Reserved / Available / On order | ✅ ບັງຄັບ | ⚠️ ມີແຕ່ຕົວດຽວ |
| Stock-take / Cycle count + variance approval | ✅ ບັງຄັບ | ❌ |
| Reason code ການປັບສະຕັອກ | ✅ ບັງຄັບ | ❌ |
| ໂອນລະຫວ່າງສາຂາ + in-transit | ✅ | ❌ |
| PO approval workflow | ✅ | ❌ |
| GRN / ຮັບບາງສ່ວນ / ຮັບເກີນ tolerance | ✅ ບັງຄັບ | ❌ |
| 3-way match (PO/GRN/Invoice) | ✅ ບັງຄັບ | ❌ |
| ຄືນສິນຄ້າຜູ້ສະໜອງ + debit note | ✅ | ⚠️ enum ຢູ່ໂດດດ່ຽວ |
| Supplier price list / MOQ / lead time | ✅ | ❌ |
| Reorder point ອັດຕະໂນມັດ + ແນະນຳ PO | ✅ | ⚠️ minQty ຄົງທີ່ |
| ບັນທຶກຜູ້ເຮັດລາຍການໃນ ledger | ✅ ບັງຄັບ | ❌ |
| ລາຍງານ: turnover, days-on-hand, aging, shrinkage | ✅ | ❌ |
| ລາຍງານມູນຄ່າສະຕັອກ ຕາມວັນທີຍ້ອນຫຼັງ | ✅ ບັງຄັບ | ❌ |
| Export CSV/Excel/PDF | ✅ | ❌ |
| ນັບສະຕັອກຜ່ານມືຖື | ✅ | ❌ |
| BOM ຕັດສະຕັອກອັດຕະໂນມັດ | ✅ | ✅ ມີແລ້ວ ແລະ idempotent (ດີ) |
| Branch scope ໃນການແກ້ໄຂ | ✅ | ✅ ມີ (ຍົກເວັ້ນ Supplier) |
| Audit log ລວມ | ✅ | ⚠️ ມີແຕ່ບໍ່ມີ oldValue |

---

## 7. ແຜນປະຕິບັດ — ແນະນຳຈັດເປັນ 4 ຄື້ນ (Phase 9: Inventory Pro)

### 🔴 ຄື້ນ 9A — ແກ້ຄວາມຖືກຕ້ອງ (1–2 ອາທິດ) · ບໍ່ມີ feature ໃໝ່, ແກ້ bug ຢ່າງດຽວ — ✅ **DONE 2026-09-14**
1. ✅ C1 — ແທນທີ່ read→calc→write ດ້ວຍ `SELECT ... FOR UPDATE` (row lock) ໃນ `adjustStock`,
   `consumeServiceStock`, `receivePurchaseOrder` (ລວມທັງ lock ແຖວ PO ເອງ ກັນຮັບເຄື່ອງຊ້ຳ) + DB trigger
   `check_products_stock_non_negative` ເປັນ safety net ຊັ້ນສຸດທ້າຍ (ໃຊ້ trigger ແທນ CHECK ທຳມະດາ ເພາະ
   ຕ້ອງອະນຸຍາດຂໍ້ຍົກເວັ້ນເມື່ອ branch ເປີດ `allowNegativeStock`)
2. ✅ C2 — `consumeServiceStock` ກວດ negative + throw 409 ເມື່ອ branch ບໍ່ໄດ້ເປີດ `allowNegativeStock`
   (field ໃໝ່ໃນ `Branch`, default false); `totalStockValue`/`stockValue` clamp ບໍ່ໃຫ້ຕິດລົບ
3. ✅ C3 — `Product.sku` ປ່ຽນເປັນ `@@unique([branchId, sku])`; soft-delete ຕໍ່ທ້າຍ sku ດ້ວຍ
   `:deleted:<timestamp>` ເພື່ອປົດປ່ອຍໃຫ້ໃຊ້ຄືນໄດ້
4. ✅ H1 — ເພີ່ມ `StockMovement.createdByUserId` (null = ລະບົບອັດຕະໂນມັດ), ສະແດງຖັນ "ຜູ້ເຮັດລາຍການ"
   ໃນ `StockLedgerPage.tsx`
5. ✅ M16 — `listStockMovements` ຮັບ `to` ເປັນວັນທີລ້ວນໆ ຫຼື full ISO, ຄິດເປັນ exclusive upper bound ຖືກຕ້ອງ
6. ✅ M19 — `reconcileStock()` + `jobs/stock-reconciliation.job.ts` ຮັນທຸກຄືນ 02:30, ແຈ້ງເຕືອນ SUPER_ADMIN
   ຜ່ານ `notifyUser` ເມື່ອພົບ mismatch
7. ✅ L6 — ເພີ່ມ 7 test ໃໝ່ໃນ `inventory.test.ts` (13 ລວມ): SKU reuse, ledger createdByUserId, PO dedupe
   items (M17), M16 date filter, concurrency (20 ຄຳຂໍພ້ອມກັນ → ຍອດຖືກຕ້ອງ), BOM negative-stock block +
   `allowNegativeStock` exception, `reconcileStock()` ຈັບ mismatch
   ຂອບເຂດອອກ: M18 (N+1 receive loop) ບໍ່ໄດ້ແກ້ (ຍັງເປັນ per-item query, ແຕ່ຕອນນີ້ lock-safe ແລ້ວ);
   C2's "exception record" ເຕັມຮູບແບບຍັງບໍ່ໄດ້ເຮັດ (ໃຊ້ branch flag + note tag ແທນໄປກ່ອນ)
> **ຜົນ:** ຕົວເລກສະຕັອກເຊື່ອຖືໄດ້. Migration `20260914055343_inventory_audit_wave9a` ຖືກ apply ແລ້ວທັງ
> dev ແລະ test DB.

**UI follow-up (ດຽວກັນ 2026-09-14, ຫຼັງຄຳຮ້ອງຂໍ "ບໍ່ເຫັນການປ່ຽນແປງໜ້າ UI")** — wave 9A ຕອນທຳອິດແກ້
ສະເພາະ backend/ledger; ເພີ່ມໜ້າຈໍໃຫ້ເຫັນຈິງ:
- ✅ ສະຫຼັບ **"ອະນຸຍາດສະຕັອກຕິດລົບ"** (ຜູກກັບ `Branch.allowNegativeStock`, C2) — ປາກົດ 2 ບ່ອນ:
  ໜ້າ Inventory ▸ Products (ເມື່ອເລືອກສາຂາໃດໜຶ່ງ, ບໍ່ແມ່ນ "ທຸກສາຂາ") ແລະ ໜ້າ Branches ▸ ແກ້ໄຂສາຂາ
  (ໃນ section ສະຖານະ, ຄຽງກັບ "ເປີດໃຊ້ງານ")
- ✅ ປ້າຍ **"ຕິດລົບ"** (danger badge) ແຍກອອກຈາກ "ໝົດ" ໃນຖັນສະຕັອກຂອງຕາຕະລາງສິນຄ້າ ເມື່ອ `stockQty < 0`
  (ກ່ອນໜ້ານີ້ທັງສອງກໍລະນີສະແດງເປັນ "ໝົດ" ຄືກັນ)
- ✅ ຖັນ **"ຜູ້ເຮັດລາຍການ"** ໃນ Stock Ledger (H1) — ມີຢູ່ແລ້ວຕັ້ງແຕ່ຮອບທຳອິດ, ຢືນຢັນອີກຄັ້ງວ່າສະແດງຢູ່
- ຍັງບໍ່ໄດ້ເຮັດ (ຢູ່ນອກຂອບເຂດ 9A): dashboard/badge ສະຫຼຸບຜົນ `reconcileStock()` (M19 ຍັງເປັນແຕ່ job+ແຈ້ງເຕືອນ
  push, ບໍ່ມີໜ້າຈໍສະຫຼຸບ), ຕົວກັ່ນຕອງສິນຄ້າ/ວັນທີໃນ Stock Ledger (L5), export CSV (M15)

**Visual redesign (ດຽວກັນ 2026-09-14, ຮອບທີ 2, ຫຼັງຄຳຮ້ອງຂໍ "ໃຫ້ສວຍງາມຂຶ້ນ" + ui-ux-pro-max skill)** —
ໃຊ້ design-system/aura-admin ທີ່ມີຢູ່ແລ້ວ (ບໍ່ແມ່ນ palette ໃໝ່) ແລະ ຮູບແບບທີ່ໃຊ້ຢູ່ແລ້ວໃນ Customers/Queue:
- ✅ ສ້າງ `InventoryStatCard.tsx` (mirror `QueueStatCard`/`CustomerStatCard`) — stat tile ມີ tone-tinted
  icon chip + left accent bar + entrance animation, ແທນ `StatCard` ແບບແປນທີ່ໃຊ້ຢູ່ກ່ອນ. Tone ຕໍ່ card:
  Total=primary, Low=warning (ຄລິກໄດ້ → toggle "low stock only"), Out=danger, Value=success.
  ເພີ່ມ hint ທີ່ເປັນປະໂຫຍດ (surfaces `activeProducts`/`openPurchaseOrders` ທີ່ບໍ່ເຄີຍສະແດງມາກ່ອນ)
- ✅ ຂະຫຍາຍ `StatusPill` ໃຫ້ຮັບ `variant` override ແລະ ນຳໄປໃຊ້ແທນ `Badge` ດິບ ໃນ: stock status
  (Inventory Products), movement type (Stock Ledger), PO status (Purchase Orders — ທັງຕາຕະລາງ ແລະ
  detail sheet) → ໄດ້ dot ນຳໜ້າຄືກັນໝົດ, ບໍ່ແມ່ນສີຢ່າງດຽວ (ux: "color only" anti-pattern)
- ✅ ຄໍລຳຕົວເລກທັງໝົດ (Stock/Min/Cost/Stock value/Qty/Balance/Items/Total) ຈັດຊິດຂວາ (`meta:{align:'right'}`)
  ຕາມ design.md §8's "numeric columns right-aligned tabular"
- ✅ "ອະນຸຍາດສະຕັອກຕິດລົບ" card — ອອກແບບໃໝ່ເປັນ state-reflective: icon chip ShieldAlert (ເທົາ = ປິດ,
  ອຳພັນ = ເປີດ), border+bg ປ່ຽນເປັນ `warning-soft` ທັງໝົດເມື່ອເປີດ ເພື່ອໃຫ້ຮູ້ວ່າ "exception mode active"
  ບໍ່ແມ່ນສະຫຼັບທຳມະດາ
- ກວດຈິງດ້ວຍ Playwright (`pnpm dev` + mock API) — screenshot light/dark ທັງ 2 ໂໝດ, toggle on/off, ບໍ່ມີ
  console error. Mock handler ຂອງ inventory module ເປັນ stub ຫວ່າງໂດຍເຈດຕະນາ (comment ໃນໄຟລ໌ເອງ) ຈຶ່ງບໍ່ມີ
  product data ໃນ mock ໃຫ້ເບິ່ງແຖວທີ່ມີ badge ຈິງ — layout/tone/motion ຢືນຢັນຜ່ານ empty-state + toggle state.

### 🟠 ຄື້ນ 9B — ບັນຊີ & ການຄວບຄຸມພາຍໃນ (2–3 ອາທິດ)
1. ✅ **C4 — WAC costing — DONE 2026-09-24.** `Product.costPrice` ຕອນນີ້ເປັນ WAC ຂະຫຍາຍເປັນ
   `Decimal(16,4)` (ຈາກ 2dp) ອັບເດດອັດຕະໂນມັດຕອນຮັບເຄື່ອງ (`receivePurchaseOrder`/`receiveStockTransfer`)
   ດ້ວຍສູດ `wacAfterReceipt()` ໃນ `inventory.service.ts`; `StockMovement` ເພີ່ມ `unitCost Decimal(16,4)?`
   + `valueChange Decimal(16,2)?` ໃຫ້ທຸກປະເພດການເໜັງຕີງ (ບວກ=ຮັບເຂົ້າ àºàº²àº¡ ຕົ້ນທຶນຮັບ, ລົບ=ຕັດອອກ/COGS
   àºàº²àº¡ WAC *ກ່ອນ* ຕັດ) — ໄດ້ valued ledger ຢ່າງແທ້ຈິງ, ບໍ່ backfill ແຖວເກົ່າ (null). ການປັບດ້ວຍມື
   (`adjustStock`) ແລະ ໂອນອອກ (`sendStockTransfer`) ບັນທຶກ unitCost/valueChange ນຳແຕ່ **ບໍ່**ປ່ຽນ WAC.
   Migration `20260924120000_inventory_wac_costing` (additive: widen costPrice ເປັນ 4dp + ເພີ່ມ 2 ຖັນ
   nullable ໃນ stock_movements) ຖືກ apply ແລ້ວທັງ dev ແລະ test DB ໂດຍບໍ່ reset ຂໍ້ມູນ.
2. ✅ **C4b — COGS summary — DONE 2026-09-24.** `getCogsSummary()` + `GET /stock-movements/cogs-summary`
   (sum `valueChange` ຂອງ `SERVICE_CONSUMED` ຕໍ່ສາຂາ/ຊ່ວງວັນທີ) — ພ້ອມໃຫ້ Finance/Dashboard ເອົາໄປທຽບ
   ກັບລາຍຮັບໃນຮອບຕໍ່ໄປ. ໜ້າ Inventory ▸ Products ເພີ່ມ stat card "ຕົ້ນທຶນສິນຄ້າທີ່ໃຊ້ (COGS)" ຂອງ
   ເດືອນນີ້; ໜ້າ Stock Ledger ເພີ່ມ 2 ຖັນ "ຕົ້ນທຶນ/ໜ່ວຍ" + "ມູນຄ່າ" (signed, ສີຂຽວ/ແດງ). ຜູກເຂົ້າ P&L
   ແລ້ວໃນຂໍ້ 8 ລຸ່ມນີ້ (M12-lite)
3. ✅ **H2 — reason code + maker-checker + ແນບຮູບ — DONE 2026-09-24.** Migration
   `20260924160000_inventory_adjust_reason_maker_checker` (additive: enum `StockAdjustReason` 10 ຄ່າ +
   `StockAdjustRequestStatus`, `StockMovement.reasonCode`/`attachmentUrl`, ຕາຕະລາງ `stock_adjustment_requests`;
   backfill ຍອດເປີດເກົ່າເປັນ `OPENING_BALANCE`; apply ແລ້ວທັງ dev ແລະ test DB).
   - `stockAdjustSchema` ບັງຄັບ `reason`; `notes` ບັງຄັບເມື່ອ LOST_OR_THEFT / COUNT_VARIANCE / OTHER (zod refine).
     ຍອດເປີດຂອງສິນຄ້າໃໝ່ຖືກໝາຍ `OPENING_BALANCE` ອັດຕະໂນມັດ.
   - **Maker-checker**: AppSetting `inventory.adjustApprovalThresholdLak` (default 1,000,000 ກີບ;
     `GET/PUT /stock-adjustments/settings`, PUT = SUPER_ADMIN). ຜູ້ທີ່ບໍ່ແມ່ນ SUPER_ADMIN ປັບເກີນ |delta| × WAC >
     ເກນ → `POST /stock-movements/adjust` ຕອບ **202** `{outcome:'PENDING_APPROVAL', request}` (stockQty ບໍ່ປ່ຽນ) +
     ແຈ້ງ SUPER_ADMIN (`STOCK_ADJUST_PENDING` ຜ່ານ `notifyUser`). `POST /stock-adjustments/:id/approve` lock ແຖວຄຳຂໍ →
     post ຜ່ານ `postAdjustment()` ດຽວກັນກັບການປັບປົກກະຕິ (lockProductRow, ກວດຕິດລົບຄືນ, FEFO) ໃນ tx ດຽວ;
     `createdByUserId` ຂອງ ledger = ຜູ້ຍື່ນ (maker), ຜູ້ອະນຸມັດເກັບໃນຄຳຂໍ. `/reject` ຕ້ອງມີເຫດຜົນ. ປົກກະຕິຕອບ **201**
     `{outcome:'POSTED', movement}` (response shape ປ່ຽນ — web-admin ອັບເດດແລ້ວ).
   - **ແນບຮູບ**: `photo {contentType, dataBase64}` (JPG/PNG/WebP ≤ 5MB, ໃຊ້ `storage` ດຽວກັບ expenses) →
     `attachmentUrl` ໃນຄຳຂໍ ແລະ ແຖວ ledger (ບໍ່ມີ hash/OCR ຄື ExpenseAttachment — ຮູບດຽວຕໍ່ການປັບ).
   - **Web-admin**: dialog ປັບສະຕັອກມີ select ເຫດຜົນ + notes ບັງຄັບຕາມເຫດຜົນ + ແນບຮູບ + ເຕືອນ "ຈະສົ່ງຂໍອະນຸມັດ";
     card "ການປັບສະຕັອກລໍອະນຸມັດ" ໃນໜ້າ Products (SUPER_ADMIN ອະນຸມັດ/ປະຕິເສດ/ແກ້ເກນ; BRANCH_ADMIN ເບິ່ງຢ່າງດຽວ);
     ledger + detail dialog ສະແດງເຫດຜົນ ແລະ ຮູບ.
4. ✅ **H3 — Stock-take / cycle count ຄົບວົງຈອນ — DONE 2026-09-25.** Migration
   `20260925090000_inventory_stock_count` (additive: enum `StockCountStatus`/`StockCountType`, ຕາຕະລາງ `stock_counts` +
   `stock_count_lines`; apply ແລ້ວທັງ dev ແລະ test DB). ເລກ `SC-<ລະຫັດສາຂາ>-<ປີ>-000001` ຜ່ານ `nextDocumentNo` (DocType `SC`).
   - ວົງຈອນ `DRAFT → COUNTING → PENDING_APPROVAL → POSTED | CANCELLED` (`stock-count.service.ts`, `/stock-counts`, admin ເທົ່ານັ້ນ,
     BRANCH_ADMIN ຖືກ scope). FULL = ທຸກສິນຄ້າ active ຂອງສາຂາ; CYCLE/SPOT = ເລືອກສິນຄ້າ. ຕອນ start: lock ແຖວສິນຄ້າ → startedAt →
     snapshot systemQty; ສິນຄ້າ trackLot ແຕກເປັນ 1 ແຖວ/lot (qtyOnHand>0) + 1 ແຖວ "ບໍ່ມີ lot" ສຳລັບສ່ວນທີ່ເຫຼືອ.
   - **ບໍ່ lock ສິນຄ້າລະຫວ່າງນັບ — ໃຊ້ snapshot + delta**: `variance = countedQty − (systemQty + Σ movement ສຸດທິຂອງສິນຄ້າ/lot ນັ້ນ
     ນັບແຕ່ startedAt)` (ບໍ່ລວມແຖວ `count:<id>` ຂອງໃບເອງ); UI ເຕືອນເມື່ອມີການເໜັງຕີງລະຫວ່າງນັບ ແລະ ສະແດງຖັນ "ເໜັງຕີງລະຫວ່າງນັບ/ຄາດໄວ້".
   - Submit ຕ້ອງນັບຄົບທຸກແຖວ. Approve: SUPER_ADMIN ສະເໝີ; BRANCH_ADMIN ເມື່ອ Σ|varianceValue| ບໍ່ເກີນ
     `inventory.adjustApprovalThresholdLak` (ເກນດຽວກັບ H2, ເກີນ → 403 + ແຈ້ງ SUPER_ADMIN ຕອນ submit). Post ໃນ tx ດຽວ + lock
     ສິນຄ້າ: ທຸກສ່ວນຕ່າງ ≠ 0 → ADJUSTMENT_ADD/DEDUCT reason `COUNT_VARIANCE` refId `count:<id>`; ແຖວ lot ປັບ lot ນັ້ນໂດຍກົງ (ບໍ່ FEFO)
     ຕາມຕົ້ນທຶນ lot, ແຖວບໍ່ມີ lot ປັບຕາມ WAC ແລະ WAC ບໍ່ປ່ຽນ; ກວດ allowNegativeStock/lot/ສ່ວນບໍ່ມີ lot ບໍ່ໃຫ້ຕິດລົບ. Reject → ກັບ
     COUNTING ພ້ອມເຫດຜົນ; Cancel ໄດ້ທຸກຂັ້ນກ່ອນ POSTED. `reconcileStock()` ສະອາດຫຼັງ post (ມີ test).
   - Web-admin: tab "ນັບສະຕັອກ" (`/inventory/counts`, ຕ້ອງມີ `inventory:manage`) — ລາຍການ + StatusPill + stat cards, dialog ສ້າງ,
     ໃບນັບ (ປ້ອນ countedQty ບັນທຶກບາງສ່ວນໄດ້, ສ່ວນຕ່າງມີສີ, preview live), submit/approve/reject/cancel, ພິມໃບນັບ (blind ຕອນກຳລັງນັບ).
   - ຂໍ້ຈຳກັດ: `assign-unlotted` ລະຫວ່າງນັບ ບໍ່ຂຽນ movement ຈຶ່ງ delta ບໍ່ເຫັນ (ຢ່າມອບ lot ລະຫວ່າງມີໃບນັບເປີດ); lot ໃໝ່ທີ່ເກີດລະຫວ່າງນັບ
     ບໍ່ຢູ່ໃນໃບ; ຍັງບໍ່ມີການນັບຜ່ານມືຖື/ສະແກນ (M2/M14).
5. ✅ **M5 — ເລກ PO/ໃບໂອນ ແບບ sequential ຕໍ່ສາຂາ/ປີ — DONE 2026-09-24.** ໃຊ້ `nextDocumentNo()` +
   ຕາຕະລາງ `DocumentSequence` ຂອງ wave 10 ຄືນ (ເພີ່ມ DocType `PO`/`TRF`; `INSERT … ON CONFLICT DO UPDATE` ໃນ tx
   ດຽວກັບການສ້າງເອກະສານ → ບໍ່ຊ້ຳ, ບໍ່ຂາດ, rollback ເລກກໍ rollback). ຮູບແບບຕາມມາດຕະຖານເອກະສານອື່ນຂອງລະບົບ:
   `PO-<ລະຫັດສາຂາ>-<ປີວຽງຈັນ>-000042` / `TRF-<ລະຫັດສາຂາຕົ້ນທາງ>-<ປີ>-000007` (ບໍ່ແມ່ນ `PO-2026-VTE-00042` ຕາມ sketch ເດີມ —
   ເລືອກໃຫ້ກົງກັບ INV/CN/Z). ແຖວເກົ່າຮັກສາເລກ `PO-<hex>`/`TRF-<hex>` ເດີມ (ບໍ່ backfill); ຮູບແບບບໍ່ທັບກັນຈຶ່ງບໍ່ມີ
   unique collision. Test: 8 PO ພ້ອມກັນ → ເລກຕໍ່ເນື່ອງບໍ່ຊ້ຳ.
6. ✅ **M15 — export CSV ທຸກໜ້າ inventory — DONE 2026-09-25.** `GET …/export` ໃນ `/products`, `/stock-movements`, `/purchase-orders`,
   `/stock-transfers`, `/stock-lots`, `/stock-counts` (admin) — ຄືນທຸກແຖວທີ່ຜ່ານຕົວກັ່ນຕອງປັດຈຸບັນ (ບໍ່ແມ່ນແຕ່ໜ້າທີ່ເຫັນ) ຜ່ານ list
   function ເດີມ (`exportList`), ເພດານ `INVENTORY_EXPORT_MAX_ROWS` = 10,000 ແຖວ + ທຸງ `truncated`. Web-admin ປຸ່ມ "ສົ່ງອອກ CSV"
   (`InventoryExportButton`) ໃຊ້ `downloadCsv` ຂອງ reports ຄືນ (ມີ UTF-8 BOM ໃຫ້ Excel ອ່ານລາວໄດ້).
   ✅ **Excel/PDF (ສ່ວນທີ່ເຫຼືອ) — DONE 2026-09-26.** Excel: web-admin ບໍ່ມີ lib xlsx → ຂຽນ writer ບໍ່ມີ dependency
   (`features/reports/lib/xlsx.ts`: OOXML 5 ພາກ ໃນ ZIP ແບບ stored + CRC32, inline string UTF-8, ຕົວເລກເປັນ numeric cell, ແຖວຫົວໜາ+freeze;
   ກວດແລ້ວດ້ວຍ openpyxl) → `InventoryExportButton` ມີປຸ່ມ "Excel" ຄຽງ CSV ໃຊ້ແຖວຊຸດດຽວກັນ (ທຸກໜ້າ inventory + ຂາຍໜ້າຮ້ານ).
   PDF: ໃຊ້ browser print (ພິມ → Save as PDF), ບໍ່ເພີ່ມ lib — `printDocs.ts` (popup HTML + A4 print stylesheet ແບບດຽວກັບໃບນັບ):
   ໃບສັ່ງຊື້ (ແທນ print area ເກົ່າ), GRN (ປຸ່ມພິມຕໍ່ GRN ໃນ PO detail), ໃບຄືນສິນຄ້າ/ໃບລົດໜີ້ RTS — ເລກເອກະສານ, ສາຂາ, ຜູ້ສະໜອງ,
   ແຖວ, ຍອດ, ເສັ້ນລາຍເຊັນ. ໃບຮັບເງິນຂາຍໜ້າຮ້ານ = `ReceiptDialog` ຂອງ finance (ສະແດງແຖວສິນຄ້າແລ້ວ).
7. ✅ **ລາຍງານ: ມູນຄ່າສະຕັອກຍ້ອນຫຼັງ + shrinkage — DONE 2026-09-25.**
   - `GET /stock-movements/valuation?asOf=YYYY-MM-DD&branchId` — ຈຳນວນ/ມູນຄ່າຕໍ່ສິນຄ້າ ນະທ້າຍວັນວຽງຈັນ ຄິດຈາກ ledger ລ້ວນໆ
     (qty = Σ ຕາມທິດທາງ; value = Σ valueChange). ແຖວເກົ່າທີ່ບໍ່ມີ valueChange (ກ່ອນ C4 / ຍອດເປີດ) ຕີມູນຄ່າດ້ວຍ unitCost ທຳອິດທີ່ຮູ້ຂອງ
     ສິນຄ້ານັ້ນ ຫຼື WAC ປັດຈຸບັນ ແລະ ໝາຍ `fallbackUsed/fallbackRows/fallbackCost`.
   - `GET /stock-movements/shrinkage?from&to&branchId` — ມູນຄ່າສູນເສຍແຍກຕາມເຫດຜົນ ແລະ ສິນຄ້າ; ໃຊ້ `SHRINKAGE_MOVEMENT_WHERE`
     ຮ່ວມກັບແຖວ shrinkage ຂອງ P&L (`STOCK_SHRINKAGE_REASONS` ຊຸດດຽວ). BRANCH_ADMIN ຖືກບັງຄັບສາຂາຕົນທັງ 2 ລາຍງານ.
   - Web-admin: Reports ▸ ລາຍງານມາດຕະຖານ ▸ ກຸ່ມ "ກຳໄລ" ເພີ່ມ "ມູນຄ່າສະຕັອກ" (ເລືອກວັນທີ) + "ສະຕັອກສູນເສຍ" (ຊ່ວງວັນທີ) ດ້ວຍ
     `LedgerTable` + export CSV.
8. ✅ **M12-lite — COGS + shrinkage ເຂົ້າ P&L, ກຳໄລຕໍ່ບໍລິການ — DONE 2026-09-24.** ບໍ່ແມ່ນ GL double-entry:
   - `GET /expenses/profit-loss` (P&L ລາຍເດືອນເດີມ, scope BRANCH_ADMIN ແລະ ເດືອນວຽງຈັນຄືເກົ່າ) ຕອນນີ້ຄິດ `cogs` ຈາກ
     valued ledger = Σ −valueChange ຂອງ SERVICE_CONSUMED (`inventoryCostsBetween()` ໃນ inventory.service; ແຖວເກົ່າທີ່
     valueChange = null ໃຊ້ qty × costPrice ປັດຈຸບັນແທນ) — ກ່ອນໜ້ານີ້ໃຊ້ qty × costPrice ປັດຈຸບັນທັງໝົດ (ຜິດຫຼັງມີ WAC).
     ເພີ່ມແຖວ `shrinkage` = Σ −valueChange ຂອງ ADJUSTMENT_DEDUCT ທີ່ reason ຢູ່ໃນ `STOCK_SHRINKAGE_REASONS` (ທຸກເຫດຜົນ
     ຍົກເວັ້ນ SUPPLIER_RETURN/OPENING_BALANCE; ການປັບເພີ່ມ COUNT_VARIANCE ບໍ່ຫັກລ້າງ). `grossProfit = netRevenue − cogs`,
     `netProfit = grossProfit − shrinkage − ຄ່າແຮງ − ລາຍຈ່າຍດຳເນີນງານ` (Expense APPROVED/PAID ຄືເກົ່າ).
   - `GET /stock-movements/service-margin?branchId&from&to` (YYYY-MM-DD ວັນວຽງຈັນ, default 30 ວັນ; admin, BRANCH_ADMIN
     ຖືກບັງຄັບສາຂາຕົນ) — ລາຍຮັບນັດໝາຍ COMPLETED ຕໍ່ບໍລິການ − COGS ທີ່ join ດ້ວຍ `refId = appt:<id>`.
   - Web-admin: ໜ້າ Reports ▸ ລາຍງານມາດຕະຖານ ເພີ່ມກຸ່ມ "ກຳໄລ" 2 ລາຍງານ (P&L ເດືອນນີ້ + ກຳໄລຕໍ່ບໍລິການ) ໃຊ້
     `LedgerTable`/`ReportStatCard` + export CSV; card P&L ໃນໜ້າ Expenses ເພີ່ມແຖວ "ສະຕັອກສູນເສຍ".
9. ✅ **Lot backfill (ສະຕັອກເກົ່າທີ່ບໍ່ມີ lot, ຕໍ່ຈາກ C5) — DONE 2026-09-24.** `ProductView.unlottedQty` = stockQty − Σ lot;
   `POST /stock-lots/assign-unlotted {productId, lotNumber, expiryDate?, mfgDate?, qty}` lock ແຖວສິນຄ້າ ແລ້ວມອບສູງສຸດເທົ່າ
   ສ່ວນທີ່ບໍ່ມີ lot ເຂົ້າ lot ໃໝ່/ທີ່ມີ (ຜ່ານ `receiveIntoLot`, ຕົ້ນທຶນ = WAC ປັດຈຸບັນ). stockQty ບໍ່ປ່ຽນ → **ບໍ່ຂຽນ
   StockMovement** (ຈະເຮັດໃຫ້ reconcileStock ຜິດ) ແຕ່ບັນທຶກ `AuditLog` action `ASSIGN_UNLOTTED` ແທນ. ມອບເກີນ → 409.
   Web-admin: chip "ບໍ່ມີ lot: N" ໃນແຖວສິນຄ້າ → dialog ມອບເຂົ້າ lot.
   Test ຂອງຄື້ນນີ້ທັງໝົດຢູ່ `tests/integration/inventory-wave9b.test.ts` (6 test).
10. ✅ **L4/L5 — ລາຍລະອຽດສິນຄ້າ + ຕົວກັ່ນຕອງ ledger — DONE 2026-09-25.** ຄລິກແຖວສິນຄ້າ → `ProductDetailSheet` (ຄົງເຫຼືອ, WAC,
    ມູນຄ່າ, ບໍ່ມີ lot, ລາຍການ lot → recall, ການເໜັງຕີງຫຼ້າສຸດ, ລິ້ງ "ເປີດບັນຊີເໜັງຕີງທັງໝົດ"). ຍັງບໍ່ມີ "ຈອງ" ເພາະ H7 ຍັງບໍ່ໄດ້ເຮັດ.
    Stock Ledger ເພີ່ມຕົວເລືອກສິນຄ້າແບບຄົ້ນຫາໄດ້ (Combobox, ຮັບ `?productId=`) ຄຽງກັບຕົວກັ່ນຕອງວັນທີ from/to (DateField) ທີ່ມີຢູ່.
    Test ຂອງ H3/M15/ລາຍງານ ຢູ່ `tests/integration/inventory-stock-count.test.ts` (6 test).
> **ຜົນ:** ຜ່ານການກວດສອບບັນຊີ ແລະ IAS 2 ໃນລະດັບພື້ນຖານ

### 🟡 ຄື້ນ 9C — ການສືບຍ້ອນ & ຄວາມປອດໄພຜະລິດຕະພັນ (2–3 ອາທິດ)
1. ✅ **C5 — Lot / ວັນໝົດອາຍຸ / FEFO / recall — DONE 2026-09-24.** Migration
   `20260924140000_inventory_lot_tracking` (additive: `stock_lots`, `Product.trackLot`,
   `StockMovement.lotId`, lot fields ໃນ `PurchaseOrderItem` + `StockTransferItem`; apply ແລ້ວທັງ dev ແລະ test DB).
   - **trackLot ເປັນ opt-in ຕໍ່ສິນຄ້າ** (toggle ໃນຟອມສິນຄ້າ; ປິດບໍ່ໄດ້ຖ້າ lot ຍັງມີຂອງ). ຮັບເຄື່ອງສິນຄ້າ trackLot
     ໂດຍບໍ່ມີເລກ lot → 400. lot ເລກດຽວກັນມາຊ້ຳ = ບວກຈຳນວນ + ສະເລ່ຍຕົ້ນທຶນຖ່ວງນ້ຳໜັກ; ວັນໝົດອາຍຸຂັດກັນ → 409.
   - **FEFO** (`deductStock` ໃນ `inventory.service.ts`): `consumeServiceStock` ແລະ `ADJUSTMENT_DEDUCT` ຍ່າງ lot
     `expiryDate ASC NULLS LAST, receivedAt ASC`, ໜຶ່ງແຖວ ledger ຕໍ່ lot (`lotId`, `unitCost` = ຕົ້ນທຶນຂອງ lot).
     ສ່ວນທີ່ lot ບໍ່ຄອບຄຸມ (ສະຕັອກເກົ່າກ່ອນເປີດ trackLot / ຕິດລົບທີ່ສາຂາອະນຸຍາດ) ຕັດເປັນແຖວ `lotId = null` ຕາມ WAC;
     ການກວດ negative-stock ຍັງເປັນລະດັບສິນຄ້າ (C2 ບໍ່ປ່ຽນ). idempotency ຍັງກວດຕາມ (productId, refId).
   - **Recall**: `GET /stock-lots/:id/usage` (`getLotUsage`) → ນັດໝາຍ + ລູກຄ້າ (ຊື່/ເບີ) ທີ່ໃຊ້ lot ນັ້ນ + ການໂອນອອກ
     ໄປສາຂາອື່ນ. `GET /stock-lots?productId&branchId&expiringWithinDays&includeEmpty` (admin ເທົ່ານັ້ນ, BRANCH_ADMIN ຖືກ scope).
   - **Job** `lot-expiry.job.ts` ທຸກມື້ 08:30 (Asia/Vientiane) → `NotificationLog` (type `stock_lot_expiry`) ຫາ
     SUPER_ADMIN + BRANCH_ADMIN ຂອງສາຂາ; ແຈ້ງເມື່ອຂ້າມຂັ້ນ 60/30/7 ວັນ/ໝົດອາຍຸ ເທື່ອລະຄັ້ງ (dedupeKey ມີຂັ້ນ).
   - **Web-admin**: toggle trackLot, lot ຂອງຍອດເປີດ/ປັບເພີ່ມ, ຟອມ lot ຕອນ receive PO, ເລືອກ lot ຕອນໂອນ,
     ກາດ "ໃກ້ໝົດອາຍຸ" (pattern ຂອງ giftcards `ExpiryWatchCard`) + dialog recall, ຖັນ Lot ໃນ Stock Ledger.
   - **ຂໍ້ແຕກຕ່າງຈາກ sketch ເດີມ**: (1) ເລກ lot ບັງຄັບຕອນ *receive* ບໍ່ແມ່ນຕອນສ້າງ PO (PO item ມີ lot fields
     ແບບ optional ເປັນ prefill; body ຂອງ `/receive` ທັບໄດ້) ເພາະເລກ lot ມັກຮູ້ຕອນເຄື່ອງມາຮອດ. (2) ການໂອນຂ້າມສາຂາ:
     ຜູ້ໃຊ້ເລືອກ lot ຕົ້ນທາງເອງ (ບໍ່ FEFO) — ລາຍການໂອນ = 1 ສິນຄ້າ = 1 lot; ປາຍທາງເປີດ trackLot ອັດຕະໂນມັດ.
     (3) `ADJUSTMENT_ADD` ໃນສິນຄ້າ trackLot ຕ້ອງລະບຸ lot; `ADJUSTMENT_DEDUCT` ໃຊ້ FEFO (ບໍ່ມີ pick lot ດ້ວຍມື).
     (4) ບໍ່ backfill lot ໃຫ້ສະຕັອກເກົ່າ; Σ `qtyOnHand` ຂອງ lot ອາດ < `stockQty` ໄດ້ (ສ່ວນຕ່າງ = ສະຕັອກບໍ່ມີ lot).
     (5) ການຄິດມູນຄ່າ (`stockValue`) ຍັງໃຊ້ WAC ຂອງສິນຄ້າ; COGS ຂອງແຖວ lot ໃຊ້ຕົ້ນທຶນຈິງຂອງ lot.
> ພາກ 2 (M1, M2, M3 + ABC, dashboard low-stock) ✅ DONE 2026-09-25 — Migration `20260925210000_inventory_uom_barcode_category`
> (additive: `uoms`, `product_uom_conversions`, `product_categories`, `Product.baseUomId/gtin/barcode/categoryId/abcClass/abcComputedAt`
> + @@unique(branchId,gtin)/(branchId,barcode), `uomId`+`factorToBase` ໃນ `purchase_order_items`/`goods_receipt_lines`/`service_consumables`/
> `supplier_products`; data-only backfill `baseUomId` ຈາກຂໍ້ຄວາມ `unit`; ຂໍ້ຍົກເວັ້ນດຽວ: ຂະຫຍາຍ `purchase_order_items.unitCost` 16,2 → 18,6
> (ບໍ່ສູນເສຍຂໍ້ມູນ) ເພື່ອບໍ່ໃຫ້ ລາຄາ/ກ່ອງ ÷ 12 ປັດເສດຜິດ; apply ແລ້ວທັງ dev ແລະ test DB). Test ທັງໝົດຢູ່
> `tests/integration/inventory-wave9c-master.test.ts` (12 test).
2. ✅ **M1 — UoM + ການແປງໜ່ວຍ — DONE 2026-09-25.** `Uom` (code/name/nameLo/isActive, ໃຊ້ຮ່ວມທົ່ວອົງກອນ; seed 10 ໜ່ວຍ
   piece/bottle/box/ml/g/set/pack/sachet/tube/jar ທັງໃນ migration ແລະ `seed.ts`) + `ProductUomConversion` (1 ໜ່ວຍ = factorToBase × ໜ່ວຍພື້ນຖານ,
   isPurchaseDefault/isConsumeDefault ອັນດຽວຕໍ່ສິນຄ້າ). **ທຸກຈຳນວນທີ່ເກັບ (stockQty, ledger, lot, ການຈອງ, PO quantity/qtyReceived, GRN) ເປັນໜ່ວຍພື້ນຖານ**
   — ແປງສະເພາະຕອນ input (`inventory-master.service.ts`: `resolveUomFactors`, `bomBaseQty`, `syncProductConversions`):
   - PO (`itemsToBase` ໃນ `inventory.service.ts`): quantity × factor, unitCost ÷ factor (FX ຍັງໃຊ້ຄືເກົ່າ), ເກັບ uomId + factor snapshot;
     view ມີ `uomQty/uomUnitCost`. ລາຄາຈາກລາຍການລາຄາ = unitCost ÷ factor ຂອງລາຍການລາຄາ.
   - GRN (`postGoodsReceipt`): `uomId` ບໍ່ໃສ່ = ໜ່ວຍທີ່ສັ່ງ (factor snapshot ຂອງ PO), null = ພື້ນຖານ, ອື່ນ = ອັດຕາຂອງສິນຄ້າ → tolerance, WAC,
     lot ແລະ ledger ຄິດເປັນໜ່ວຍພື້ນຖານ. `/receive` ເກົ່າສົ່ງຈຳນວນຄ້າງເປັນພື້ນຖານ (uomId null).
   - BOM (`ServiceConsumable.uomId/factorToBase`, `syncConsumables` ໃນ services-admin): qtyPerUse ເກັບເປັນໜ່ວຍ BOM (ເຊັ່ນ 30 ml);
     `consumeServiceStock` ແລະ `syncAppointmentReservations` ໃຊ້ `bomBaseQty` = qtyPerUse × factor (ແຖວເກົ່າ factor 1).
   - ລາຍການລາຄາ `SupplierProduct.uomId/factorToBase`: unitCost + MOQ ເປັນຕໍ່ໜ່ວຍຊື້; ຄຳແນະນຳ PO ປັດຂຶ້ນໃນໜ່ວຍຊື້ × MOQ
     (`suggestedUomQty`, ບໍ່ມີລາຍການລາຄາ → ໜ່ວຍຊື້ເລີ່ມຕົ້ນຂອງສິນຄ້າ).
   - ແກ້ອັດຕາແປງ → ອັບເດດ snapshot ຂອງຂໍ້ມູນຫຼັກ (BOM + ລາຍການລາຄາ) ຕາມ; PO/GRN ເກົ່າຮັກສາ snapshot. ລຶບອັດຕາທີ່ຍັງຖືກໃຊ້ໃນ BOM/ລາຍການລາຄາ/PO ທີ່ເປີດ → 409.
     ປ່ຽນໜ່ວຍພື້ນຖານໄດ້ສະເພາະສິນຄ້າທີ່ຍັງບໍ່ມີການເຄື່ອນໄຫວ (409). client ເກົ່າທີ່ສົ່ງແຕ່ `unit` → ຫາ/ສ້າງ Uom ຈາກຂໍ້ຄວາມ; ການໂອນສ້າງສິນຄ້າປາຍທາງພ້ອມໜ່ວຍ + ອັດຕາຂອງຕົ້ນທາງ.
   - Web-admin: dialog "ໜ່ວຍນັບ", ຟອມສິນຄ້າມີໜ່ວຍພື້ນຖານ + ຕາຕະລາງອັດຕາແປງ, ແຖວ PO/ຮັບເຄື່ອງ/ລາຍການລາຄາ/BOM ບໍລິການ ເລືອກໜ່ວຍ ພ້ອມ "= N ໜ່ວຍພື້ນຖານ".
3. ✅ **M2 — barcode/GTIN — DONE 2026-09-25.** `Product.gtin` (zod `gtinSchema`: GS1 check digit, 8/12/13/14 ຕົວ) + `barcode` (ອິດສະຫຼະ);
   unique ຕໍ່ສາຂາ (@@unique + 409 ອ່ານງ່າຍ), soft-delete ຕໍ່ທ້າຍ `:deleted:<ts>` ຄື sku → ໃຊ້ລະຫັດຄືນໄດ້. `GET /products/lookup?code&branchId`
   (`lookupProduct`): GTIN (ລວມຮູບແບບເຕີມ 0 ນຳໜ້າ ເຊັ່ນ EAN-13 ↔ GTIN-14) → barcode → SKU (ບໍ່ສົນຕົວພິມ), BRANCH_ADMIN/STAFF ຖືກ scope, ບໍ່ພົບ = 404;
   ຄົ້ນລາຍການສິນຄ້າ `q` ກົງກັບ gtin/barcode ນຳ. Web-admin `ScanInput` (ເຄື່ອງສະແກນ USB = ແປ້ນພິມ + Enter): ໜ້າສິນຄ້າ (ເປີດ detail),
   dialog ຮັບເຄື່ອງ ແລະ ໃບນັບສະຕັອກ (ໄປທີ່ແຖວ + focus ຈຳນວນ), ສ້າງໃບຄືນຜູ້ສະໜອງ (ໃສ່ແຖວ + focus ຈຳນວນ).
   **ຍັງບໍ່ເຮັດ**: ສະແກນຜ່ານກ້ອງ ແລະ ພິມປ້າຍ barcode (web-admin ບໍ່ມີ lib barcode — ບໍ່ເພີ່ມ dependency ໜັກ); ການນັບຜ່ານມືຖືຢູ່ M14.
4. ✅ **M3 — ໝວດສິນຄ້າ + ABC — DONE 2026-09-25.** `ProductCategory` (ຊ້ອນ 1 ຊັ້ນ, sortOrder, isActive, branchId null = ໃຊ້ຮ່ວມ/SUPER_ADMIN ເທົ່ານັ້ນ)
   + `/product-categories` CRUD (ລຶບໄດ້ສະເພາະໝວດທີ່ບໍ່ມີສິນຄ້າ/ໝວດຍ່ອຍ). ຕົວກັ່ນ `categoryId` (ໝວດຫຼັກ = ລວມໝວດຍ່ອຍ) ໃນລາຍການສິນຄ້າ, `/products/stats`
   ແລະ `/products/export`; `groupBy=category` ໃນ valuation / turnover / aging (`groups` + ແຖວມີ categoryName).
   **ABC**: `GET /stock-movements/abc?from&to&branchId&basis=consumptionValue|stockValue` (`classifyAbc` ໃນ `inventory-reports.service.ts`) —
   ລຽງມູນຄ່າຈາກຫຼາຍຫານ້ອຍ; ແຖວທີ່ສ່ວນແບ່ງສະສົມ *ກ່ອນ* ມັນ < A% = A (ສິນຄ້າທີ່ຂ້າມເສັ້ນນັບເປັນກຸ່ມເທິງ), < B% = B, ນອກນັ້ນ C; ມູນຄ່າ 0 = C.
   consumptionValue = COGS ຂອງ SERVICE_CONSUMED ໃນຊ່ວງ (movementCost ຄື P&L); stockValue = max(stockQty,0) × WAC ປັດຈຸບັນ.
   ເກນ AppSetting `inventory.abcA` (80) / `inventory.abcB` (95) ແກ້ໃນ `InventorySettingsDialog` (A ≤ B ກວດທັງ zod ແລະ service).
   Job `reorder-point` ທຸກຄືນເກັບ `Product.abcClass` ຕໍ່ສາຂາ (ມູນຄ່າການໃຊ້ 90 ວັນ) → StatusPill ໃນແຖວສິນຄ້າ. Reports ▸ ມາດຕະຖານ ▸ "ການວິເຄາະ ABC" (+ CSV)
   ແລະ ຕົວເລືອກ "ຈັດກຸ່ມຕາມ ສິນຄ້າ/ໝວດ" ໃນ 3 ລາຍງານ.
   ✅ **ຕິດຕາມ**: widget ສະຕັອກຕ່ຳຂອງ dashboard (`dashboard.service.ts`) ໃຊ້ເກນ max(minStockQty, reorderPoint) ຄືລາຍການສິນຄ້າ (+ `threshold` ໃນ lowStockItems).
5. M14 — ໜ້າສະຕັອກໃນແອັບມືຖື (ນັບ, ເບີກ, ສະແກນ)
   ✅ **DONE 2026-09-26 (mobile ເທົ່ານັ້ນ, ບໍ່ແກ້ backend)** — `apps/mobile/src/screens/staff/stock/*` + `features/inventory/inventory.{api,logic}.ts`.
   8 ໜ້າໃນ Staff Portal: ໜ້າຫຼັກສະຕັອກ (ສະຖິຕິສາຂາ + ຄົ້ນຫາ + ປຸ່ມສະແກນ), ສະແກນ (`expo-camera` ean13/ean8/upc_a/upc_e/code128/qr →
   `/products/lookup`, ພິມລະຫັດເອງໄດ້), ລາຍລະອຽດສິນຄ້າ (ມີ/ຈອງ/ພ້ອມໃຊ້/ກຳລັງສັ່ງ, lot ສີຕາມວັນເຫຼືອ, ການເໜັງຕີງ; WAC ສະເພາະ manage),
   ລາຍການ/ໃບນັບ (ບັນທຶກອັດຕະໂນມັດ debounce + ຮ່າງໃນ AsyncStorage, ສະແກນໂດດໄປແຖວ, blind count ສຳລັບພະນັກງານ, admin ເລີ່ມ/ອະນຸມັດ/ສົ່ງຄືນ),
   ຮັບເຄື່ອງຈາກ PO (ຮັບ/ປະຕິເສດ, ໜ່ວຍຈາກ conversions, lot + ວັນໝົດອາຍຸ), ປັບສະຕັອກ (reason code, notes ບັງຄັບ, ຈັດການ 202 PENDING_APPROVAL).
   ເຂົ້າຈາກປຸ່ມກ່ອງໃນຫົວໜ້າ Today + ທາງລັດໃນ Profile — ສະແດງສະເພາະ user ທີ່ມີ `inventory:view`/`inventory:manage` (ຄືກັບ `payments:review` ຂອງກ່ອງສະລິບ).
   ✅ **Guard backend ແກ້ແລ້ວ 2026-09-26** (`inventory.routes.ts` — `staffOrAdmin()`): ທຸກ router ສາງບລັອກ CUSTOMER (ເຄີຍເຫັນ
   `costPrice`/`stockValue` ຜ່ານ `GET /products`, `/stock-movements`, …); STAFF ຜ່ານໄດ້ສະເພາະເມື່ອຖືກມອບສິດ — `inventory:view` = ອ່ານ +
   ນັບ (GET/PATCH lines/submit) + `GET /stock-lots`; `inventory:manage` = ສ້າງ/ເລີ່ມ/ຍົກເລີກໃບນັບ, `POST /stock-movements/adjust`
   (maker-checker ຄືເກົ່າ), `POST /purchase-orders/:id/receipts`. ອະນຸມັດ/ສົ່ງຄືນໃບນັບ, export, `/stock-lots/:id/usage` ຍັງ admin ເທົ່ານັ້ນ.
   admin ບໍ່ປ່ຽນພຶດຕິກຳ. Test: `tests/integration/inventory-access.test.ts` (3). ບັນທຶກເດີມ (ກ່ອນແກ້):
   ⚠️ **ຍັງຕ້ອງແກ້ guard ຢູ່ backend** — ແອັບມືຖືຮັບສະເພາະ CUSTOMER/STAFF ຈຶ່ງບໍ່ມີ admin ໃຊ້ມືຖື; route ຂ້າງລຸ່ມເປັນ `manage`
   (`roleGuard('SUPER_ADMIN','BRANCH_ADMIN')`) → STAFF ໄດ້ 403 (UI ສະແດງ "ຍັງບໍ່ມີສິດ"). ແນະນຳ (ຮູບແບບດຽວກັບ `/payments-treasury/slips`):
   - `/stock-counts` GET `/`, GET `/:id`, PATCH `/:id/lines`, POST `/:id/submit` → `roleGuard(SA,BA,'STAFF') + permissionGuard('inventory:view')`
     (ພະນັກງານນັບ); POST `/`, `/:id/start|approve|reject|cancel` → `permissionGuard('inventory:manage')` (+ STAFF ໃນ roleGuard ຖ້າຈະໃຫ້ຫົວໜ້າສາງ).
   - `GET /stock-lots` → `roleGuard(SA,BA,'STAFF') + permissionGuard('inventory:view')` (`/:id/usage` ມີຂໍ້ມູນລູກຄ້າ — ຄົງ `manage`).
   - `POST /purchase-orders/:id/receipts` ແລະ `POST /stock-movements/adjust` → `roleGuard(SA,BA,'STAFF') + permissionGuard('inventory:manage')`.
   - ຂໍ້ສັງເກດ: `GET /products/:id` ແລະ `GET /products` ບໍ່ມີ guard ແລະ ສົ່ງ `costPrice`/`stockValue` ໃຫ້ທຸກ user (ລວມ CUSTOMER) — ຄວນຕັດ WAC
     ສຳລັບຜູ້ບໍ່ມີ `inventory:manage`; service ຂອງ count/receipt ໃຊ້ `req.auth.branchId` ຢູ່ແລ້ວ (STAFF ມີ branchId) ແຕ່ຕ້ອງທົດສອບຫຼັງເປີດສິດ.
6. ລາຍງານການສືບຍ້ອນ: lot ນີ້ຖືກໃຊ້ກັບລູກຄ້າຄົນໃດແດ່ (recall)
> **ຜົນ:** ຜ່ານ GMP / ASEAN Cosmetic Directive, ເອີ້ນຄືນສິນຄ້າໄດ້

### 🟢 ຄື້ນ 9D — ຈັດຊື້ & ຫ່ວງໂສ້ອຸປະທານ (3–4 ອາທິດ)
> ພາກ 1 (H4 + 3-way match, H5, M6, M7, M18) ✅ DONE 2026-09-25 — Migration `20260925120000_inventory_procurement_grn_returns`
> (additive: `POStatus` + `PENDING_APPROVAL`/`PARTIALLY_RECEIVED`, enum `SupplierReturnStatus`, `PurchaseOrderItem.qtyReceived/qtyRejected`,
> ຖັນອະນຸມັດ/ປິດຮັບບໍ່ຄົບໃນ `purchase_orders`, ຕາຕະລາງ `goods_receipts`/`goods_receipt_lines`/`supplier_returns`/`supplier_return_lines`;
> apply ແລ້ວທັງ dev ແລະ test DB). Test ທັງໝົດຢູ່ `tests/integration/inventory-procurement.test.ts` (10 test).
1. ✅ **H4 — GRN, ຮັບບາງສ່ວນ, ຮັບເກີນ tolerance, ປິດຮັບບໍ່ຄົບ — DONE 2026-09-25.**
   - `POST /purchase-orders/:id/receipts {supplierDeliveryNote?, notes?, lines:[{poItemId, qtyReceived, qtyRejected, rejectReason, unitCost?, lot…}]}`
     → ໃບຮັບເຄື່ອງ `GRN-<ສາຂາ>-<ປີ>-000001` (`nextDocumentNo` DocType `GRN`). `qtyReceived` = ຈຳນວນທີ່ເຂົ້າສະຕັອກ (accepted);
     `qtyRejected` ບັນທຶກແຕ່ໃນ GRN (ບໍ່ເຂົ້າສະຕັອກ, ບໍ່ນັບເປັນການຮັບ). ຕໍ່ແຖວ: lot ຂອງ GRN ນັ້ນເອງ (C5) + WAC ຕາມຕົ້ນທຶນ GRN (C4) +
     PURCHASE_IN refId `grn:<id>`. ສະຖານະ PO: ຮັບຄົບທຸກແຖວ = RECEIVED, ບໍ່ຄົບ = PARTIALLY_RECEIVED.
   - Tolerance: AppSetting `inventory.overReceiptTolerancePct` (default 0) — Σ ຮັບ > ສັ່ງ × (1 + tol) → 409.
   - `POST /purchase-orders/:id/receive` ເດີມ = "ຮັບທຸກຈຳນວນທີ່ຄ້າງ" ຜ່ານເສັ້ນທາງ GRN ດຽວກັນ (body `{lots}` ຄືເກົ່າ). DRAFT ຍັງຮັບກົງໄດ້
     ຖ້າຍອດບໍ່ຕ້ອງອະນຸມັດ; PENDING_APPROVAL ຮັບບໍ່ໄດ້ (409).
   - **ປິດຮັບບໍ່ຄົບ** = `POST /purchase-orders/:id/close-short {reason}` → status RECEIVED + `closedShortAt/closedShortReason/closedByUserId`
     (ເລືອກເປັນ flag ບໍ່ແມ່ນ status ໃໝ່ ເພື່ອໃຫ້ RECEIVED = "ປິດການຮັບແລ້ວ" ຄືເກົ່າທົ່ວລະບົບ); `qtyOutstanding` = 0 ⇒ ບໍ່ນັບເປັນ on-order.
     PO ທີ່ຍັງບໍ່ມີການຮັບ → ໃຫ້ຍົກເລີກແທນ (409). ຍົກເລີກ PO ທີ່ມີການຮັບແລ້ວບໍ່ໄດ້.
   - `openPurchaseOrders` (Inventory stats) ນັບ DRAFT/PENDING_APPROVAL/ORDERED/PARTIALLY_RECEIVED; dashboard ນັບ ORDERED + PARTIALLY_RECEIVED.
2. ✅ **H4 — 3-way match (PO ↔ GRN ↔ ໃບເກັບເງິນ) — DONE 2026-09-25.** ບໍ່ສ້າງ model `SupplierInvoice`: Expense ທີ່ຜູກ `purchaseOrderId`
   (SUBMITTED/APPROVED/PAID, ຍອດ `amountBase` LAK) = ໃບເກັບເງິນຜູ້ສະໜອງ. `GET /purchase-orders/:id/match` (`procurement.service.ts`) ຄືນ
   ordered / received (Σ accepted × ຕົ້ນທຶນ GRN) / returned (debit notes) / invoiced (+ພາສີ `taxAmount × fxRate`) / expected / variance + ແຖວ.
   ສະຖານະ: NO_INVOICE; MATCHED ເມື່ອ (ໃບເກັບເງິນ − debit note) ≤ (ຮັບ − ຄືນ + ພາສີ) × (1 + tol) — ເກັບເປັນງວດ (ໜ້ອຍກວ່າ) ບໍ່ຖືວ່າຜິດ;
   ເກີນ ແຕ່ PO ຍັງຮັບບໍ່ຄົບ ແລະ ບໍ່ເກີນມູນຄ່າສັ່ງ = UNDER_RECEIVED; ນອກນັ້ນ = OVER_INVOICED. tol = AppSetting `inventory.invoiceMatchTolerancePct`
   (default 1%). **ບລັອກການອະນຸມັດ** ໃນ `approveExpense()` (expenses.service): ລາຍຈ່າຍທີ່ຜູກ PO ແລະ match = OVER_INVOICED/UNDER_RECEIVED → 409
   (`details.poMatch`); SUPER_ADMIN ສົ່ງ `{overrideMatch:true, overrideReason}` ໄດ້ → ບັນທຶກ AuditLog `APPROVE_MATCH_OVERRIDE`; ຄົນອື່ນ → 403.
   bulk approve ໃຊ້ຟັງຊັນດຽວກັນ (ລາຍການທີ່ບໍ່ຜ່ານຢູ່ໃນ `failed`). `ExpenseView.poMatch` ສະແດງໃນໜ້າ Expenses.
3. ✅ **H5 — ຄືນສິນຄ້າຜູ້ສະໜອງ + debit note — DONE 2026-09-25.** `/supplier-returns` (admin, BRANCH_ADMIN ຖືກ scope): ໃບ `RTS-<ສາຂາ>-<ປີ>-000001`
   DRAFT → POSTED | CANCELLED (ຍົກເລີກໄດ້ສະເພາະຮ່າງ). Post ໃນ tx ດຽວ + lock ສິນຄ້າ (ລຽງ id): ແຖວທີ່ລະບຸ lot ຕັດ lot ນັ້ນ (ບໍ່ພໍ = 409),
   ສິນຄ້າ trackLot ທີ່ບໍ່ລະບຸ lot → FEFO (`deductStock`); movement **RETURN_TO_SUPPLIER** (enum ມີຜູ້ຂຽນແລ້ວ) reason `SUPPLIER_RETURN`
   refId `rts:<id>`. ມູນຄ່າ: ຕົ້ນທຶນ lot → ຕົ້ນທຶນ GRN ທີ່ຜູກ (GRN/PO, ສະເລ່ຍຖ່ວງນ້ຳໜັກ) → WAC; WAC ບໍ່ປ່ຽນ; ກວດ `allowNegativeStock`;
   ຄືນເກີນຈຳນວນທີ່ຮັບຈາກ GRN/PO ທີ່ອ້າງອີງ (ລົບທີ່ຄືນແລ້ວ) → 409.
   **Debit note**: Expense ບໍ່ມີແນວຄິດເຄຣດິດ (amount ຕ້ອງບວກ, VOID = ຍົກເລີກທັງໃບ) ຈຶ່ງໃຊ້ໃບຄືນທີ່ POSTED ເອງເປັນ debit note
   (`totalValue`) — ຫັກໃນ 3-way match ຂອງ PO ທີ່ຜູກ ແລະ `GET /suppliers/:id/balance` (ໃບເກັບເງິນ − ຈ່າຍແລ້ວ − debit notes).
   ບໍ່ນັບເປັນ shrinkage: `SHRINKAGE_MOVEMENT_WHERE` ກັ່ນສະເພາະ `ADJUSTMENT_DEDUCT` (ມີ test). ການນັບສະຕັອກ (H3 delta) ແລະ `reconcileStock()`
   ຮັບຮູ້ RETURN_TO_SUPPLIER ຜ່ານ `MOVEMENT_SIGN` (−1) ຢູ່ແລ້ວ.
4. ✅ **H6 — ໂອນລະຫວ່າງສາຂາ + in-transit — DONE 2026-09-15** (StockTransfer DRAFT → IN_TRANSIT → COMPLETED, TRANSFER_OUT/IN; ດູ inventory-transfer.test.ts)
5. ✅ **H7 — ການຈອງ consumable ຈາກນັດໝາຍ (on hand / reserved / available / on order) — DONE 2026-09-25.** ຕາຕະລາງ `stock_reservations`
   (ໜຶ່ງແຖວຕໍ່ ນັດ+ສິນຄ້າ → idempotent; ACTIVE / RELEASED / CONSUMED). `syncAppointmentReservations(tx, id)` (`reservation.service.ts`)
   ອ່ານສະຖານະ+ບໍລິການປັດຈຸບັນ: CONFIRMED/IN_PROGRESS = ຈອງ BOM (ຊຸດດຽວກັບທີ່ `consumeServiceStock` ຕັດ, qty = qtyPerUse);
   PENDING/CANCELLED/NO_SHOW = ປົດ; ບໍລິການປ່ຽນ = ປົດແຖວເກົ່າ + ຈອງແຖວໃໝ່; COMPLETED = CONSUMED (`consumeServiceStock` ເອີ້ນ
   `markReservationsConsumed` ໃນ tx ດຽວກັນ). ຈຸດທີ່ hook (ໃນ tx ຂອງນັດ): `appointments.updateAppointmentStatus` (+ bulk-status),
   `staff-portal.updateAppointmentStatus`, `booking.cancelAppointment`, `booking.rescheduleAppointment` (→ PENDING), ຢືນຢັນຫຼັງຈ່າຍມັດຈຳ
   (`payments.service`), `queue` check-in (PENDING→CONFIRMED) ແລະ walk-in (ສ້າງເປັນ CONFIRMED). ບໍ່ມີ job auto no-show ໃນລະບົບ.
   **Soft**: ບໍ່ແຕະ stockQty/ledger (`reconcileStock()` ບໍ່ກ່ຽວ), ບໍ່ບລັອກການຈອງ/ການປິດນັດ (ການກວດຈິງຍັງຢູ່ `consumeServiceStock`).
   `ProductView` ເພີ່ມ `reservedQty/availableQty/onOrderQty/shortForUpcoming`; onOrder = Σ(quantity − qtyReceived) ຂອງ PO
   PENDING_APPROVAL/ORDERED/PARTIALLY_RECEIVED (DRAFT ບໍ່ນັບ, ປິດຮັບບໍ່ຄົບ = RECEIVED ບໍ່ນັບ). Stats ເພີ່ມ `shortForUpcomingCount`.
   Backfill: job `reorder-point` ທຸກຄືນ + `scripts/backfill-stock-reservations.ts` (`backfillReservations()` idempotent, ສ້ອມແຖວຄ້າງນຳ).
   Web-admin: ແຖວສິນຄ້າສະແດງ "ຈອງ · ໃຊ້ໄດ້ · ກຳລັງສັ່ງ" + pill "ບໍ່ພໍສຳລັບນັດ", ProductDetailSheet ມີ tile ຈອງ/ໃຊ້ໄດ້/ກຳລັງສັ່ງ/ຈຸດສັ່ງຊື້ + ຄຳເຕືອນ.
   ຂໍ້ສັງເກດ: BOM ບໍ່ຜູກສາຂາ (ຄືກັບ consumeServiceStock) ຈຶ່ງຈອງສິນຄ້າໃນ BOM ຕາມສາຂາຂອງສິນຄ້າ; ລະບົບຍັງບໍ່ມີ flow ຍ້າຍນັດຂ້າມສາຂາ/ປ່ຽນບໍລິການ
   ແຕ່ sync ຮອງຮັບແລ້ວ (ມີ test).
6. ✅ **M6 — PO approval workflow + ວົງເງິນ — DONE 2026-09-25.** AppSetting `inventory.poApprovalThresholdLak` (default 5,000,000 ກີບ).
   ຜູ້ທີ່ບໍ່ແມ່ນ SUPER_ADMIN ສັ່ງ (ສ້າງດ້ວຍ `status:'ORDERED'` ຫຼື PATCH DRAFT → ORDERED) ຍອດເກີນເກນ → PENDING_APPROVAL + ແຈ້ງ SUPER_ADMIN
   (`PO_APPROVAL_PENDING`). `POST /purchase-orders/:id/approve` (SUPER_ADMIN) → ORDERED (`approvedByUserId/approvedAt`), `/reject {reason}`
   → DRAFT + `rejectedReason`; ແຈ້ງຜູ້ສັ່ງ (`PO_APPROVED`/`PO_REJECTED`). ຜູ້ສັ່ງດຶງກັບເປັນ DRAFT ໄດ້. ການແກ້ PO ທີ່ສັ່ງແລ້ວໃຫ້ຍອດເພີ່ມເກີນເກນ ຕ້ອງເປັນ SUPER_ADMIN (403).
7. ✅ **M7 — ແກ້ PO ແບບ upsert — DONE 2026-09-25.** `updatePurchaseOrder` upsert ຕາມ productId (ຮັກສາ id ຂອງແຖວ, ລຶບສະເພາະແຖວທີ່ເອົາອອກ);
   ແກ້ລາຍການໄດ້ໃນ DRAFT/ORDERED/PARTIALLY_RECEIVED; ແຖວທີ່ມີການຮັບ/ປະຕິເສດແລ້ວລຶບບໍ່ໄດ້ ແລະ ຫຼຸດຕ່ຳກວ່າ qtyReceived ບໍ່ໄດ້ (409).
   ✅ **Revision history — DONE 2026-09-26.** Migration `20260926160000_inventory_retail_po_revisions` ຕາຕະລາງ `purchase_order_revisions`
   (poId, revisionNo unique ຕໍ່ PO, action, from/toStatus, changedByUserId, changedAt, `snapshot` JSON = header+ແຖວ **ກ່ອນ** ປ່ຽນ,
   `diff` JSON = [{field, productName, from, to}], summary, note). ຂຽນໃນ tx ດຽວກັບການປ່ຽນ (ແຖວ PO ຖືກ lock → ເລກບໍ່ຊ້ຳ) ຈາກ
   `updatePurchaseOrder` (UPDATE/ORDER/SUBMIT_APPROVAL/CANCEL/REVERT_DRAFT), approve/reject (+ເຫດຜົນ), close-short (+ເຫດຜົນ) ແລະ
   ການຮັບເຄື່ອງ GRN (RECEIVE + ເລກ GRN). ບໍ່ມີຫຍັງປ່ຽນ ແລະ ບໍ່ມີ note = ບໍ່ຂຽນ. `PurchaseOrderView.revisions` (detail, ໃໝ່ສຸດກ່ອນ) →
   ພາກ "ປະຫວັດ" ໃນ PO detail (`PoHistory.tsx`) ສະແດງ diff ອ່ານງ່າຍ. Test ຢູ່ `inventory-retail.test.ts`.
8. ✅ **M18 — N+1 ຕອນຮັບເຄື່ອງ — DONE 2026-09-25.** lock ສິນຄ້າທັງໝົດຂອງ GRN ໃນ `SELECT … WHERE id IN (…) ORDER BY id FOR UPDATE` ດຽວ
   (`lockProductRows`, ລຳດັບ id ຄືກັນທຸກ tx → ບໍ່ deadlock) ແລ້ວໂຫຼດສິນຄ້າເທື່ອດຽວ; ຍັງມີ write ຕໍ່ແຖວ (lot/movement/item).
   - **Web-admin**: PO detail ມີຄວາມຄືບໜ້າ ຮັບ/ສັ່ງ ຕໍ່ແຖວ, ປຸ່ມ "ຮັບເຄື່ອງ" → dialog GRN (ຈຳນວນຮັບ/ປະຕິເສດ/ເຫດຜົນ/ຕົ້ນທຶນ + `LotFields`),
     ລາຍການ GRN, "ປິດຮັບບໍ່ຄົບ", ສັ່ງຊື້/ຍົກເລີກ/ດຶງກັບ, panel 3-way match; card "ໃບສັ່ງຊື້ລໍຖ້າອະນຸມັດ" (`PoApprovalsCard`); tab ໃໝ່
     "ຄືນສິນຄ້າຜູ້ສະໜອງ" (`/inventory/returns`, ລາຍການ + ສ້າງ + post/ຍົກເລີກ + export CSV + ຍອດຄົງຄ້າງຜູ້ສະໜອງ); ໜ້າ Expenses ສະແດງສະຖານະ match
     ແລະ dialog override ສຳລັບ SUPER_ADMIN; dialog ຕັ້ງຄ່າ (`InventorySettingsDialog`) ແກ້ 4 ເກນທີ່ `/stock-adjustments/settings` (ຂະຫຍາຍເປັນ
     endpoint ຕັ້ງຄ່າ inventory ລວມ — PUT ສົ່ງສະເພາະຄ່າທີ່ປ່ຽນ). MSW mock ຄົບທຸກ endpoint ໃໝ່.
> ພາກ 2 (M8/M9/M10/M20, H7, M11, M4, L7, L8, ລາຍງານ) ✅ DONE 2026-09-25 — Migration `20260925150000_inventory_supplier_reservation_reorder`
> (additive: ຖັນ supplier ໃໝ່ + `branchId`/`isActive`/`deletedAt`, `supplier_products`, `stock_reservations` + enum `StockReservationStatus`,
> `Product.reorderPoint/avgDailyUsage/reorderComputedAt`, `currency/fxRate` ໃນ `purchase_orders` + `goods_receipts`, `goods_receipt_lines.unitCostForeign`;
> apply ແລ້ວທັງ dev ແລະ test DB). Test ທັງໝົດຢູ່ `tests/integration/inventory-wave9d.test.ts` (13 test).
9. ✅ **M8/M9/M10/M20 — ຍົກລະດັບ Supplier — DONE 2026-09-25.**
   - M8: taxId, paymentTermsDays, leadTimeDays, currency, bankName/bankAccountName/bankAccountNo (ປ່ຽນບັນຊີ → AuditLog `SUPPLIER_BANK_CHANGE`;
     ບໍ່ reuse `BankAccountChangeRequest` ເພາະນັ້ນເປັນບັນຊີຮັບເງິນຂອງຮ້ານເອງ), isActive. ລາຍການລາຄາ `SupplierProduct` (unitCost, currency, moq,
     leadTimeDays, isPreferred ແບບຜູກຂາດຕໍ່ສິນຄ້າ) — `GET/PUT /suppliers/:id/products`, `DELETE /suppliers/:id/products/:productId`.
     ສ້າງ PO ທີ່ບໍ່ໃສ່ unitCost → ລາຄາຈາກລາຍການລາຄາ (ສະກຸນກົງກັນ) → ບໍ່ດັ່ງນັ້ນ WAC ÷ fxRate. Web-admin: ຟອມຜູ້ສະໜອງມີ 2 ພາກໃໝ່ + dialog ລາຍການລາຄາ;
     ຟອມສ້າງ PO prefill ລາຄາຈາກລາຍການລາຄາ.
   - M9: `branchId` null = ໃຊ້ຮ່ວມ (ຂຽນໄດ້ສະເພາະ SUPER_ADMIN); BRANCH_ADMIN ສ້າງ/ແກ້/ລຶບໄດ້ສະເພາະຂອງສາຂາຕົນ, ອ່ານເຫັນ ໃຊ້ຮ່ວມ + ສາຂາຕົນ.
     ລາຍການລາຄາເປັນຂໍ້ມູນຂອງສິນຄ້າສາຂາ → ກວດ `assertBranchScope(ສາຂາສິນຄ້າ)` (BRANCH_ADMIN ຕັ້ງລາຄາຜູ້ສະໜອງໃຊ້ຮ່ວມໃຫ້ສິນຄ້າສາຂາຕົນໄດ້).
   - M20: ລຶບຜູ້ສະໜອງທີ່ມີ PO/ລາຍຈ່າຍ/ໃບຄືນ = soft delete (deletedAt + isActive=false, ຍັງ 204); ບໍ່ມີ = ລຶບແທ້. `?activeOnly=true` ສຳລັບ dropdown
     ສ້າງ PO; ສ້າງ/ປ່ຽນ PO ດ້ວຍຜູ້ສະໜອງທີ່ປິດ/ລຶບ/ຂອງສາຂາອື່ນ → 400; PO ເກົ່າສະແດງ `supplierInactive`.
   - M10: `PurchaseOrder.currency` (default = ສະກຸນຜູ້ສະໜອງ) + `fxRate` (ບໍ່ໃສ່ = `ExchangeRate` ຜ່ານ `utils/fxRate.ts` `resolveFxRate` —
     helper ດຽວກັບ Expense E1, ຍ້າຍອອກມາຈາກ expenses.service). ລາຄາ PO/GRN input ເປັນສະກຸນ PO; GRN ລັອກ currency/fxRate, ເກັບ
     `unitCost` ເປັນ LAK (= ລາຄາ × fxRate) + `unitCostForeign` → WAC/lot/ledger/3-way match ເປັນ LAK ທັງໝົດ (match ordered = qty × ລາຄາ × fxRate).
     ເກນອະນຸມັດ PO (M6) ທຽບ total × fxRate. ແກ້ currency/fxRate ຫຼັງມີການຮັບ → 409.
10. ✅ **M11 — reorder point ອັດຕະໂນມັດ + ແນະນຳ PO — DONE 2026-09-25.** `reorder.service.ts`: avgDailyUsage = Σ SERVICE_CONSUMED 90 ວັນ ÷ 90
    (+ SOLD − SALE_RETURN ຕັ້ງແຕ່ M13 2026-09-26); leadTime = SupplierProduct ຫຼັກ → Supplier.leadTimeDays → AppSetting `inventory.defaultLeadTimeDays` (7);
    reorderPoint = avg × leadTime + avg × `inventory.safetyStockDays` (3). ເກນທີ່ໃຊ້ຈິງ = max(minStockQty, reorderPoint). Job `reorder-point`
    ທຸກຄືນ 04:15 (Asia/Vientiane) = backfill ການຈອງ + ຄິດ reorder point. `GET /purchase-orders/suggestions?branchId`: ສິນຄ້າ active ທີ່
    available + onOrder ≤ ເກນ (ກັ່ນຝັ່ງ SQL), ຈຳນວນ = ເກນ + avg × `inventory.reorderReviewDays` (7) − (available + onOrder), ປັດຂຶ້ນເປັນຈຳນວນເຕັມ
    (≥ 1) ແລະ ຜົນຄູນ MOQ; ຈັດກຸ່ມ ຜູ້ສະໜອງ × ສາຂາ × ສະກຸນ (ຜູ້ສະໜອງຫຼັກ → ລາຄາຖືກສຸດ → ຜູ້ສະໜອງ PO ຫຼ້າສຸດ → "ບໍ່ມີຜູ້ສະໜອງ").
    3 ຄ່າຕັ້ງໃໝ່ຢູ່ `/stock-adjustments/settings` + `InventorySettingsDialog`. Web-admin: card "ຄຳແນະນຳສັ່ງຊື້" ໃນໜ້າ PO → dialog ແກ້ຈຳນວນ →
    ສ້າງ PO DRAFT ຕໍ່ກຸ່ມໃນຄລິກດຽວ; ຖັນ min ສະແດງ "ຈຸດສັ່ງ N" ເມື່ອສູງກວ່າ min.
    ✅ **M4 + L8 — DONE 2026-09-25**: ຕົວກັ່ນ lowStock ໃຊ້ Prisma field reference (`stockQty ≤ 0 OR ≤ minStockQty OR ≤ reorderPoint`) + pagination
    ຝັ່ງ DB; `inventoryStats` ເປັນ SQL aggregate ດຽວ (ມີ test ທຽບກັບຄວາມໝາຍເກົ່າ). ✅ **L7 — DONE 2026-09-25**: ລຶບສິນຄ້າ → 409 ພ້ອມທຸກເຫດຜົນ
    (`details.reasons`) ເມື່ອ stockQty ≠ 0, lot ຍັງມີຂອງ, ຢູ່ໃນ BOM ຂອງບໍລິການທີ່ບໍ່ຖືກລຶບ, ມີການຈອງ ACTIVE ຫຼື ຢູ່ໃນ PO ທີ່ຍັງເປີດ.
11. ✅ **M13 — ຂາຍສິນຄ້າໜ້າຮ້ານ (retail/OTC) — DONE 2026-09-26.** Migration `20260926160000_inventory_retail_po_revisions`
    (additive: `StockMovementType` + `SOLD`/`SALE_RETURN`, `Product.retailPrice/isSellable`, enum `RetailSaleStatus`, ຕາຕະລາງ
    `retail_sales`/`retail_sale_lines`/`retail_sale_return_lines`; apply ແລ້ວທັງ dev ແລະ test DB). ບໍ່ເພີ່ມ `vatApplicable` — VAT ຄິດລະດັບບິນ.
    - **ການອອກແບບ**: Payment ບໍ່ມີແຖວລາຍການ → `RetailSale` (ເລກ `RS-<ສາຂາ>-<ປີ>-000001`, DocType `RS`) + ແຖວ ຜູກ Payment 1:1
      (ແບບດຽວກັບບິນຊື້ບັດຂອງຂວັນ/ແພັກເກັດ) → ໃຊ້ເສັ້ນທາງເງິນເດີມທັງໝົດ: tender (`POST /payments/:id/tenders`), INV + VAT ຕອນ FULLY_PAID
      (EXCLUSIVE ຢຸດຕອນສ້າງບິນຜ່ານ `exclusiveBillVat`), void, refund/CN, ໃບຮັບເງິນ (`getReceipt` ສະແດງແຖວສິນຄ້າ). ບໍ່ມີເສັ້ນທາງເງິນສົດແຍກ.
    - **ສະຕັອກ**: `payments.recomputeAndSettle` (FULLY_PAID) → `onRetailPaymentSettled` (`retail-stock.service.ts`): lock ແຖວ
      retail_sales + `lockProductRows` → `deductStock` type SOLD (FEFO, lot slices) refId `sale:<retailSaleId>`, valueChange = −COGS,
      ກວດ `allowNegativeStock`; idempotent (`stockPostedAt` + ກວດແຖວ SOLD). ຕັດບໍ່ໄດ້ (ສະຕັອກບໍ່ພໍ) → ເງິນຍັງຮັບ, ບິນ PAID + `stockError`
      → `POST /retail-sales/:id/post-stock` ລອງຄືນ. ຈຳນວນເປັນໜ່ວຍພື້ນຖານ (ໜ່ວຍຂາຍ × factor ຜ່ານ `resolveUomFactors` ຕອນສ້າງ).
    - **ຄືນສິນຄ້າ**: `POST /retail-sales/:id/returns {lines:[{saleLineId, qty, restock}], reason, method}` → `createRefund` (engine ເດີມ,
      ມີ hook `afterCreate` ຂຽນແຖວຄືນໃນ tx ດຽວ; ຍອດ = qty × ລາຄາສຸດທິ/ໜ່ວຍ + VAT EXCLUSIVE). ຕອນ `payRefund` PAID →
      `postRetailReturnForRefund`: SALE_RETURN refId `saleret:<refundId>` ເຂົ້າ lot ເດີມ ຕາມ unitCost ຂອງແຖວ SOLD ເດີມ (ລົບສ່ວນທີ່ຄືນແລ້ວຕໍ່ lot),
      WAC ບໍ່ປ່ຽນ; restock=false = ຄືນເງິນຢ່າງດຽວ. ຄືນເງິນຜ່ານ `/payments/:id/refunds` ໂດຍກົງ = ເງິນຢ່າງດຽວ (ບໍ່ເຂົ້າສະຕັອກ).
      `RefundBillKind` + `RETAIL_SALE`. Void ກ່ອນຈ່າຍ = `voidPayment` ເດີມ (ໝາຍ RetailSale VOIDED; ບໍ່ມີສະຕັອກໃຫ້ຄືນ).
    - **ຄະແນນ**: `earnPoints` ເດີມຜູກ appointment → ບິນ retail ມີລູກຄ້າ earn ແຍກ refId `sale:<id>` (idempotent); clawback ຕອນຄືນເງິນ.
    - **P&L**: `cogs` ລວມ SOLD − SALE_RETURN; ແຖວ memo `retailRevenue` (tender ຂອງບິນ retail) + `retailCogs`. SOLD/SALE_RETURN ບໍ່ແມ່ນ
      ADJUSTMENT_DEDUCT → ບໍ່ເຄີຍເປັນ shrinkage (`SHRINKAGE_MOVEMENT_WHERE` ບໍ່ຕ້ອງແກ້, ມີ test). Turnover/ABC ນັບ SOLD − SALE_RETURN ນຳ.
      `MOVEMENT_SIGN` SOLD −1 / SALE_RETURN +1 → `reconcileStock()` + delta ຂອງໃບນັບ ຮັບຮູ້ (ມີ test). Reorder avgDailyUsage =
      (SERVICE_CONSUMED + SOLD − SALE_RETURN) ÷ 90.
    - **ລາຍງານ**: `GET /retail-sales/margin` → Reports ▸ ລາຍງານມາດຕະຖານ ▸ "ກຳໄລຂາຍໜ້າຮ້ານຕໍ່ສິນຄ້າ" (LedgerTable + CSV); P&L ມີແຖວ memo.
    - **ສິດ**: `/retail-sales` admin + `finance:manage` (ສ້າງ/void/post-stock, ຄືກັບ RecordPaymentPanel), `payments:refund` (ຄືນ),
      `finance:view` (ອ່ານ/export/margin); BRANCH_ADMIN ຖືກ scope.
    - **Web-admin**: tab "ຂາຍໜ້າຮ້ານ" (`/inventory/sales`, `RetailSalesPage`): ກະຕ່າ (ScanInput + ຄົ້ນສິນຄ້າທີ່ຂາຍໄດ້, ຈຳນວນ + ເລືອກໜ່ວຍ,
      ລາຄາ, ສ່ວນຫຼຸດ, ລູກຄ້າ) → ສ້າງບິນ → `RecordPaymentPanel` + `ReceiptDialog` + `RefundPanel` ຂອງ finance; void, ຄືນສິນຄ້າ, ລອງຕັດສະຕັອກຄືນ,
      ລາຍການ + CSV/Excel. ຟອມສິນຄ້າມີ "ຂາຍໜ້າຮ້ານໄດ້" + ລາຄາຂາຍ; ledger ສະແດງ SOLD/SALE_RETURN. MSW mock ຄົບ.
    - Test: `tests/integration/inventory-retail.test.ts` (7 test).
12. ✅ **ລາຍງານ: turnover, days-on-hand, stock aging, ການໃຊ້ຕໍ່ບໍລິການ — DONE 2026-09-25.** (`inventory-reports.service.ts`, admin, BRANCH_ADMIN ຖືກ scope)
    `GET /stock-movements/turnover?from&to&branchId` — turnover = COGS ÷ ((ມູນຄ່າທ້າຍວັນກ່ອນ from + ທ້າຍວັນ to) ÷ 2) ຜ່ານ `getStockValuation`,
    days on hand = ມູນຄ່າສະເລ່ຍ × ຈຳນວນວັນ ÷ COGS (ຕໍ່ສິນຄ້າ + ລວມ); `GET /stock-movements/aging?branchId` — lot ຕາມ receivedAt (ມູນຄ່າ lot),
    ສ່ວນທີ່ບໍ່ມີ lot ຕາມ PURCHASE_IN ຫຼ້າສຸດ (ບໍ່ເຄີຍຮັບ = ວັນສ້າງສິນຄ້າ, ມູນຄ່າ WAC), ຊ່ວງ 0–30/31–60/61–90/90+; `GET /stock-movements/service-usage`
    — SERVICE_CONSUMED (refId `appt:`) ຕໍ່ ບໍລິການ × ສິນຄ້າ (ຈຳນວນ, ມູນຄ່າ, ຕໍ່ນັດ). Reports ▸ ລາຍງານມາດຕະຖານ ກຸ່ມ "ກຳໄລ" ເພີ່ມ 3 ລາຍງານ
    (LedgerTable + CSV, ຊ່ວງວັນ DateField ໃຊ້ຮ່ວມກັບ shrinkage).
> **ຜົນ:** ທຽບເທົ່າໂມດູນ Inventory ຂອງ ERP ລະດັບກາງ

---

## 8. ຂໍ້ແນະນຳລຳດັບຄວາມສຳຄັນ (ຖ້າເວລາຈຳກັດ)

ຖ້າເຮັດໄດ້ພຽງ **5 ຢ່າງ** ໃຫ້ເລືອກລຳດັບນີ້:

1. **C1 (race condition)** — ເພາະຂໍ້ມູນຜິດແລ້ວແກ້ຍ້ອນຫຼັງບໍ່ໄດ້
2. **C2 (ສະຕັອກຕິດລົບ)** — bug ທີ່ຈະເກີດແນ່ນອນເມື່ອໃຊ້ງານຈິງ
3. **H1 (ໃຜເປັນຄົນປັບ)** — ປ້ອງກັນການທຸດຈະລິດ, ຖືກກວ່າການແກ້ຫຼັງເກີດເຫດຫຼາຍເທົ່າ
4. **C4 (WAC costing)** — ບໍ່ມີອັນນີ້ ຕົວເລກກຳໄລທັງລະບົບກໍຜິດ
5. **H3 (stock-take)** — ວິທີດຽວທີ່ຈະຮູ້ວ່າຕົວເລກໃນລະບົບຕົງກັບຂອງຈິງ

---

## 9. ສິ່ງທີ່ອອກແບບໄວ້ດີແລ້ວ (ຢ່າໄປແກ້)

- `Decimal(16,3)` ສຳລັບຈຳນວນ ແລະ `Decimal(16,2)` ສຳລັບເງິນ — ຖືກຕ້ອງຕາມມາດຕະຖານ
- BOM auto-deduct **idempotent** ດ້ວຍ `refId = appt:<id>` ([:434-438](apps/backend/src/modules/inventory/inventory.service.ts#L434-L438)) — ຮັບມື retry ໄດ້ດີ
- `stockQty` ບໍ່ຢູ່ໃນ `productUpdateSchema` — ບັງຄັບໃຫ້ທຸກການປ່ຽນແປງຜ່ານ ledger ([inventory.schema.ts:56](packages/shared-types/src/inventory.schema.ts#L56)) — ນີ້ຄືຫຼັກການທີ່ຖືກຕ້ອງ, ຮັກສາໄວ້
- `assertBranchScope` ໃຊ້ກັບ write ເທົ່ານັ້ນ — ແນວຄິດຊັດເຈນ
- ລຶບ supplier ບໍ່ໄດ້ເມື່ອມີ PO ຜູກຢູ່ — referential integrity ທີ່ຖືກຕ້ອງ
- ໂຄງສ້າງ soft-delete ໃນ `Product` — ມີແລ້ວ, ພຽງແຕ່ຕ້ອງແກ້ເລື່ອງ SKU (C3)
