# Phase 6 — Operations & Inventory close-out (progress)

Roadmap: [implementation_plan.md](../implementation_plan.md) §5. Split from old Phase 6 on 2026-09-10
(see plan note). Waves:

| Wave | Scope | Status |
|------|-------|--------|
| 6.1 | Inventory backend — M32 Suppliers/Products/PO + M14 BOM ledger | ✅ DONE 2026-09-10 |
| 6.2 | Audit-log middleware (M37) wired into write routes | ✅ DONE 2026-09-10 |
| 6.3 | Staff KPI/leaderboard/bonus + commission isPaid + payroll export (M34) | ✅ DONE 2026-09-10 |
| 6.4 | web-admin UI for 6.1–6.3 (replace `/inventory` ComingSoon) | ✅ DONE 2026-09-10 |
| 6.5 | mobile — staff KPI/bonus view polish | ✅ DONE 2026-09-10 |

**Phase 6 COMPLETE.** Full-repo green: `pnpm -r typecheck` ✅ · `pnpm -r lint` ✅ ·
backend `test` **65** · web-admin `test` **32** · mobile `test` **5** · shared-types `test` **6** ·
web-admin `build` ✅ · mobile `expo export --platform ios` ✅ (5.92 MB).

---

## Wave 6.1 — Inventory backend — DONE & verified

`pnpm -r typecheck` ✅ · `pnpm --filter @abcp/backend lint` ✅ · `build` ✅ · `test` **58 pass**
(new `tests/integration/inventory.test.ts`, 4 tests).

### Schema
- **Migration `20260910083950_phase6_inventory_decimal_qty`** — `Product.stockQty` / `minStockQty`,
  `StockMovement.qty` / `balanceAfter`, `PurchaseOrderItem.quantity` all `Int → Decimal(16,3)` so BOM
  fractional consumption (e.g. 0.03 bottle/use) is exact. Dropped `@@index([branchId, stockQty])`,
  added `@@index([branchId, isActive])` on Product, `@@index([branchId, createdAt])` on StockMovement,
  `@@index([branchId, status])` on PurchaseOrder. No data loss (int→numeric cast).

### shared-types — `packages/shared-types/src/inventory.schema.ts` (exported in index.ts)
Query/write schemas + view types for Supplier, Product, StockMovement, PurchaseOrder.

### Backend — `apps/backend/src/modules/inventory/` (service + routes), mounted in `routes.ts`
All `authGuard`; writes `roleGuard('SUPER_ADMIN','BRANCH_ADMIN')`.
- **`/suppliers`** — GET (list+q) / GET :id / POST / PATCH / DELETE (409 if any PO references it)
- **`/products`** — GET (list; filter branchId/q/isActive/lowStock) / GET /stats?branchId / GET :id /
  POST (opening stock writes an `ADJUSTMENT_ADD` movement) / PATCH (no direct stockQty) / DELETE (soft,
  `deletedAt` + isActive=false). View carries `stockValue`, `outOfStock`, `lowStock`.
- **`/stock-movements`** — GET (list; filter productId/branchId/type/from/to) / POST /adjust
  (`{productId, delta, notes}` — delta≠0; rejects 409 if result < 0; writes ADJUSTMENT_ADD/DEDUCT)
- **`/purchase-orders`** — GET (list; filter branchId/supplierId/status) / GET :id (+items) /
  POST (`items[]`, poNumber `PO-XXXXXXXX`, totalAmount computed, status DRAFT|ORDERED) /
  PATCH (items only while DRAFT; status DRAFT→ORDERED / *→CANCELLED; not after RECEIVED/CANCELLED) /
  POST :id/receive (per item: stockQty += qty, `PURCHASE_IN` movement refId `po:<id>`; sets RECEIVED +
  receivedDate; 409 if already RECEIVED/CANCELLED) / DELETE (DRAFT only)
- **`consumeServiceStock(tx, {appointmentId, serviceId})`** — Module 14 BOM hook, exported. For each
  `ServiceConsumable` of the service: deduct `qtyPerUse` from the linked product, write `SERVICE_CONSUMED`
  movement refId `appt:<id>`. **Idempotent** — skips if a SERVICE_CONSUMED movement with that refId+product
  already exists. Stock is allowed to go negative (service is never blocked; low/out flags surface it).
  Wired into the `COMPLETED` block of **both** `appointments.service.ts` (admin PATCH status) and
  `staff-portal.service.ts` (staff finishes job), right after `earnPoints`.

### Seed
- `prisma/seed.ts` — added supplier `55555555-0000-0000-0000-000000000001`
  ("ບໍລິສັດ ບິວຕີ້ຊັບພາຍ ຈຳກັດ"). Existing shampoo/serum products + BOM links unchanged.

### Notes / debt
- `openapi.yaml` NOT updated for the new paths (matches the rest of the Phase-2+ backend).
- web-admin BOM editor still uses synthetic `prod-N` ids — real `Product` uuid binding lands in Wave 6.4.
- No branch-scoped RBAC yet (BRANCH_ADMIN can touch any branch's stock) — consistent with other admin modules.

---

## Wave 6.2 — Audit-log middleware (Module 37) — DONE & verified

- **`apps/backend/src/middlewares/auditLog.ts`** — global middleware mounted in `app.ts` as
  `app.use('/api/v1', apiLimiter, auditLog, apiRouter)`. Wraps `res.json` to capture the payload, and on
  `res.on('finish')` with status < 400 and method POST/PATCH/PUT/DELETE, writes one `AuditLog` row
  fire-and-forget (`.catch` → logger.warn).
  - `action` = `<entity>.<verb>`; entity from a path→entity map (`suppliers→supplier`,
    `purchase-orders→purchase_order`, `services→service`, `payroll→staff`, …); verb from method +
    known sub-action suffixes (`/receive→received`, `/adjust→adjusted`, `/status→status_changed`,
    `/cancel→cancelled`, `/walk-in→walkin_created`, …).
  - `entityId` from `req.params.id` or response `data.id` / `data.appointmentId` (uuid-validated).
  - `userId` / `branchId` from `req.auth` (falls back to body `branchId`), `ipAddress` from `req.ip`.
  - `newValue` = response `data` (JSON, truncated to a marker if > 8 KB). **`oldValue` is not captured**
    — generic middleware has no pre-image; the `/audit-logs` feed already renders `changes: null`.
  - Skips GET/HEAD/OPTIONS and heads `auth`, `audit-logs`, `notifications`, `dashboard`, `reports`, `catalog`.
- **`system.service.ts`** — `AUDIT_CATEGORIES` extended with `supplier`, `product`, `stock`,
  `purchase_order`, `queue`, `payment`, `loyalty`, `giftcard`, `marketing`, `waitlist` so the feed
  categorises the new actions instead of dumping them to `settings`.
- Test `tests/integration/audit-log.test.ts` (2) — successful write logged with actor + `newValue` +
  feed category; GET and failed (400) writes not logged.

---

## Wave 6.3 — Staff KPI / Leaderboard / Payroll (Module 34 + 09) — DONE & verified

### shared-types — `packages/shared-types/src/payroll.schema.ts`
`payrollQuerySchema`, `kpiGoalWriteSchema`, `kpiRecomputeSchema`, `bonusPaidSchema`,
`commissionPaySchema` + `PayrollRow` / `PayrollReport` view types.

### Backend — `apps/backend/src/modules/payroll/` (service + routes), mounted at `/payroll`
All `authGuard` + `roleGuard('SUPER_ADMIN','BRANCH_ADMIN')`.
- **`GET /payroll/kpi?monthYear=YYYY-MM&branchId=`** → `PayrollReport`: per-staff row with `rank`
  (by grossRevenue desc), `completedJobs`, `grossRevenue`, `commissionTotal/Paid/Unpaid` (from
  `StaffCommission` that month), `targetRevenue`/`actualRevenue`/`attainmentPct`/`targetMet`,
  `bonusAmount`, `bonusPaid`, `payable` (commission + bonus), `outstanding` (unpaid commission +
  unpaid bonus) + `totals`.
- **`GET /payroll/export?monthYear=&branchId=`** → `text/csv; charset=utf-8` attachment
  `payroll-<YYYY-MM>.csv` with a UTF-8 BOM (Excel-safe Lao).
- **`PUT /payroll/kpi/:staffProfileId`** `{monthYear, targetRevenue}` — upsert `StaffKpiGoal`, then
  recompute that goal's `actualRevenue` + `bonusAmount`. Returns the fresh `PayrollRow`.
- **`POST /payroll/kpi/recompute`** `{monthYear, branchId?}` — recompute actual + bonus for every
  staff's goal that month (creates a goal row where missing).
- **`PATCH /payroll/kpi/:staffProfileId/bonus-paid`** `{monthYear, isBonusPaid}`.
- **`POST /payroll/commissions/pay`** `{staffProfileId, monthYear, isPaid}` — bulk-flip
  `StaffCommission.isPaid` for that staff's COMPLETED appts that month.
- **Bonus rule:** `bonusAmount = max(0, actualRevenue − targetRevenue) × bonusRate`, `bonusRate` from
  `AppSetting` key `payroll.bonusRate` (default `0.05`, clamp 0–0.5). Constants in
  `src/constants/phase6.ts`.

### Commission-on-completion gap fixed
`appointments.service.ts` admin `updateAppointmentStatus` COMPLETED block now **also upserts
`StaffCommission`** (payout = `totalAmount × StaffProfile.commissionRate`, idempotent on the unique
`appointmentId`) — previously only the staff-portal completion path did, so counter/admin-closed
walk-ins never earned commission and were invisible to payroll.

- Test `tests/integration/payroll.test.ts` (5) — ranked report row, KPI goal → auto bonus on excess,
  recompute, commissions/pay clears unpaid + bonus-paid flip → `outstanding` 0, CSV export shape,
  CUSTOMER → 403.
- Audit map: `payroll` head → entity `staff` (KPI/bonus writes show in the audit feed under `staff`).

---

## Wave 6.4 — web-admin UI — DONE & verified

`pnpm --filter @abcp/web-admin` `typecheck`/`lint`/`build` ✅ · `test` **32** (new `InventoryPage.test.tsx`).

- **shared-types** — `permission.schema.ts` += `inventory:view` / `inventory:manage` (also granted to
  `BRANCH_ADMIN`). Fixed a latent pre-existing lint error in `loyalty.schema.ts` (`LoyaltyTxType` →
  `type` import).
- **`src/features/inventory/`** — `inventory.api.ts` (TanStack Query hooks for all 4 resources) +
  `InventoryTabs.tsx` shell + 4 pages, all code-split in the router:
  - **`/inventory` `InventoryPage`** — stats strip (products / low / out / stock value) + product
    table (branch + q + low-stock filters) + create/edit **Dialog** (opening-stock only on create) +
    manual **stock-adjust Dialog**.
  - **`/inventory/suppliers` `SuppliersPage`** — table + create/edit Dialog + delete (confirm).
  - **`/inventory/purchase-orders` `PurchaseOrdersPage`** — table + status/branch filters + **create
    Dialog** with dynamic line-item rows (product/qty/unitCost, running total) + row-click **detail
    Dialog** (line table, Receive, Delete-if-DRAFT).
  - **`/inventory/ledger` `StockLedgerPage`** — read-only movement feed, branch + type filters.
- **`src/features/payroll/`** — `payroll.api.ts` + **`/staff/payroll` `PayrollPage`**: month + branch
  pickers, totals strip, ranked table (rank / staff / jobs / revenue / target+attainment% / commission
  (+unpaid) / bonus (+paid|due) / outstanding), inline **Set-target Dialog**, per-row **Pay commission**
  & **Mark bonus paid**, header **Recompute** + **Export CSV** (blob download via authed `http`).
- **Router** — `/inventory` ComingSoon replaced with a `RoleRoute permission="inventory:view"` group;
  `/staff/payroll` added under the existing `staff:view` group; `ComingSoonPage` import removed.
  `env.ts` feature flag `inventory: false → true`.
- **nav-items.ts** — new **Inventory** group (Products / Suppliers / Purchase orders / Ledger) +
  **Payroll & KPI** under People.
- **i18n** — `inventory.*` + `payroll.*` namespaces + `nav.*` keys + `common.saved`/`common.deleted`
  added to `lo.json` + `en.json` (parity; codepoint-scanned, 0 Thai chars).
- **MSW** — `src/mocks/handlers/inventory.ts` (offline-mode stubs: empty lists + zero stats + echo
  writes) wired into `handlers/index.ts`. Real backend is still the default (`VITE_ENABLE_MOCKS=false`).

## Wave 6.5 — mobile — DONE & verified

`pnpm --filter @abcp/mobile` `typecheck`/`lint`/`test` ✅ · `expo export --platform ios` ✅.
- `StaffEarningsScreen.tsx` KPI card — the bonus line now shows a paid/pending marker
  (`data.kpiGoal.isBonusPaid` → reuses `staffPortal.earnings.paidLabel` / `unpaidLabel`). The rest of
  the KPI/bonus surface (target vs actual, progress bar, remaining-to-goal, bonus amount) was already
  built in Phase 4 and is fed by the backend `getCommissionSummary` `kpiGoal` block.

---

## Follow-up (2026-09-10) — Inventory permission not visible in Settings ▸ Permissions

The permission matrix (`PermissionMatrix.tsx`) renders rows from a **hardcoded** `GROUP_KEYS`
(`permissionGroups.ts`) and columns from a hardcoded `ACTIONS` list — new permission keys don't appear
automatically.
- `permissionGroups.ts` — added `inventory: Boxes` to `GROUP_ICONS` (→ new "Inventory" row).
- `PermissionMatrix.tsx` — added a 6th **Manage** action column (`ShieldCheck`); grid template
  `repeat(5,44px)` → `repeat(6,44px)`. This also makes the pre-existing `finance:manage` /
  `marketing:manage` grantable in the UI for the first time.
- i18n — `users.permissionGroup.inventory` + `users.permissionAction.manage` (lo + en).

**To actually see it after this change:** restart the backend dev server so it loads the rebuilt
`@abcp/shared-types` (new `inventory:*` enum values), then hard-refresh web-admin. Built-in
`SUPER_ADMIN` / `BRANCH_ADMIN` get `inventory:view`/`:manage` from `ROLE_PERMISSIONS` automatically; a
**custom DB role** must tick the new Inventory boxes in Settings ▸ Permissions and save.

---

## Debt clean-up (2026-09-10)

All three deferred items from Wave 6.1 closed. Full-repo green afterwards: `pnpm -r typecheck` +
`pnpm -r lint` ✅; tests backend **67** / web-admin 32 / mobile 5 / shared-types 6; web-admin build ✅.

### 1. BOM editor synthetic `prod-N` ids → real Product uuids
- **shared-types** `service-admin.schema.ts` — `adminServiceConsumableInputSchema.productId` is now
  `z.string().uuid()`.
- **backend** `services-admin.service.ts` `syncConsumables` — **rejects** (400) any BOM line whose
  `productId` is not a real, non-deleted `Product`, instead of silently dropping it.
- **web-admin** `ServiceFormDialog.tsx` — the BOM row's free-text "product name" input is replaced with
  a **Select of real products** (`useProducts`, 200/page); `productId` is a real uuid, `unit` shows the
  picked product's unit (read-only), `productName`/`unit` sent on submit are sourced from the product
  lookup. Empty-state when there are no products yet (`services.bomNoProducts`). +2 i18n keys lo/en.

### 2. `openapi.yaml`
- Added `Inventory` + `Payroll` tags and full path entries for every Phase 6 endpoint
  (`/suppliers*`, `/products*`, `/stock-movements*`, `/purchase-orders*`, `/payroll/*`) in the file's
  existing compact style (method, summary, security, params/body, `200 — TypeName`). `info.description`
  notes Phase 6. (Phases 2–5 admin paths are still absent — separate spec-reconciliation task.)

### 3. Branch-scoped RBAC for inventory writes
- `inventory.service.ts` — new `assertBranchScope(authBranchId, targetBranchId)`: a BRANCH_ADMIN
  (`req.auth.branchId != null`) may only **mutate** stock in its own branch; SUPER_ADMIN
  (`branchId == null`) is unrestricted; **reads stay unrestricted** (so `branchId=all` dashboards keep
  working, consistent with every other admin module). Threaded `authBranchId` through
  `createProduct` / `updateProduct` / `deleteProduct` / `adjustStock` / `createPurchaseOrder` /
  `updatePurchaseOrder` / `receivePurchaseOrder` / `deletePurchaseOrder`; routes pass
  `req.auth?.branchId ?? null`. Suppliers are global (no branch column) — unchanged.
- `inventory.test.ts` +2 tests (now 6): strict-BOM 400; BRANCH_ADMIN blocked (403) on another
  branch's product adjust/create, allowed on its own.

### Also (unrelated, unblocking the shared gates)
- Striped zero-width-space chars (`U+200B`) that a parallel Phase-7 (Dynamic Pricing) effort left in
  `constants/phase7.ts`, `shared-types/src/pricing.schema.ts`, `modules/pricing/pricing.service.ts` —
  they were failing `no-irregular-whitespace` and blocking `pnpm -r lint`. No logic touched.
- Earlier latent lint fix carried forward: `loyalty.schema.ts` `LoyaltyTxType` → `type` import.

### Permissions matrix follow-up (from earlier this session)
`PermissionMatrix.tsx` gained a 6th **Manage** column + `permissionGroups.ts` gained an `inventory`
row, so `inventory:view`/`:manage` (and the pre-existing `finance:manage`/`marketing:manage`) are
grantable in Settings ▸ Permissions.
