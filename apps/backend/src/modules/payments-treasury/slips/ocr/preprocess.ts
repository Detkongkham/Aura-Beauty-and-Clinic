import sharp from 'sharp';
import { SLIP_MAX_DIMENSION } from '../../../../constants/paymentsTreasury.js';

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const MAX_INPUT_PIXELS = 60_000_000;

/**
 * ກວດວ່າ bytes ເປັນຮູບຈິງ (ບໍ່ເຊື່ອ contentType ທີ່ client ບອກ) ແລ້ວ normalize ເພື່ອເກັບ:
 * ໝຸນຕາມ EXIF, ຫຍໍ້ດ້ານຍາວ ≤ SLIP_MAX_DIMENSION, ເກັບເປັນ JPEG. ຄືນ null ຖ້າບໍ່ແມ່ນຮູບທີ່ຮອງຮັບ.
 */
export async function normalizeForStorage(input: Buffer): Promise<Buffer | null> {
  try {
    const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) return null;
    return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: SLIP_MAX_DIMENSION, height: SLIP_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 88 })
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * ຊັ້ນ 2 — ກຽມຮູບໃຫ້ Tesseract ອ່ານດີຂຶ້ນ: grayscale → ຂະຫຍາຍຖ້າຮູບນ້ອຍ (ຕົວໜັງສືສະເລ່ຍຄວນສູງ ≥ ~20px)
 * → ປັບ contrast (normalize) → sharpen ເບົາ. ຮັບຮູບທີ່ຜ່ານ `normalizeForStorage` ແລ້ວ.
 */
export async function preprocessForOcr(image: Buffer): Promise<Buffer> {
  const meta = await sharp(image).metadata();
  const width = meta.width ?? 0;
  const targetWidth = width > 0 && width < 1400 ? 1400 : width || undefined;
  return sharp(image)
    .grayscale()
    .resize({ width: targetWidth, withoutEnlargement: false })
    .normalize()
    .sharpen()
    .png()
    .toBuffer();
}
