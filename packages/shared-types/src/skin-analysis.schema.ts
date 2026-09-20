import { z } from 'zod';

/**
 * ໂມດູນ 30 — AI Skin & Hair Camera (Phase 7C, revised ໃຫ້ zero-cost). `SkinHairAnalysis` Prisma
 * model ມີມາແຕ່ init migration (inert scaffolding, ຄືກັນກັບ Room/Equipment ກ່ອນ 7C.1) — wave ນີ້
 * ຕໍ່ CRUD+heuristic ໃສ່. **ບໍ່ແມ່ນ ML ແທ້** — ເປັນ deterministic rule-based heuristic ຈາກ pixel
 * stats (brightness/redness/texture variance), ອອກແບບໃຫ້ swap `analyzeImage()` ພາຍໃນໄດ້ພາຍຫຼັງ
 * ໂດຍບໍ່ປ່ຽນ API contract. UI ຕ້ອງສະແດງ disclaimer ວ່າບໍ່ແມ່ນການວິນິດໄສທາງການແພດ.
 */

export const skinAnalysisKindSchema = z.enum(['SKIN', 'HAIR']);
export type SkinAnalysisKind = z.infer<typeof skinAnalysisKindSchema>;

export const createSkinAnalysisSchema = z.object({
  kind: skinAnalysisKindSchema,
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  /** ຮູບ encode ເປັນ base64 (ບໍ່ຕ້ອງມີ data: prefix). ຈຳກັດ ~6MB ຫຼັງ decode. */
  dataBase64: z.string().min(1),
});
export type CreateSkinAnalysisInput = z.infer<typeof createSkinAnalysisSchema>;

export type SkinAnalysisRecommendedService = {
  serviceId: string;
  serviceName: string;
} | null;

export type SkinAnalysisView = {
  id: string;
  kind: SkinAnalysisKind;
  photoUrl: string;
  /** ຄຳສຳຄັນຄົງທີ່ (e.g. 'MILD_REDNESS') — ແປຄວາມໝາຍຢູ່ frontend ຜ່ານ i18n. */
  labels: string[];
  recommendationText: string;
  recommendedService: SkinAnalysisRecommendedService;
  createdAt: string;
};
