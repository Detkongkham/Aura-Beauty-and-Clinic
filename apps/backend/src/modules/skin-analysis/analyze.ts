import sharp from 'sharp';
import type { SkinAnalysisKind } from '@abcp/shared-types';

/**
 * ໂມດູນ 30 heuristic — **ບໍ່ແມ່ນ ML ແທ້**. ຄິດໄລ່ຄ່າ pixel stats ພື້ນຖານ (ຄວາມສະຫວ່າງສະເລ່ຍ,
 * ອັດຕາສ່ວນສີແດງ, texture variance) ແລ້ວ map ຜ່ານ threshold ຄົງທີ່ ໄປເປັນ label. ອອກແບບໃຫ້
 * swap ພາຍໃນຟັງຊັນນີ້ໄດ້ພາຍຫຼັງ (vendor ML ແທ້) ໂດຍບໍ່ປ່ຽນ API contract.
 */

type PixelStats = {
  meanLuminance: number;
  stdLuminance: number;
  rednessRatio: number;
};

export async function computePixelStats(buffer: Buffer): Promise<PixelStats> {
  const { data, info } = await sharp(buffer)
    .resize(64, 64, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const pixelCount = data.length / channels;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  const luminances = new Array<number>(pixelCount);

  for (let i = 0; i < pixelCount; i += 1) {
    const r = data[i * channels] ?? 0;
    const g = data[i * channels + 1] ?? 0;
    const b = data[i * channels + 2] ?? 0;
    sumR += r;
    sumG += g;
    sumB += b;
    luminances[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const meanR = sumR / pixelCount;
  const meanG = sumG / pixelCount;
  const meanB = sumB / pixelCount;
  const meanLuminance = luminances.reduce((a, l) => a + l, 0) / pixelCount;
  const variance = luminances.reduce((a, l) => a + (l - meanLuminance) ** 2, 0) / pixelCount;
  const stdLuminance = Math.sqrt(variance);
  const rednessRatio = meanR / (((meanG + meanB) / 2 || 1) as number);

  return { meanLuminance, stdLuminance, rednessRatio };
}

const SKIN_TEXT: Record<string, string> = {
  MILD_REDNESS:
    'ຜິວມີສັນຍານແດງ/ລະຄາຍເລັກນ້ອຍ — ແນະນຳໃຊ້ຜະລິດຕະພັນສະຫງົບຜິວ ແລະ ຫຼີກລ້ຽງການຂັດຜິວແຮງ.',
  DRY_TEXTURE_SKIN: 'ຜິວມີແນວໂນ້ມແຫ້ງ/ຂາດຄວາມຊຸ່ມຊື່ນ — ແນະນຳບຳລຸງດ້ວຍຄວາມຊຸ່ມຊື່ນເປັນປະຈຳ.',
  OILY_SHEEN_SKIN: 'ຜິວມີຄວາມມັນເງົາ — ແນະນຳທຳຄວາມສະອາດເລິກ ແລະ ຄວບຄຸມນ້ຳມັນເປັນປະຈຳ.',
  BALANCED_SKIN: 'ຜິວມີສະພາບສົມດຸນດີ — ຮັກສາການບຳລຸງພື້ນຖານຕໍ່ໄປ.',
};

const HAIR_TEXT: Record<string, string> = {
  DRY_LOW_SHINE_HAIR: 'ຜົມມີແນວໂນ້ມແຫ້ງ ແລະ ຂາດຄວາມເງົາ — ແນະນຳບຳລຸງດ້ວຍນ້ຳມັນ/ຄີມບຳລຸງເລິກ.',
  HIGH_SHINE_HAIR: 'ຜົມມີຄວາມມັນເງົາສູງ — ອາດເປັນຍ້ອນນ້ຳມັນ, ແນະນຳສະຜົມສະໝ່ຳສະເໝີ.',
  HEALTHY_HAIR: 'ຜົມມີສະພາບປົກກະຕິດີ — ຮັກສາການບຳລຸງພື້ນຖານຕໍ່ໄປ.',
};

function labelsForSkin(stats: PixelStats): string[] {
  const labels: string[] = [];
  if (stats.rednessRatio > 1.12) labels.push('MILD_REDNESS');
  if (stats.meanLuminance > 160 && stats.stdLuminance > 25) {
    labels.push('OILY_SHEEN_SKIN');
  } else if (stats.stdLuminance < 20) {
    labels.push('DRY_TEXTURE_SKIN');
  }
  if (labels.length === 0) labels.push('BALANCED_SKIN');
  return labels;
}

function labelsForHair(stats: PixelStats): string[] {
  if (stats.meanLuminance < 90 && stats.stdLuminance < 18) return ['DRY_LOW_SHINE_HAIR'];
  if (stats.stdLuminance > 30) return ['HIGH_SHINE_HAIR'];
  return ['HEALTHY_HAIR'];
}

export type AnalysisResult = { labels: string[]; recommendationText: string };

/** Pure function: buffer → labels/recommendation. ຈຸດດຽວທີ່ຕ້ອງແກ້ຖ້າຈະປ່ຽນເປັນ ML vendor ແທ້. */
export async function analyzeImage(buffer: Buffer, kind: SkinAnalysisKind): Promise<AnalysisResult> {
  const stats = await computePixelStats(buffer);
  const labels = kind === 'SKIN' ? labelsForSkin(stats) : labelsForHair(stats);
  const textMap = kind === 'SKIN' ? SKIN_TEXT : HAIR_TEXT;
  const recommendationText = labels.map((l) => textMap[l] ?? '').join(' ').trim();
  return { labels, recommendationText };
}
