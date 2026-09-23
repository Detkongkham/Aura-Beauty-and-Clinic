/**
 * OCR adapter contract (docs/payments-treasury-plan.md §3, §5 W3). ປ່ຽນ engine (PaddleOCR / cloud vision)
 * ໄດ້ໂດຍການ implement interface ນີ້ + ປ່ຽນ `getOcrProvider()` — pipeline ແລະ API ບໍ່ປ່ຽນ.
 */
export interface OcrResult {
  text: string;
  /** 0–100 (ຖ້າ engine ໃຫ້ມາ). */
  confidence: number;
  engine: string;
}

export interface OcrProvider {
  readonly engine: string;
  /** ຮັບຮູບທີ່ preprocess ແລ້ວ (grayscale/contrast). */
  recognize(image: Buffer): Promise<OcrResult>;
  shutdown(): Promise<void>;
}
