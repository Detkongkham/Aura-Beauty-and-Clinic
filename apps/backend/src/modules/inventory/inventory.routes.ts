import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  assignUnlottedSchema,
  cogsSummaryQuerySchema,
  goodsReceiptCreateSchema,
  purchaseOrderCloseShortSchema,
  purchaseOrderRejectSchema,
  supplierReturnCancelSchema,
  supplierReturnCreateSchema,
  supplierReturnListQuerySchema,
  productCreateSchema,
  productListQuerySchema,
  productUpdateSchema,
  purchaseOrderCreateSchema,
  purchaseOrderListQuerySchema,
  purchaseOrderReceiveSchema,
  purchaseOrderUpdateSchema,
  serviceMarginQuerySchema,
  stockAdjustRejectSchema,
  stockAdjustRequestListQuerySchema,
  stockAdjustSchema,
  stockAdjustSettingsSchema,
  stockCountCancelSchema,
  stockCountCreateSchema,
  stockCountLinesUpdateSchema,
  stockCountListQuerySchema,
  stockCountRejectSchema,
  stockLotListQuerySchema,
  stockMovementListQuerySchema,
  stockMovementStatsQuerySchema,
  stockShrinkageQuerySchema,
  stockTransferCreateSchema,
  stockTransferListQuerySchema,
  supplierListQuerySchema,
  stockValuationQuerySchema,
  supplierWriteSchema,
  supplierProductWriteSchema,
  reorderSuggestionQuerySchema,
  inventoryTurnoverQuerySchema,
  stockAgingQuerySchema,
  serviceUsageQuerySchema,
  abcQuerySchema,
  productCategoryListQuerySchema,
  productCategoryUpdateSchema,
  productCategoryWriteSchema,
  productLookupQuerySchema,
  uomListQuerySchema,
  uomUpdateSchema,
  uomWriteSchema,
  retailSaleCreateSchema,
  retailSaleListQuerySchema,
  retailSaleReturnSchema,
  retailSaleVoidSchema,
  retailMarginQuerySchema,
  type Permission,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { permissionGuard } from '../../middlewares/permissionGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as reports from './inventory-reports.service.js';
import * as svc from './inventory.service.js';
import * as counts from './stock-count.service.js';
import * as procurement from './procurement.service.js';
import * as reorder from './reorder.service.js';
import * as master from './inventory-master.service.js';
import * as retail from './retail.service.js';

const idParamSchema = z.object({ id: z.string().uuid() });
const branchQuerySchema = z.object({ branchId: z.string().uuid().optional() });
const statsQuerySchema = branchQuerySchema.extend({ categoryId: z.string().uuid().optional() });
const manage = roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN');
const superAdmin = roleGuard('SUPER_ADMIN');

/**
 * ຂໍ້ມູນສາງມີຕົ້ນທຶນ/ມູນຄ່າ → ບລັອກ CUSTOMER ທັງໝົດ. admin ຜ່ານຄືເກົ່າ; STAFF ຜ່ານໄດ້ສະເພາະເມື່ອຖືກມອບສິດ
 * (STAFF ບໍ່ມີສິດ inventory ໂດຍຄ່າເລີ່ມຕົ້ນ) — ໃຫ້ພະນັກງານນັບ/ຮັບເຄື່ອງຜ່ານແອັບມືຖື (M14) ໄດ້.
 */
function staffOrAdmin(permission: Permission) {
  const role = roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF');
  const perm = permissionGuard(permission);
  return (req: Request, res: Response, next: NextFunction): void => {
    role(req, res, (err?: unknown) => {
      if (err) return next(err);
      if (req.auth?.role !== 'STAFF') return next();
      perm(req, res, next);
    });
  };
}
const inventoryRead = staffOrAdmin('inventory:view');
const staffManage = staffOrAdmin('inventory:manage');

// ---- /suppliers --------------------------------------------------

export const suppliersRouter: Router = Router();
suppliersRouter.use(authGuard, inventoryRead);

suppliersRouter.get(
  '/',
  validateRequest({ query: supplierListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listSuppliers(req.query as never, req.auth ?? null) });
  }),
);
suppliersRouter.get(
  '/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.getSupplier(req.params.id!, req.auth ?? null) });
  }),
);
/** M8 — ລາຍການລາຄາຂອງຜູ້ສະໜອງ (BRANCH_ADMIN ເຫັນສະເພາະສິນຄ້າສາຂາຕົນ). */
suppliersRouter.get(
  '/:id/products',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listSupplierProducts(req.params.id!, req.auth ?? null) });
  }),
);
suppliersRouter.put(
  '/:id/products',
  manage,
  validateRequest({ params: idParamSchema, body: supplierProductWriteSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.upsertSupplierProduct(req.params.id!, req.body, req.auth ?? null) });
  }),
);
suppliersRouter.delete(
  '/:id/products/:productId',
  manage,
  validateRequest({ params: z.object({ id: z.string().uuid(), productId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    await svc.deleteSupplierProduct(req.params.id!, req.params.productId!, req.auth ?? null);
    res.status(204).send();
  }),
);
/** H5 — ຍອດຄົງຄ້າງ: ໃບເກັບເງິນ − ຈ່າຍແລ້ວ − debit notes. */
suppliersRouter.get(
  '/:id/balance',
  manage,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await procurement.getSupplierBalance(req.params.id!, req.auth?.branchId ?? null) });
  }),
);
suppliersRouter.post(
  '/',
  manage,
  validateRequest({ body: supplierWriteSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.createSupplier(req.body, req.auth ?? null) });
  }),
);
suppliersRouter.patch(
  '/:id',
  manage,
  validateRequest({ params: idParamSchema, body: supplierWriteSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.updateSupplier(req.params.id!, req.body, req.auth ?? null) });
  }),
);
suppliersRouter.delete(
  '/:id',
  manage,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    // M20 — ມີເອກະສານອ້າງອີງ → soft delete (ຍັງ 204).
    await svc.deleteSupplier(req.params.id!, req.auth ?? null);
    res.status(204).send();
  }),
);

// ---- /products -------------------------------------------------

export const productsRouter: Router = Router();
productsRouter.use(authGuard, inventoryRead);

productsRouter.get(
  '/',
  validateRequest({ query: productListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listProducts(req.query as never) });
  }),
);
productsRouter.get(
  '/stats',
  validateRequest({ query: statsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as { branchId?: string; categoryId?: string };
    res.json({ data: await svc.inventoryStats(q.branchId, q.categoryId) });
  }),
);
/** M2 — ສະແກນ/ພິມລະຫັດ (GTIN → barcode → SKU) → ສິນຄ້າ. 404 = ບໍ່ພົບ. */
productsRouter.get(
  '/lookup',
  validateRequest({ query: productLookupQuerySchema }),
  asyncHandler(async (req, res) => {
    const branchScope = req.auth?.role === 'SUPER_ADMIN' ? null : (req.auth?.branchId ?? null);
    res.json({ data: await svc.lookupProduct(req.query as never, branchScope) });
  }),
);
/** M15 — CSV export: ທຸກແຖວທີ່ຜ່ານຕົວກັ່ນຕອງ (ສູງສຸດ INVENTORY_EXPORT_MAX_ROWS). */
productsRouter.get(
  '/export',
  manage,
  validateRequest({ query: productListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await reports.exportList(svc.listProducts, req.query as never) });
  }),
);
productsRouter.get(
  '/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.getProduct(req.params.id!) });
  }),
);
productsRouter.post(
  '/',
  manage,
  validateRequest({ body: productCreateSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.createProduct(req.body, req.auth?.branchId ?? null, req.auth?.sub ?? null) });
  }),
);
productsRouter.patch(
  '/:id',
  manage,
  validateRequest({ params: idParamSchema, body: productUpdateSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.updateProduct(req.params.id!, req.body, req.auth?.branchId ?? null) });
  }),
);
productsRouter.delete(
  '/:id',
  manage,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await svc.deleteProduct(req.params.id!, req.auth?.branchId ?? null);
    res.status(204).send();
  }),
);

// ---- /uoms (M1) ------------------------------------------------

export const uomsRouter: Router = Router();
uomsRouter.use(authGuard, inventoryRead);

uomsRouter.get(
  '/',
  validateRequest({ query: uomListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await master.listUoms(req.query as never) });
  }),
);
/** ໜ່ວຍໃຊ້ຮ່ວມທົ່ວອົງກອນ: BRANCH_ADMIN ເພີ່ມໄດ້ (ເຊັ່ນ "ຊອງ"), ແກ້/ປິດ ສະເພາະ SUPER_ADMIN. */
uomsRouter.post(
  '/',
  manage,
  validateRequest({ body: uomWriteSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await master.createUom(req.body) });
  }),
);
uomsRouter.patch(
  '/:id',
  superAdmin,
  validateRequest({ params: idParamSchema, body: uomUpdateSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await master.updateUom(req.params.id!, req.body) });
  }),
);

// ---- /product-categories (M3) ------------------------------------

export const productCategoriesRouter: Router = Router();
productCategoriesRouter.use(authGuard, inventoryRead);

productCategoriesRouter.get(
  '/',
  validateRequest({ query: productCategoryListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await master.listProductCategories(req.query as never, req.auth ?? null) });
  }),
);
productCategoriesRouter.post(
  '/',
  manage,
  validateRequest({ body: productCategoryWriteSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await master.createProductCategory(req.body, req.auth ?? null) });
  }),
);
productCategoriesRouter.patch(
  '/:id',
  manage,
  validateRequest({ params: idParamSchema, body: productCategoryUpdateSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await master.updateProductCategory(req.params.id!, req.body, req.auth ?? null) });
  }),
);
productCategoriesRouter.delete(
  '/:id',
  manage,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await master.deleteProductCategory(req.params.id!, req.auth ?? null);
    res.status(204).send();
  }),
);

// ---- /stock-movements ---------------------------------------

export const stockMovementsRouter: Router = Router();
stockMovementsRouter.use(authGuard, inventoryRead);

stockMovementsRouter.get(
  '/',
  validateRequest({ query: stockMovementListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listStockMovements(req.query as never) });
  }),
);
stockMovementsRouter.get(
  '/export',
  manage,
  validateRequest({ query: stockMovementListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await reports.exportList(svc.listStockMovements, req.query as never) });
  }),
);
/** ມູນຄ່າສະຕັອກ ນະທ້າຍວັນ asOf (ຈາກ ledger). */
stockMovementsRouter.get(
  '/valuation',
  manage,
  validateRequest({ query: stockValuationQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await reports.getStockValuation(req.query as never, req.auth?.branchId ?? null) });
  }),
);
/** ລາຍງານການສູນເສຍ (shrinkage) ແຍກຕາມເຫດຜົນ ແລະ ສິນຄ້າ. */
stockMovementsRouter.get(
  '/shrinkage',
  manage,
  validateRequest({ query: stockShrinkageQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await reports.getStockShrinkage(req.query as never, req.auth?.branchId ?? null) });
  }),
);
/** 9D — turnover + days on hand (DIO) ຕໍ່ສິນຄ້າ ໃນຊ່ວງວັນ. */
stockMovementsRouter.get(
  '/turnover',
  manage,
  validateRequest({ query: inventoryTurnoverQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await reports.getInventoryTurnover(req.query as never, req.auth?.branchId ?? null) });
  }),
);
/** 9D — ອາຍຸສະຕັອກ (lot receivedAt / PURCHASE_IN ຫຼ້າສຸດ) ແບ່ງ 0–30/31–60/61–90/90+. */
stockMovementsRouter.get(
  '/aging',
  manage,
  validateRequest({ query: stockAgingQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await reports.getStockAging(req.query as never, req.auth?.branchId ?? null) });
  }),
);
/** 9C — M3 ABC analysis (basis = consumptionValue ໃນຊ່ວງ | stockValue ປັດຈຸບັນ). */
stockMovementsRouter.get(
  '/abc',
  manage,
  validateRequest({ query: abcQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await reports.getAbcAnalysis(req.query as never, req.auth?.branchId ?? null) });
  }),
);
/** 9D — ການໃຊ້ consumable ຕໍ່ບໍລິການ (ຈຳນວນ + ມູນຄ່າ). */
stockMovementsRouter.get(
  '/service-usage',
  manage,
  validateRequest({ query: serviceUsageQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await reports.getServiceUsage(req.query as never, req.auth?.branchId ?? null) });
  }),
);
stockMovementsRouter.get(
  '/stats',
  validateRequest({ query: stockMovementStatsQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.getStockMovementStats(req.query as never) });
  }),
);
stockMovementsRouter.get(
  '/cogs-summary',
  validateRequest({ query: cogsSummaryQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.getCogsSummary(req.query as never) });
  }),
);
/** M12-lite — ກຳໄລຂັ້ນຕົ້ນຕໍ່ບໍລິການ (ລາຍຮັບ COMPLETED − COGS ຂອງ BOM). */
stockMovementsRouter.get(
  '/service-margin',
  manage,
  validateRequest({ query: serviceMarginQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.getServiceMargin(req.query as never, req.auth?.branchId ?? null) });
  }),
);
/** H2 — 201 = ບັນທຶກແລ້ວ, 202 = ມູນຄ່າເກີນເກນ → ສ້າງຄຳຂໍລໍ SUPER_ADMIN ອະນຸມັດ. */
stockMovementsRouter.post(
  '/adjust',
  staffManage,
  validateRequest({ body: stockAdjustSchema }),
  asyncHandler(async (req, res) => {
    const result = await svc.adjustStock(req.body, req.auth ?? null);
    res.status(result.outcome === 'POSTED' ? 201 : 202).json({ data: result });
  }),
);

// ---- /stock-adjustments (H2 — maker-checker) -----------------------

export const stockAdjustmentsRouter: Router = Router();
stockAdjustmentsRouter.use(authGuard, manage);

stockAdjustmentsRouter.get(
  '/',
  validateRequest({ query: stockAdjustRequestListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listAdjustRequests(req.query as never, req.auth?.branchId ?? null) });
  }),
);
stockAdjustmentsRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    res.json({ data: await svc.getAdjustSettings() });
  }),
);
stockAdjustmentsRouter.put(
  '/settings',
  superAdmin,
  validateRequest({ body: stockAdjustSettingsSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.updateAdjustSettings(req.body, req.auth!.sub) });
  }),
);
stockAdjustmentsRouter.post(
  '/:id/approve',
  superAdmin,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.approveAdjustRequest(req.params.id!, req.auth!.sub) });
  }),
);
stockAdjustmentsRouter.post(
  '/:id/reject',
  superAdmin,
  validateRequest({ params: idParamSchema, body: stockAdjustRejectSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.rejectAdjustRequest(req.params.id!, req.auth!.sub, req.body) });
  }),
);

// ---- /stock-lots (C5 — lot/expiry + recall) ----------------------

export const stockLotsRouter: Router = Router();
stockLotsRouter.use(authGuard, inventoryRead);

// /usage ມີຊື່/ເບີໂທລູກຄ້າ → admin ເທົ່ານັ້ນ; ລາຍການ lot ເປີດໃຫ້ STAFF ທີ່ມີ inventory:view.
stockLotsRouter.get(
  '/',
  validateRequest({ query: stockLotListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listStockLots(req.query as never, req.auth?.branchId ?? null) });
  }),
);
stockLotsRouter.get(
  '/export',
  manage,
  validateRequest({ query: stockLotListQuerySchema }),
  asyncHandler(async (req, res) => {
    const authBranchId = req.auth?.branchId ?? null;
    res.json({
      data: await reports.exportList((q) => svc.listStockLots(q, authBranchId), req.query as never),
    });
  }),
);
/** ມອບສະຕັອກເກົ່າທີ່ບໍ່ມີ lot ເຂົ້າ lot (stockQty ບໍ່ປ່ຽນ, ບໍ່ມີ movement — ບັນທຶກ AuditLog). */
stockLotsRouter.post(
  '/assign-unlotted',
  manage,
  validateRequest({ body: assignUnlottedSchema }),
  asyncHandler(async (req, res) => {
    res.json({
      data: await svc.assignUnlottedToLot(req.body, req.auth?.branchId ?? null, req.auth?.sub ?? null),
    });
  }),
);
stockLotsRouter.get(
  '/:id/usage',
  manage,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.getLotUsage(req.params.id!, req.auth?.branchId ?? null) });
  }),
);

// ---- /purchase-orders -------------------------------------

export const purchaseOrdersRouter: Router = Router();
purchaseOrdersRouter.use(authGuard, inventoryRead);

purchaseOrdersRouter.get(
  '/',
  validateRequest({ query: purchaseOrderListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listPurchaseOrders(req.query as never) });
  }),
);
purchaseOrdersRouter.get(
  '/export',
  manage,
  validateRequest({ query: purchaseOrderListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await reports.exportList(svc.listPurchaseOrders, req.query as never) });
  }),
);
/** M11 — ຄຳແນະນຳ PO: available + onOrder ≤ max(min, reorderPoint), ຈັດກຸ່ມຕາມຜູ້ສະໜອງຫຼັກ. */
purchaseOrdersRouter.get(
  '/suggestions',
  manage,
  validateRequest({ query: reorderSuggestionQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await reorder.getReorderSuggestions(req.query as never, req.auth?.branchId ?? null) });
  }),
);
purchaseOrdersRouter.get(
  '/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.getPurchaseOrder(req.params.id!) });
  }),
);
purchaseOrdersRouter.post(
  '/',
  manage,
  validateRequest({ body: purchaseOrderCreateSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.createPurchaseOrder(req.body, req.auth ?? null) });
  }),
);
purchaseOrdersRouter.patch(
  '/:id',
  manage,
  validateRequest({ params: idParamSchema, body: purchaseOrderUpdateSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.updatePurchaseOrder(req.params.id!, req.body, req.auth ?? null) });
  }),
);
/** ເສັ້ນທາງເກົ່າ — "ຮັບທຸກຈຳນວນທີ່ຄ້າງ" ຜ່ານ GRN ໃໝ່ 1 ໃບ. */
purchaseOrdersRouter.post(
  '/:id/receive',
  manage,
  validateRequest({ params: idParamSchema, body: purchaseOrderReceiveSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.receivePurchaseOrder(req.params.id!, req.auth ?? null, req.body) });
  }),
);
/** H4 — ຮັບບາງລາຍການ/ບາງຈຳນວນ (GRN). 409 ເມື່ອຮັບເກີນ tolerance. */
purchaseOrdersRouter.post(
  '/:id/receipts',
  staffManage,
  validateRequest({ params: idParamSchema, body: goodsReceiptCreateSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.receiveGoods(req.params.id!, req.body, req.auth ?? null) });
  }),
);
/** H4 — ປິດຮັບບໍ່ຄົບ (PARTIALLY_RECEIVED → RECEIVED + closedShortAt). */
purchaseOrdersRouter.post(
  '/:id/close-short',
  manage,
  validateRequest({ params: idParamSchema, body: purchaseOrderCloseShortSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.closeShortPurchaseOrder(req.params.id!, req.body, req.auth ?? null) });
  }),
);
/** H4 — 3-way match PO ↔ GRN ↔ ໃບເກັບເງິນ (Expense ທີ່ຜູກ PO). */
purchaseOrdersRouter.get(
  '/:id/match',
  manage,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await procurement.getPoMatch(req.params.id!) });
  }),
);
/** M6 — SUPER_ADMIN ອະນຸມັດ/ປະຕິເສດ PO ທີ່ລໍຖ້າອະນຸມັດ. */
purchaseOrdersRouter.post(
  '/:id/approve',
  superAdmin,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.approvePurchaseOrder(req.params.id!, req.auth!.sub) });
  }),
);
purchaseOrdersRouter.post(
  '/:id/reject',
  superAdmin,
  validateRequest({ params: idParamSchema, body: purchaseOrderRejectSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.rejectPurchaseOrder(req.params.id!, req.auth!.sub, req.body) });
  }),
);
purchaseOrdersRouter.delete(
  '/:id',
  manage,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await svc.deletePurchaseOrder(req.params.id!, req.auth?.branchId ?? null);
    res.status(204).send();
  }),
);

// ---- /stock-transfers (ການໂອນສິນຄ້າຂ້າມສາຂາ) ----------------

export const stockTransfersRouter: Router = Router();
stockTransfersRouter.use(authGuard, inventoryRead);

stockTransfersRouter.get(
  '/',
  validateRequest({ query: stockTransferListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listStockTransfers(req.query as never) });
  }),
);
stockTransfersRouter.get(
  '/export',
  manage,
  validateRequest({ query: stockTransferListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await reports.exportList(svc.listStockTransfers, req.query as never) });
  }),
);
stockTransfersRouter.get(
  '/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.getStockTransfer(req.params.id!) });
  }),
);
stockTransfersRouter.post(
  '/',
  manage,
  validateRequest({ body: stockTransferCreateSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({
      data: await svc.createStockTransfer(req.body, req.auth?.branchId ?? null, req.auth?.sub ?? null),
    });
  }),
);
stockTransfersRouter.post(
  '/:id/send',
  manage,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({
      data: await svc.sendStockTransfer(req.params.id!, req.auth?.branchId ?? null, req.auth?.sub ?? null),
    });
  }),
);
stockTransfersRouter.post(
  '/:id/receive',
  manage,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({
      data: await svc.receiveStockTransfer(req.params.id!, req.auth?.branchId ?? null, req.auth?.sub ?? null),
    });
  }),
);
stockTransfersRouter.delete(
  '/:id',
  manage,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await svc.deleteStockTransfer(req.params.id!, req.auth?.branchId ?? null);
    res.status(204).send();
  }),
);

// ---- /stock-counts (H3 — stock-take / cycle count) ----------------

export const stockCountsRouter: Router = Router();
stockCountsRouter.use(authGuard, inventoryRead);

stockCountsRouter.get(
  '/',
  validateRequest({ query: stockCountListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await counts.listStockCounts(req.query as never, req.auth?.branchId ?? null) });
  }),
);
stockCountsRouter.get(
  '/export',
  manage,
  validateRequest({ query: stockCountListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await counts.exportStockCounts(req.query as never, req.auth?.branchId ?? null) });
  }),
);
stockCountsRouter.get(
  '/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await counts.getStockCount(req.params.id!, req.auth?.branchId ?? null) });
  }),
);
stockCountsRouter.post(
  '/',
  staffManage,
  validateRequest({ body: stockCountCreateSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await counts.createStockCount(req.body, req.auth ?? null) });
  }),
);
stockCountsRouter.post(
  '/:id/start',
  staffManage,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await counts.startStockCount(req.params.id!, req.auth ?? null) });
  }),
);
stockCountsRouter.patch(
  '/:id/lines',
  validateRequest({ params: idParamSchema, body: stockCountLinesUpdateSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await counts.updateStockCountLines(req.params.id!, req.body, req.auth ?? null) });
  }),
);
stockCountsRouter.post(
  '/:id/submit',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await counts.submitStockCount(req.params.id!, req.auth ?? null) });
  }),
);
/** SUPER_ADMIN ສະເໝີ; BRANCH_ADMIN ເມື່ອ Σ|ມູນຄ່າສ່ວນຕ່າງ| ບໍ່ເກີນເກນ inventory.adjustApprovalThresholdLak (ບໍ່ດັ່ງນັ້ນ 403). */
stockCountsRouter.post(
  '/:id/approve',
  manage,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await counts.approveStockCount(req.params.id!, req.auth!) });
  }),
);
stockCountsRouter.post(
  '/:id/reject',
  manage,
  validateRequest({ params: idParamSchema, body: stockCountRejectSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await counts.rejectStockCount(req.params.id!, req.auth!, req.body) });
  }),
);
stockCountsRouter.post(
  '/:id/cancel',
  staffManage,
  validateRequest({ params: idParamSchema, body: stockCountCancelSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await counts.cancelStockCount(req.params.id!, req.auth!, req.body) });
  }),
);

// ---- /supplier-returns (H5 — ຄືນສິນຄ້າຜູ້ສະໜອງ + debit note) ----------------

export const supplierReturnsRouter: Router = Router();
supplierReturnsRouter.use(authGuard, manage);

supplierReturnsRouter.get(
  '/',
  validateRequest({ query: supplierReturnListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await procurement.listSupplierReturns(req.query as never, req.auth?.branchId ?? null) });
  }),
);
supplierReturnsRouter.get(
  '/export',
  validateRequest({ query: supplierReturnListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await procurement.exportSupplierReturns(req.query as never, req.auth?.branchId ?? null) });
  }),
);
supplierReturnsRouter.get(
  '/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await procurement.getSupplierReturn(req.params.id!, req.auth?.branchId ?? null) });
  }),
);
supplierReturnsRouter.post(
  '/',
  validateRequest({ body: supplierReturnCreateSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await procurement.createSupplierReturn(req.body, req.auth ?? null) });
  }),
);
supplierReturnsRouter.post(
  '/:id/post',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await procurement.postSupplierReturn(req.params.id!, req.auth!) });
  }),
);
supplierReturnsRouter.post(
  '/:id/cancel',
  validateRequest({ params: idParamSchema, body: supplierReturnCancelSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await procurement.cancelSupplierReturn(req.params.id!, req.auth!, req.body) });
  }),
);

// ---- /retail-sales (M13 — ຂາຍສິນຄ້າໜ້າຮ້ານ) --------------------------
// ສິດ: ຄືກັບການຮັບເງິນໜ້າຮ້ານ (RecordPaymentPanel = finance:manage); ຄືນສິນຄ້າ = payments:refund; ອ່ານ = finance:view.
// ການຈ່າຍເງິນໃຊ້ POST /payments/:id/tenders ເດີມ (paymentId ຢູ່ໃນ RetailSaleView).

export const retailSalesRouter: Router = Router();
retailSalesRouter.use(authGuard, manage);

retailSalesRouter.get(
  '/',
  permissionGuard('finance:view'),
  validateRequest({ query: retailSaleListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await retail.listRetailSales(req.query as never, req.auth!) });
  }),
);
retailSalesRouter.get(
  '/export',
  permissionGuard('finance:view'),
  validateRequest({ query: retailSaleListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await retail.exportRetailSales(req.query as never, req.auth!) });
  }),
);
/** ລາຍງານກຳໄລຂັ້ນຕົ້ນຕໍ່ສິນຄ້າ (Reports ▸ Standard). */
retailSalesRouter.get(
  '/margin',
  permissionGuard('finance:view'),
  validateRequest({ query: retailMarginQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await retail.getRetailMargin(req.query as never, req.auth!) });
  }),
);
retailSalesRouter.get(
  '/:id',
  permissionGuard('finance:view'),
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await retail.getRetailSale(req.params.id!, req.auth!) });
  }),
);
retailSalesRouter.post(
  '/',
  permissionGuard('finance:manage'),
  validateRequest({ body: retailSaleCreateSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await retail.createRetailSale(req.body, req.auth!) });
  }),
);
retailSalesRouter.post(
  '/:id/void',
  permissionGuard('finance:manage'),
  validateRequest({ params: idParamSchema, body: retailSaleVoidSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await retail.voidRetailSale(req.params.id!, req.body.reason, req.auth!) });
  }),
);
retailSalesRouter.post(
  '/:id/post-stock',
  permissionGuard('finance:manage'),
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await retail.retryRetailSaleStock(req.params.id!, req.auth!) });
  }),
);
retailSalesRouter.post(
  '/:id/returns',
  permissionGuard('payments:refund'),
  validateRequest({ params: idParamSchema, body: retailSaleReturnSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await retail.returnRetailSale(req.params.id!, req.body, req.auth!) });
  }),
);
