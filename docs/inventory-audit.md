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
   + `valueChange Decimal(16,2)?` ໃຫ້ທຸກປະເພດການເໜັງຕີງ (ບວກ=ຮັບເຂົ້າ ณ ຕົ້ນທຶນຮັບ, ລົບ=ຕັດອອກ/COGS
   ณ WAC *ກ່ອນ* ຕັດ) — ໄດ້ valued ledger ຢ່າງແທ້ຈິງ, ບໍ່ backfill ແຖວເກົ່າ (null). ການປັບດ້ວຍມື
   (`adjustStock`) ແລະ ໂອນອອກ (`sendStockTransfer`) ບັນທຶກ unitCost/valueChange ນຳແຕ່ **ບໍ່**ປ່ຽນ WAC.
   Migration `20260924120000_inventory_wac_costing` (additive: widen costPrice ເປັນ 4dp + ເພີ່ມ 2 ຖັນ
   nullable ໃນ stock_movements) ຖືກ apply ແລ້ວທັງ dev ແລະ test DB ໂດຍບໍ່ reset ຂໍ້ມູນ.
2. ✅ **C4b — COGS summary — DONE 2026-09-24.** `getCogsSummary()` + `GET /stock-movements/cogs-summary`
   (sum `valueChange` ຂອງ `SERVICE_CONSUMED` ຕໍ່ສາຂາ/ຊ່ວງວັນທີ) — ພ້ອມໃຫ້ Finance/Dashboard ເອົາໄປທຽບ
   ກັບລາຍຮັບໃນຮອບຕໍ່ໄປ. ໜ້າ Inventory ▸ Products ເພີ່ມ stat card "ຕົ້ນທຶນສິນຄ້າທີ່ໃຊ້ (COGS)" ຂອງ
   ເດືອນນີ້; ໜ້າ Stock Ledger ເພີ່ມ 2 ຖັນ "ຕົ້ນທຶນ/ໜ່ວຍ" + "ມູນຄ່າ" (signed, ສີຂຽວ/ແດງ). ບໍ່ໄດ້ຜູກ COGS
   ເຂົ້າ `finance.prisma`/P&L ໂດຍກົງ ในຮອບນີ້ (ຢູ່ນອກຂອບເຂດ — ອອກແບບເປັນ endpoint ອ່ານໄດ້ອິດສະຫຼະໄວ້ກ່ອນ)
3. H2 — reason code + maker-checker + ແນບຮູບ
4. H3 — Stock-take / cycle count ຄົບວົງຈອນ (backend + web-admin)
5. M5 — PO number ແບບ sequential ຕໍ່ສາຂາ/ປີ
6. M15 — export CSV/Excel ທຸກໜ້າ inventory
7. ລາຍງານ: ມູນຄ່າສະຕັອກຍ້ອນຫຼັງຕາມວັນທີ, shrinkage report
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
2. M1 — UoM + ການແປງໜ່ວຍ
3. M2 — barcode/GTIN + ສະແກນຜ່ານກ້ອງມືຖື
4. M3 — ໝວດສິນຄ້າ + ABC
5. M14 — ໜ້າສະຕັອກໃນແອັບມືຖື (ນັບ, ເບີກ, ສະແກນ)
6. ລາຍງານການສືບຍ້ອນ: lot ນີ້ຖືກໃຊ້ກັບລູກຄ້າຄົນໃດແດ່ (recall)
> **ຜົນ:** ຜ່ານ GMP / ASEAN Cosmetic Directive, ເອີ້ນຄືນສິນຄ້າໄດ້

### 🟢 ຄື້ນ 9D — ຈັດຊື້ & ຫ່ວງໂສ້ອຸປະທານ (3–4 ອາທິດ)
1. H4 — GRN, ຮັບບາງສ່ວນ, ຮັບເກີນ tolerance, 3-way match
2. H5 — ຄືນສິນຄ້າຜູ້ສະໜອງ + debit note
3. H6 — ໂອນລະຫວ່າງສາຂາ + in-transit
4. H7 — ການຈອງ consumable ຈາກນັດໝາຍ (on hand / reserved / available)
5. M6 — PO approval workflow + ວົງເງິນ
6. M8/M9/M10/M20 — ຍົກລະດັບ Supplier (VAT, terms, lead time, ສະກຸນເງິນ, price list, branch scope, soft-delete)
7. M11 — reorder point ອັດຕະໂນມັດ + ແນະນຳ PO
8. M13 — ຂາຍສິນຄ້າໜ້າຮ້ານ (retail)
9. ລາຍງານ: turnover, days-on-hand, stock aging, ການໃຊ້ຕໍ່ບໍລິການ
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
