import { Router } from 'express';
import { z } from 'zod';
import {
  createGratuitySchema,
  gratuityListQuerySchema,
  gratuityPayoutSchema,
  journalQuerySchema,
  liabilitiesQuerySchema,
  updateChartOfAccountsSchema,
  updateFinancePolicySchema,
  upsertFxRateSchema,
  type JournalQuery,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { permissionGuard } from '../../middlewares/permissionGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { createGratuity, listGratuities, payoutGratuities } from './gratuity.service.js';
import { buildJournal, journalToCsv } from './journal.service.js';
import { getLiabilities } from './liabilities.service.js';
import { expireLoyaltyPoints, listFxRates, recognizeGiftCardBreakage, refreshFxRates, upsertFxRate } from './maintenance.js';
import { getChartOfAccounts, getFinancePolicy, updateChartOfAccounts, updateFinancePolicy } from './policy.js';

/**
 * Wave 11 — /finance-ledger: ນະໂຍບາຍ, ຜັງບັນຊີ, ໜີ້ສິນ, journal, ທິບ, FX.
 * ອ່ານ = `finance:view`; ປ່ຽນນະໂຍບາຍ/ຜັງບັນຊີ/FX = SUPER_ADMIN + `finance:manage`.
 * ບັນທຶກທິບໃສ່ບິນ (POST /payments/:id/gratuities) ຢູ່ router ດຽວກັນ ເພື່ອບໍ່ແຕະ payments.routes.
 */
export const financeLedgerRouter: Router = Router();
financeLedgerRouter.use(authGuard);

const ADMIN = roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN');
const view = [ADMIN, permissionGuard('finance:view')];
const superManage = [roleGuard('SUPER_ADMIN'), permissionGuard('finance:view', 'finance:manage')];
const idParam = z.object({ id: z.string().uuid() });

financeLedgerRouter.get('/policy', ...view, asyncHandler(async (_req, res) => res.json({ data: await getFinancePolicy() })));
financeLedgerRouter.put(
  '/policy',
  ...superManage,
  validateRequest({ body: updateFinancePolicySchema }),
  asyncHandler(async (req, res) => res.json({ data: await updateFinancePolicy(req.body) })),
);

financeLedgerRouter.get('/accounts', ...view, asyncHandler(async (_req, res) => res.json({ data: await getChartOfAccounts() })));
financeLedgerRouter.put(
  '/accounts',
  ...superManage,
  validateRequest({ body: updateChartOfAccountsSchema }),
  asyncHandler(async (req, res) => res.json({ data: await updateChartOfAccounts(req.body) })),
);

financeLedgerRouter.get(
  '/liabilities',
  ...view,
  validateRequest({ query: liabilitiesQuerySchema }),
  asyncHandler(async (req, res) => res.json({ data: await getLiabilities(req.auth!, req.query as never) })),
);

/** GET /finance-ledger/journal?from&to&branchId&format=csv|json */
financeLedgerRouter.get(
  '/journal',
  ...view,
  validateRequest({ query: journalQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as JournalQuery;
    const auth = req.auth!;
    const branchId = auth.role !== 'SUPER_ADMIN' && auth.branchId ? auth.branchId : q.branchId;
    const journal = await buildJournal({ ...q, branchId });
    if (q.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="journal_${q.from}_${q.to}.csv"`);
      res.send(journalToCsv(journal));
      return;
    }
    res.json({ data: journal });
  }),
);

// ── ທິບ ──
financeLedgerRouter.post(
  '/payments/:id/gratuities',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'),
  validateRequest({ params: idParam, body: createGratuitySchema }),
  asyncHandler(async (req, res) => res.status(201).json({ data: await createGratuity(req.auth!, req.params.id!, req.body) })),
);
financeLedgerRouter.get(
  '/gratuities',
  ...view,
  validateRequest({ query: gratuityListQuerySchema }),
  asyncHandler(async (req, res) => res.json({ data: await listGratuities(req.auth!, req.query as never) })),
);
financeLedgerRouter.post(
  '/gratuities/payout',
  ADMIN,
  permissionGuard('finance:view', 'finance:manage'),
  validateRequest({ body: gratuityPayoutSchema }),
  asyncHandler(async (req, res) => res.json({ data: await payoutGratuities(req.auth!, req.body) })),
);

// ── FX ──
financeLedgerRouter.get('/fx', ...view, asyncHandler(async (_req, res) => res.json({ data: await listFxRates() })));
financeLedgerRouter.put(
  '/fx',
  ...superManage,
  validateRequest({ body: upsertFxRateSchema }),
  asyncHandler(async (req, res) => res.json({ data: await upsertFxRate(req.body) })),
);
financeLedgerRouter.post(
  '/fx/refresh',
  ...superManage,
  asyncHandler(async (_req, res) => res.json({ data: await refreshFxRates({ force: true }) })),
);

// ── ແລ່ນວຽກປະຈຳວັນດ້ວຍມື (ປຸ່ມ "ແລ່ນດຽວນີ້" ໃນໜ້າ admin; job ແລ່ນເອງທຸກມື້) ──
financeLedgerRouter.post(
  '/maintenance/run',
  ...superManage,
  asyncHandler(async (_req, res) => {
    const [points, breakage] = [await expireLoyaltyPoints(), await recognizeGiftCardBreakage()];
    res.json({ data: { points, breakage } });
  }),
);
