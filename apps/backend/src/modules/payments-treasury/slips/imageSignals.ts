import sharp from 'sharp';

/**
 * S2/S3 — ສັນຍານຈາກຮູບສະລິບ (ບໍ່ແມ່ນ OCR).
 *
 * **ເປັນຫຍັງບໍ່ໃຊ້ dHash/aHash ທຳມະດາ:** ສະລິບຂອງທະນາຄານດຽວກັນໃຊ້ template ດຽວກັນ ພື້ນຂາວເກືອບໝົດ —
 * gradient ໃນພື້ນຂາວເປັນ noise ຂອງ JPEG, ເຮັດໃຫ້ "ສະລິບຄົນລະໃບ" ມີ hash ໃກ້ກັນກວ່າ "ໃບດຽວກັນທີ່ບີບອັດໃໝ່"
 * (ທົດລອງ 2026-09-23: dHash 64×64 → ໃບຕ່າງ 12 bit, ໃບດຽວກັນ re-JPEG 222 bit). ຈຶ່ງໃຊ້ **ຕາຂ່າຍຄວາມໜາແໜ້ນ
 * ຂອງໝຶກ** (ຕັດຂອບ → ປັບຂະໜາດ → binarize → ສັດສ່ວນໝຶກຕໍ່ຊ່ອງ 64×32): ການບີບອັດ/ຫຍໍ້/ເພີ່ມຂອບ ≈ 31,
 * ເລກອ້າງອີງຕ່າງກັນ 2 ຕົວ ≈ 53. ເກນ 42 ຈັບ "ຮູບເກົ່າທີ່ສົ່ງຊ້ຳ/ແກ້ໜ້ອຍດຽວ" ແລະ ບັງຄັບໃຫ້ຄົນກວດ — ບໍ່ປະຕິເສດເອງ.
 */

const GRID_W = 64;
const GRID_H = 32;
const CELL = 8;
const INK_THRESHOLD = 140;
/** ລະດັບ quantize ຂອງແຕ່ລະຊ່ອງ (4 bit → hex ໜຶ່ງຕົວ). */
const LEVELS = 15;
export const NEAR_DUPLICATE_MAX_DISTANCE = 42;
export const FINGERPRINT_LENGTH = GRID_W * GRID_H;

/** ລາຍນິ້ວມືຂອງຮູບ: hex string ຍາວ 2048 (ໜຶ່ງຕົວຕໍ່ຊ່ອງ = ສັດສ່ວນໝຶກ 0–15). null ຖ້າຮູບວ່າງ/ອ່ານບໍ່ໄດ້. */
export async function inkFingerprint(image: Buffer): Promise<string | null> {
  try {
    const w = GRID_W * CELL;
    const h = GRID_H * CELL;
    const px = await sharp(image)
      .flatten({ background: '#ffffff' })
      .grayscale()
      .trim({ threshold: 40 })
      .resize(w, h, { fit: 'fill' })
      .raw()
      .toBuffer();
    const counts = new Uint16Array(GRID_W * GRID_H);
    let ink = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (px[y * w + x]! < INK_THRESHOLD) {
          counts[Math.floor(y / CELL) * GRID_W + Math.floor(x / CELL)]! += 1;
          ink += 1;
        }
      }
    }
    if (ink === 0) return null;
    let out = '';
    for (const c of counts) out += Math.round((c / (CELL * CELL)) * LEVELS).toString(16);
    return out;
  } catch {
    // trim() ຂອງຮູບສີດຽວທັງໝົດ throw — ຖືວ່າບໍ່ມີລາຍນິ້ວມື
    return null;
  }
}

/** ໄລຍະຫ່າງ (ຫົວໜ່ວຍ = ຊ່ອງທີ່ຕ່າງກັນເຕັມ) — ນ້ອຍ = ຄ້າຍ. Infinity ຖ້າຮູບແບບບໍ່ກົງ. */
export function fingerprintDistance(a: string, b: string): number {
  if (a.length !== FINGERPRINT_LENGTH || b.length !== FINGERPRINT_LENGTH) return Number.POSITIVE_INFINITY;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(parseInt(a[i]!, 16) - parseInt(b[i]!, 16));
  return d / LEVELS;
}

/** ແອັບແກ້ຮູບທີ່ຂຽນຊື່ຕົນເອງໄວ້ໃນ EXIF (Software / ProcessingSoftware / XMP CreatorTool). */
const EDITOR_PATTERN =
  /photoshop|lightroom|snapseed|picsart|canva|gimp|pixlr|facetune|meitu|affinity|polarr|vsco|photoroom|inshot|picsart|fotor|photo editor|photodirector/i;

/**
 * S3 — ຊື່ແອັບແກ້ຮູບທີ່ພົບໃນ metadata ຂອງໄຟລ໌ຕົ້ນສະບັບ (ຕ້ອງກວດກ່ອນ normalizeForStorage ທີ່ລ້າງ EXIF).
 * ບໍ່ແມ່ນຫຼັກຖານ — screenshot ທຳມະດາບໍ່ມີ tag ນີ້, ສະນັ້ນເມື່ອມີ ຈຶ່ງຄວນໃຫ້ຄົນເບິ່ງ.
 */
export async function detectEditorSoftware(original: Buffer): Promise<string | null> {
  try {
    const meta = await sharp(original).metadata();
    const blobs = [meta.exif, meta.xmp].filter((b): b is Buffer => Boolean(b));
    for (const b of blobs) {
      const m = b.toString('latin1').match(EDITOR_PATTERN);
      if (m) return m[0];
    }
    return null;
  } catch {
    return null;
  }
}
