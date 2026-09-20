import { Router, json } from 'express';
import { createSkinAnalysisSchema } from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as skinAnalysis from './skin-analysis.service.js';

/**
 * /skin-analysis — Customer App ▸ AI Skin & Hair Camera (Module 30, rule-based heuristic).
 * ທຸກ route: authGuard ; ວິເຄາະ+ດຶງລາຍການສະເພາະຂອງຕົນເອງ (`req.auth!.sub`), ຄືກັນກັບ Module 33.
 */
export const skinAnalysisRouter: Router = Router();
skinAnalysisRouter.use(authGuard);

skinAnalysisRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json({ data: await skinAnalysis.listMyAnalyses(req.auth!.sub) });
  }),
);

// ຮູບ base64 ອາດໃຫຍ່ກວ່າ global 2mb limit — ຍົກ limit ສະເພາະ route ນີ້ (ຄືກັນກັບ treatment photos).
skinAnalysisRouter.post(
  '/',
  json({ limit: '8mb' }),
  validateRequest({ body: createSkinAnalysisSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await skinAnalysis.createAnalysis(req.auth!.sub, req.body) });
  }),
);
