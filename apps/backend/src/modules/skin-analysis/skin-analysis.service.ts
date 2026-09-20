import { randomUUID } from 'node:crypto';
import type { CreateSkinAnalysisInput, SkinAnalysisRecommendedService, SkinAnalysisView } from '@abcp/shared-types';
import type { SkinHairAnalysis } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { storage } from '../../storage/index.js';
import { analyzeImage } from './analyze.js';

const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** ຄຳສຳຄັນ ຄົ້ນຫາ service ທີ່ມີຢູ່ ໃນ catalog ເພື່ອແນະນຳ (ບໍ່ສ້າງ service ໃໝ່). */
const SERVICE_KEYWORD_BY_KIND: Record<CreateSkinAnalysisInput['kind'], string> = {
  SKIN: 'ຜິວໜ້າ',
  HAIR: 'ຜົມ',
};

function toView(row: SkinHairAnalysis): SkinAnalysisView {
  const issues = row.detectedIssues as { labels: string[]; recommendationText: string };
  const rec = row.recommendedService as SkinAnalysisRecommendedService;
  return {
    id: row.id,
    kind: row.analysisType as CreateSkinAnalysisInput['kind'],
    photoUrl: row.photoUrl,
    labels: issues?.labels ?? [],
    recommendationText: issues?.recommendationText ?? '',
    recommendedService: rec ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createAnalysis(
  customerId: string,
  input: CreateSkinAnalysisInput,
): Promise<SkinAnalysisView> {
  const buffer = Buffer.from(input.dataBase64, 'base64');
  if (buffer.byteLength === 0) throw ApiError.badRequest('ຮູບບໍ່ຖືກຕ້ອງ');
  if (buffer.byteLength > MAX_PHOTO_BYTES) throw ApiError.badRequest('ຮູບໃຫຍ່ເກີນ 6MB');

  const { labels, recommendationText } = await analyzeImage(buffer, input.kind);

  const ext = EXT_BY_TYPE[input.contentType] ?? 'jpg';
  const key = `skin-analysis/${customerId}/${randomUUID()}.${ext}`;
  const { url } = await storage.save(key, buffer, input.contentType);

  const matchedService = await prisma.service.findFirst({
    where: {
      isActive: true,
      deletedAt: null,
      name: { contains: SERVICE_KEYWORD_BY_KIND[input.kind] },
    },
    select: { id: true, name: true },
  });
  const row = await prisma.skinHairAnalysis.create({
    data: {
      userId: customerId,
      photoUrl: url,
      analysisType: input.kind,
      detectedIssues: { labels, recommendationText },
      // Json field ບໍ່ nullable — ໃຊ້ Prisma.JsonNull ເປັນ sentinel ຕອນບໍ່ພົບ service ທີ່ກົງກັນ.
      recommendedService: matchedService
        ? { serviceId: matchedService.id, serviceName: matchedService.name }
        : Prisma.JsonNull,
    },
  });

  return toView(row);
}

export async function listMyAnalyses(customerId: string): Promise<SkinAnalysisView[]> {
  const rows = await prisma.skinHairAnalysis.findMany({
    where: { userId: customerId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toView);
}
