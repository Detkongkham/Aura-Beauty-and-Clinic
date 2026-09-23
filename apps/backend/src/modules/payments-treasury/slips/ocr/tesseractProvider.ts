import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createWorker, type Worker } from 'tesseract.js';
import type { OcrProvider, OcrResult } from './types.js';

const require = createRequire(import.meta.url);

/**
 * language data ມາຈາກ `@tesseract.js-data/eng` (ຢູ່ໃນ node_modules) — ບໍ່ດຶງຈາກ CDN ຕອນ runtime,
 * ຈຶ່ງແລ່ນ offline ໄດ້ ແລະ ບໍ່ສົ່ງຮູບສະລິບອອກນອກລະບົບ.
 */
function langPath(): string {
  return join(dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');
}

/**
 * ຮູບແບບສະລິບທະນາຄານເປັນຕົວເລກ/ລາຕິນເກືອບໝົດ (ຈຳນວນເງິນ, ເລກອ້າງອີງ, ວັນເວລາ, ເລກບັນຊີ) —
 * ຈຸດແຂງຂອງ Tesseract. ຊື່ພາສາລາວອ່ານບໍ່ໄດ້ ແຕ່ບໍ່ແມ່ນ field ທີ່ໃຊ້ຕັດສິນ.
 */
export class TesseractOcrProvider implements OcrProvider {
  readonly engine = 'tesseract.js';
  private workerPromise: Promise<Worker> | null = null;

  private getWorker(): Promise<Worker> {
    this.workerPromise ??= createWorker('eng', 1, {
      langPath: langPath(),
      gzip: true,
      cacheMethod: 'none',
    });
    return this.workerPromise;
  }

  async recognize(image: Buffer): Promise<OcrResult> {
    const worker = await this.getWorker();
    const { data } = await worker.recognize(image);
    return { text: data.text, confidence: data.confidence, engine: this.engine };
  }

  async shutdown(): Promise<void> {
    if (!this.workerPromise) return;
    const p = this.workerPromise;
    this.workerPromise = null;
    await (await p).terminate();
  }
}

let provider: OcrProvider | null = null;

/** ຈຸດດຽວທີ່ຕ້ອງແກ້ຖ້າຈະປ່ຽນ OCR engine. */
export function getOcrProvider(): OcrProvider {
  provider ??= new TesseractOcrProvider();
  return provider;
}

export async function shutdownOcr(): Promise<void> {
  if (!provider) return;
  const p = provider;
  provider = null;
  await p.shutdown();
}
