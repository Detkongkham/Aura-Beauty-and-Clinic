import { Router } from 'express';
import { z } from 'zod';
import {
  cogsSummaryQuerySchema,
  productCreateSchema,
  productListQuerySchema,
  productUpdateSchema,
  purchaseOrderCreateSchema,
  purchaseOrderListQuerySchema,
  purchaseOrderReceiveSchema,
  purchaseOrderUpdateSchema,
  stockAdjustSchema,
  stockLotListQuerySchema,
  stockMovementListQuerySchema,
  stockMovementStatsQuerySchema,
  stockTransferCreateSchema,
  stockTransferListQuerySchema,
  supplierListQuerySchema,
  supplierWriteSchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as svc from './inventory.service.js';

const idParamSchema = z.object({ id: z.string().uuid() });
const branchQuerySchema = z.object({ branchId: z.string().uuid().optional() });
const manage = roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN');

// ---- /suppliers --------------------------------------------------

export const suppliersRouter: Router = Router();
suppliersRouter.use(authGuard);

suppliersRouter.get(
  '/',
  validateRequest({ query: supplierListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listSuppliers(req.query as never) });
  }),
);
suppliersRouter.get(
  '/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.getSupplier(req.params.id!) });
  }),
);
suppliersRouter.post(
  '/',
  manage,
  validateRequest({ body: supplierWriteSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.createSupplier(req.body) });
  }),
);
suppliersRouter.patch(
  '/:id',
  manage,
  validateRequest({ params: idParamSchema, body: supplierWriteSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.updateSupplier(req.params.id!, req.body) });
  }),
);
suppliersRouter.delete(
  '/:id',
  manage,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await svc.deleteSupplier(req.params.id!);
    res.status(204).send();
  }),
);

// ---- /products -------------------------------------------------

export const productsRouter: Router = Router();
productsRouter.use(authGuard);

productsRouter.get(
  '/',
  validateRequest({ query: productListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listProducts(req.query as never) });
  }),
);
productsRouter.get(
  '/stats',
  validateRequest({ query: branchQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.inventoryStats((req.query as { branchId?: string }).branchId) });
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

// ---- /stock-movements ---------------------------------------

export const stockMovementsRouter: Router = Router();
stockMovementsRouter.use(authGuard);

stockMovementsRouter.get(
  '/',
  validateRequest({ query: stockMovementListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listStockMovements(req.query as never) });
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
stockMovementsRouter.post(
  '/adjust',
  manage,
  validateRequest({ body: stockAdjustSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await svc.adjustStock(req.body, req.auth?.branchId ?? null, req.auth?.sub ?? null) });
  }),
);

// ---- /stock-lots (C5 — lot/expiry + recall) ----------------------

export const stockLotsRouter: Router = Router();
stockLotsRouter.use(authGuard);

// ມີຊື່/ເບີໂທລູກຄ້າໃນ /usage → ຈຳກັດສະເພາະ admin ທັງ 2 endpoint (ບໍ່ເປີດໃຫ້ STAFF/CUSTOMER ອ່ານ).
stockLotsRouter.get(
  '/',
  manage,
  validateRequest({ query: stockLotListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listStockLots(req.query as never, req.auth?.branchId ?? null) });
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
purchaseOrdersRouter.use(authGuard);

purchaseOrdersRouter.get(
  '/',
  validateRequest({ query: purchaseOrderListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listPurchaseOrders(req.query as never) });
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
    res.status(201).json({ data: await svc.createPurchaseOrder(req.body, req.auth?.branchId ?? null) });
  }),
);
purchaseOrdersRouter.patch(
  '/:id',
  manage,
  validateRequest({ params: idParamSchema, body: purchaseOrderUpdateSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.updatePurchaseOrder(req.params.id!, req.body, req.auth?.branchId ?? null) });
  }),
);
purchaseOrdersRouter.post(
  '/:id/receive',
  manage,
  validateRequest({ params: idParamSchema, body: purchaseOrderReceiveSchema }),
  asyncHandler(async (req, res) => {
    res.json({
      data: await svc.receivePurchaseOrder(req.params.id!, req.auth?.branchId ?? null, req.auth?.sub ?? null, req.body),
    });
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
stockTransfersRouter.use(authGuard);

stockTransfersRouter.get(
  '/',
  validateRequest({ query: stockTransferListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.listStockTransfers(req.query as never) });
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
