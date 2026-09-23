import { Router, type Response } from 'express';
import { z } from 'zod';
import {
  approveBankChangeSchema,
  bulkApproveSlipsSchema,
  claimSlipSchema,
  requestSlipInfoSchema,
  reverseSlipSchema,
  slipExportQuerySchema,
  assignTransferAccountSchema,
  bankChangeListQuerySchema,
  bankAccountInsightsQuerySchema,
  bankAccountListQuerySchema,
  createBankAccountSchema,
  createQrIntentSchema,
  rejectBankChangeSchema,
  reviewSlipSchema,
  simulateIntentSchema,
  slipListQuerySchema,
  slipSettingsSchema,
  slipSummaryQuerySchema,
  updateBankAccountSchema,
  updatePaymentProviderSchema,
  uploadBankAccountQrSchema,
  uploadSlipSchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { getActor, permissionGuard } from '../../middlewares/permissionGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { requireIdempotencyKey } from '../../middlewares/idempotency.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as changes from './bank-account-changes.service.js';
import * as ops from './payments-treasury.ops.service.js';
import { reconciliationRouter } from './reconciliation/reconciliation.routes.js';
import { cashDrawerRouter } from './cash-drawer/cash-drawer.routes.js';
import * as service from './payments-treasury.service.js';
import * as slips from './slips/slips.service.js';
import * as webhook from './payments-treasury.webhook.js';
import { WEBHOOK_SIGNATURE_HEADER } from './providers/webhookUtil.js';

const idParamSchema = z.object({ id: z.string().uuid() });
const providerCodeParamSchema = z.object({ code: z.string().min(1) });

/** ຜົນການປ່ຽນບັນຊີ: ນຳໃຊ້ແລ້ວ → ບັນຊີ; ລໍອະນຸມັດ → 202 + ຄຳຂໍ (client ກວດ status). */
function sendMutation(res: Response, result: changes.MutationResult, appliedStatus: number): void {
  if (result.applied) res.status(appliedStatus).json({ data: result.account });
  else res.status(202).json({ data: result.change });
}

/**
 * POST /payments/webhooks/:code — ບໍ່ໃຊ້ authGuard (provider ຮຽກເອງ); ຢືນຢັນດ້ວຍ HMAC ຂອງ raw body.
 * ຕ້ອງ mount ກ່ອນ `/payments` ໃນ routes.ts ເພື່ອບໍ່ຖືກ authGuard ຂອງ paymentsRouter ຈັບ.
 */
export const paymentsWebhookRouter: Router = Router();
paymentsWebhookRouter.post(
  '/:code',
  validateRequest({ params: providerCodeParamSchema }),
  asyncHandler(async (req, res) => {
    if (!req.rawBody) throw ApiError.badRequest('ບໍ່ມີ body');
    const out = await webhook.handleWebhook(
      req.params.code!,
      req.rawBody,
      req.header(WEBHOOK_SIGNATURE_HEADER),
    );
    res.json({ data: { received: true, ...out } });
  }),
);

/** ໂມດູນ 39 — Bank registry / BankAccount CRUD / provider QR-intent / simulate (W1-W2). */
export const paymentsTreasuryRouter: Router = Router();
paymentsTreasuryRouter.use(authGuard);

/** GET /payments-treasury/banks — ລາຍຊື່ທະນາຄານທີ່ຮອງຮັບ (dropdown). */
paymentsTreasuryRouter.get(
  '/banks',
  asyncHandler(async (_req, res) => {
    res.json({ data: await service.listBanks() });
  }),
);

/** GET /payments-treasury/bank-accounts */
paymentsTreasuryRouter.get(
  '/bank-accounts',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ query: bankAccountListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.listBankAccounts(req.auth!, req.query as never) });
  }),
);

/** GET /payments-treasury/bank-accounts/insights?days=&branchId= — ເງິນເຂົ້າ/ອອກ + ສຸຂະພາບຕໍ່ບັນຊີ. */
paymentsTreasuryRouter.get(
  '/bank-accounts/insights',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  permissionGuard('payments:manage'),
  validateRequest({ query: bankAccountInsightsQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await ops.getBankAccountInsights(req.auth!, req.query as never) });
  }),
);

/** GET /payments-treasury/unassigned-transfers?branchId= — ເງິນໂອນທີ່ບໍ່ໄດ້ຜູກບັນຊີ. */
paymentsTreasuryRouter.get(
  '/unassigned-transfers',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  permissionGuard('payments:manage'),
  validateRequest({ query: bankAccountListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await ops.listUnassignedTransfers(req.auth!, req.query as never) });
  }),
);

/** PATCH /payments-treasury/transactions/:id/bank-account — ຜູກບັນຊີ (null → ບັນຊີເທົ່ານັ້ນ). */
paymentsTreasuryRouter.patch(
  '/transactions/:id/bank-account',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  permissionGuard('payments:manage'),
  validateRequest({ params: idParamSchema, body: assignTransferAccountSchema }),
  asyncHandler(async (req, res) => {
    await ops.assignTransferAccount(req.auth!, req.params.id!, req.body);
    res.status(204).send();
  }),
);

/** POST /payments-treasury/bank-accounts — BRANCH_ADMIN → 202 + ຄຳຂໍລໍອະນຸມັດ (ບັນຊີຍັງບໍ່ຖືກສ້າງ). */
paymentsTreasuryRouter.post(
  '/bank-accounts',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  permissionGuard('payments:manage'),
  validateRequest({ body: createBankAccountSchema }),
  asyncHandler(async (req, res) => {
    sendMutation(res, await changes.createBankAccount(req.auth!, req.body), 201);
  }),
);

/** PATCH /payments-treasury/bank-accounts/:id */
paymentsTreasuryRouter.patch(
  '/bank-accounts/:id',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  permissionGuard('payments:manage'),
  validateRequest({ params: idParamSchema, body: updateBankAccountSchema }),
  asyncHandler(async (req, res) => {
    sendMutation(res, await changes.updateBankAccount(req.auth!, req.params.id!, req.body), 200);
  }),
);

/** DELETE /payments-treasury/bank-accounts/:id — soft-disable (ບໍ່ລຶບ default). */
paymentsTreasuryRouter.delete(
  '/bank-accounts/:id',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  permissionGuard('payments:manage'),
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await service.deleteBankAccount(req.auth!, req.params.id!);
    res.status(204).send();
  }),
);

/** POST /payments-treasury/providers/:code/qr-intent — ສ້າງ QR/reference ຜ່ານ adapter. */
paymentsTreasuryRouter.post(
  '/providers/:code/qr-intent',
  requireIdempotencyKey(),
  validateRequest({ params: providerCodeParamSchema, body: createQrIntentSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({
      data: await service.createQrIntent(req.auth!, req.params.code!, req.body),
    });
  }),
);

/** POST /payments-treasury/intents/:id/simulate-paid — dev/staging ເທົ່ານັ້ນ (ປິດໃນ production). */
paymentsTreasuryRouter.post(
  '/intents/:id/simulate-paid',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  permissionGuard('payments:manage'),
  requireIdempotencyKey(),
  validateRequest({ params: idParamSchema, body: simulateIntentSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await webhook.simulateIntent(req.auth!, req.params.id!, req.body.status) });
  }),
);

// ---- ສະລິບໂອນເງິນ + OCR (W3) ---------------------------------

/** GET /payments-treasury/payments/:id/bank-accounts — ບັນຊີຮັບເງິນຂອງສາຂາ (ເຈົ້າຂອງບິນ ຫຼື ພະນັກງານ). */
paymentsTreasuryRouter.get(
  '/payments/:id/bank-accounts',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await service.listPaymentBankAccounts(req.auth!, req.params.id!) });
  }),
);

/** POST /payments-treasury/payments/:id/slips — ລູກຄ້າ/ພະນັກງານອັບສະລິບ. ບໍ່ຕັດຍອດຈົນກວ່າຈະອະນຸມັດ. */
paymentsTreasuryRouter.post(
  '/payments/:id/slips',
  requireIdempotencyKey(),
  validateRequest({ params: idParamSchema, body: uploadSlipSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await slips.uploadSlip(req.auth!, req.params.id!, req.body) });
  }),
);

/** GET /payments-treasury/payments/:id/slips — ສະຖານະສະລິບຂອງບິນ (ເຈົ້າຂອງບິນ ຫຼື ພະນັກງານ). */
paymentsTreasuryRouter.get(
  '/payments/:id/slips',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await slips.listPaymentSlips(req.auth!, req.params.id!) });
  }),
);

/** GET /payments-treasury/slips — ກ່ອງກວດສະລິບ (?verdict=&branchId=&paymentId=). */
paymentsTreasuryRouter.get(
  '/slips',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'),
  permissionGuard('payments:review'),
  validateRequest({ query: slipListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await slips.listSlips(await getActor(req), req.query as never) });
  }),
);

/** GET /payments-treasury/slips/summary — ຕົວເລກຫົວໜ້າກ່ອງກວດ (ຄິວ, ມື້ນີ້, 7 ມື້). */
paymentsTreasuryRouter.get(
  '/slips/summary',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'),
  permissionGuard('payments:review'),
  validateRequest({ query: slipSummaryQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as { branchId?: string };
    res.json({ data: await slips.getSlipSummary(await getActor(req), q.branchId) });
  }),
);

/** POST /payments-treasury/slips/bulk-approve — ຢືນຢັນສະລິບ AUTO_MATCHED ຫຼາຍໃບ; ລາຍງານໃບທີ່ລົ້ມ. */
paymentsTreasuryRouter.post(
  '/slips/bulk-approve',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'),
  permissionGuard('payments:review'),
  requireIdempotencyKey(),
  validateRequest({ body: bulkApproveSlipsSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await slips.bulkApproveSlips(await getActor(req), req.body.ids) });
  }),
);

/** GET /payments-treasury/slips/export — S10: CSV ຂອງການຕັດສິນ ຕາມຕົວກັ່ນຕອງດຽວກັບກ່ອງກວດ. */
paymentsTreasuryRouter.get(
  '/slips/export',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'),
  permissionGuard('payments:review'),
  validateRequest({ query: slipExportQuerySchema }),
  asyncHandler(async (req, res) => {
    const { filename, csv } = await slips.exportSlipsCsv(await getActor(req), req.query as never);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }),
);

/** POST /payments-treasury/slips/:id/claim — S5: ຈອງ/ຕໍ່ອາຍຸການກວດ (force = ຮັບຊ່ວງ). */
paymentsTreasuryRouter.post(
  '/slips/:id/claim',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'),
  permissionGuard('payments:review'),
  validateRequest({ params: idParamSchema, body: claimSlipSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await slips.claimSlip(await getActor(req), req.params.id!, req.body.force === true) });
  }),
);

/** DELETE /payments-treasury/slips/:id/claim — S5: ປ່ອຍ lock ຂອງຕົນເອງ. */
paymentsTreasuryRouter.delete(
  '/slips/:id/claim',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'),
  permissionGuard('payments:review'),
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await slips.releaseSlip(await getActor(req), req.params.id!);
    res.status(204).end();
  }),
);

/** POST /payments-treasury/slips/:id/request-info — S6: ຂໍຮູບ/ຂໍ້ມູນເພີ່ມຈາກລູກຄ້າ (ບໍ່ປະຕິເສດ). */
paymentsTreasuryRouter.post(
  '/slips/:id/request-info',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'),
  permissionGuard('payments:review'),
  validateRequest({ params: idParamSchema, body: requestSlipInfoSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await slips.requestSlipInfo(await getActor(req), req.auth!, req.params.id!, req.body.message) });
  }),
);

/** POST /payments-treasury/slips/:id/reverse — S7: ຍົກເລີກການອະນຸມັດ (tx → REVERSED, ບິນຄິດຍອດຄືນ). */
paymentsTreasuryRouter.post(
  '/slips/:id/reverse',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  permissionGuard('payments:review'),
  requireIdempotencyKey(),
  validateRequest({ params: idParamSchema, body: reverseSlipSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await slips.reverseSlip(await getActor(req), req.params.id!, req.body.reason) });
  }),
);

/** POST /payments-treasury/slips/:id/reprocess — ອ່ານ OCR ໃໝ່ (ລົ້ມ/ອ່ານຜິດ). */
paymentsTreasuryRouter.post(
  '/slips/:id/reprocess',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'),
  permissionGuard('payments:review'),
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await slips.reprocessSlip(await getActor(req), req.params.id!) });
  }),
);

/** GET /payments-treasury/slips/:id — ຜູ້ອັບໂຫຼດເອງ ຫຼື ຜູ້ມີສິດ payments:review ໃນສາຂານັ້ນ. */
paymentsTreasuryRouter.get(
  '/slips/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await slips.getSlip(await getActor(req), req.params.id!) });
  }),
);

/** POST /payments-treasury/slips/:id/review — APPROVE (ພ້ອມແກ້ຄ່າ OCR) ຫຼື REJECT (ຕ້ອງມີເຫດຜົນ). */
paymentsTreasuryRouter.post(
  '/slips/:id/review',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'),
  permissionGuard('payments:review'),
  requireIdempotencyKey(),
  validateRequest({ params: idParamSchema, body: reviewSlipSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await slips.reviewSlip(await getActor(req), req.params.id!, req.body) });
  }),
);

// ---- ຕັ້ງຄ່າ + ກະທົບຍອດ (W5) -----------------------------------

/** POST /payments-treasury/bank-accounts/:id/qr — ອັບໂຫຼດຮູບ QR ຄົງທີ່ (base64). */
paymentsTreasuryRouter.post(
  '/bank-accounts/:id/qr',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  permissionGuard('payments:manage'),
  validateRequest({ params: idParamSchema, body: uploadBankAccountQrSchema }),
  asyncHandler(async (req, res) => {
    sendMutation(res, await changes.uploadBankAccountQr(req.auth!, req.params.id!, req.body), 200);
  }),
);

/** GET /payments-treasury/bank-account-changes?status=&branchId= — ຄິວອະນຸມັດ + ປະຫວັດ. */
paymentsTreasuryRouter.get(
  '/bank-account-changes',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  permissionGuard('payments:manage'),
  validateRequest({ query: bankChangeListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await changes.listChanges(req.auth!, req.query as never) });
  }),
);

/** POST /payments-treasury/bank-account-changes/:id/approve — SUPER_ADMIN + ຢືນຢັນລະຫັດຜ່ານ. */
paymentsTreasuryRouter.post(
  '/bank-account-changes/:id/approve',
  roleGuard('SUPER_ADMIN'),
  permissionGuard('payments:manage'),
  validateRequest({ params: idParamSchema, body: approveBankChangeSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await changes.approveChange(req.auth!, req.params.id!, req.body) });
  }),
);

/** POST /payments-treasury/bank-account-changes/:id/reject */
paymentsTreasuryRouter.post(
  '/bank-account-changes/:id/reject',
  roleGuard('SUPER_ADMIN'),
  permissionGuard('payments:manage'),
  validateRequest({ params: idParamSchema, body: rejectBankChangeSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await changes.rejectChange(req.auth!, req.params.id!, req.body) });
  }),
);

/** POST /payments-treasury/bank-account-changes/:id/cancel — ຜູ້ຍື່ນຍົກເລີກເອງ. */
paymentsTreasuryRouter.post(
  '/bank-account-changes/:id/cancel',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  permissionGuard('payments:manage'),
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await changes.cancelChange(req.auth!, req.params.id!) });
  }),
);

/** GET /payments-treasury/providers — ສະຖານະ provider (mode, webhook, intent ຄ້າງ, event ຜິດປົກກະຕິ). */
paymentsTreasuryRouter.get(
  '/providers',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  permissionGuard('payments:manage'),
  asyncHandler(async (_req, res) => {
    res.json({ data: await ops.listProviders() });
  }),
);

/** PATCH /payments-treasury/providers/:code — ເປີດ/ປິດ + ຄ່າທຳນຽມ. ສູນກາງ → SUPER_ADMIN ເທົ່ານັ້ນ. */
paymentsTreasuryRouter.patch(
  '/providers/:code',
  roleGuard('SUPER_ADMIN'),
  permissionGuard('payments:manage'),
  validateRequest({ params: providerCodeParamSchema, body: updatePaymentProviderSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await ops.updateProvider(req.auth!, req.params.code!, req.body) });
  }),
);

/** GET /payments-treasury/settings — ຕັ້ງຄ່າລະບົບກວດສະລິບ. */
paymentsTreasuryRouter.get(
  '/settings',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  permissionGuard('payments:manage'),
  asyncHandler(async (_req, res) => {
    res.json({ data: await ops.getSlipSettings() });
  }),
);

/** PUT /payments-treasury/settings — ຜົນກະທົບທຸກສາຂາ → SUPER_ADMIN ເທົ່ານັ້ນ. */
paymentsTreasuryRouter.put(
  '/settings',
  roleGuard('SUPER_ADMIN'),
  permissionGuard('payments:manage'),
  validateRequest({ body: slipSettingsSchema.partial() }),
  asyncHandler(async (req, res) => {
    res.json({ data: await ops.updateSlipSettings(req.auth!, req.body) });
  }),
);

/** /payments-treasury/reconciliation/* — ເບິ່ງ reconciliation/reconciliation.routes.ts */
paymentsTreasuryRouter.use('/reconciliation', reconciliationRouter);
/** /payments-treasury/cash-drawer/* — ລິ້ນຊັກເງິນສົດ (G10). */
paymentsTreasuryRouter.use('/cash-drawer', cashDrawerRouter);
