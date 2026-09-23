import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  NEAR_DUPLICATE_MAX_DISTANCE,
  detectEditorSoftware,
  fingerprintDistance,
  inkFingerprint,
} from '../../src/modules/payments-treasury/slips/imageSignals.js';

/** ສະລິບຈຳລອງ template ດຽວກັນ — ຄືສະລິບຈິງຂອງທະນາຄານດຽວ. */
function slip(amount: string, ref: string, time: string): Promise<Buffer> {
  const lines = ['BCEL One', 'Transfer Successful', `Amount: ${amount} LAK`, 'To: 010120001234567', `Reference No: ${ref}`, `Date: 20/09/2026 ${time}`];
  const text = lines.map((l, i) => `<text x="40" y="${90 + i * 80}" font-size="44" font-family="Arial" fill="#000">${l}</text>`).join('');
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="600"><rect width="100%" height="100%" fill="#fff"/>${text}</svg>`))
    .png()
    .toBuffer();
}

describe('slip image signals (S2/S3)', () => {
  it('the same slip re-compressed, resized or padded stays under the near-duplicate threshold', async () => {
    const a = await slip('150,000', '1758612345678001', '10:42');
    const base = (await inkFingerprint(a))!;
    const variants = [
      await sharp(a).resize(800).jpeg({ quality: 55 }).toBuffer(),
      await sharp(a).resize(1000).extend({ top: 30, bottom: 12, left: 20, right: 5, background: '#fff' }).jpeg({ quality: 70 }).toBuffer(),
    ];
    for (const v of variants) {
      expect(fingerprintDistance(base, (await inkFingerprint(v))!)).toBeLessThanOrEqual(NEAR_DUPLICATE_MAX_DISTANCE);
    }
  });

  it('a different transfer on the same template is far apart', async () => {
    const a = (await inkFingerprint(await slip('150,000', '1758612345678001', '10:42')))!;
    const b = (await inkFingerprint(await slip('2,450,000', '2261909873320415', '18:07')))!;
    expect(fingerprintDistance(a, b)).toBeGreaterThan(NEAR_DUPLICATE_MAX_DISTANCE);
  });

  it('blank images have no fingerprint; mismatched fingerprints never compare as near', async () => {
    const blank = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#ffffff' } }).png().toBuffer();
    expect(await inkFingerprint(blank)).toBeNull();
    expect(fingerprintDistance('abc', 'abc')).toBe(Number.POSITIVE_INFINITY);
  });

  it('flags photo-editor apps written into EXIF, ignores plain images', async () => {
    const plain = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#fff' } }).jpeg().toBuffer();
    const edited = await sharp(plain).jpeg().withExif({ IFD0: { Software: 'PicsArt Photo Studio' } }).toBuffer();
    expect(await detectEditorSoftware(plain)).toBeNull();
    expect(await detectEditorSoftware(edited)).toMatch(/picsart/i);
    expect(await detectEditorSoftware(Buffer.from('not an image'))).toBeNull();
  });
});
