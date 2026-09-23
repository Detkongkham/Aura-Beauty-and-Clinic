import { createHash } from 'node:crypto';
import type { ReceiptScanInput, ReceiptScanView } from '@abcp/shared-types';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { preprocessForOcr } from '../payments-treasury/slips/ocr/preprocess.js';
import { getOcrProvider } from '../payments-treasury/slips/ocr/tesseractProvider.js';
import { parseMoney } from '../payments-treasury/slips/parser.js';

/**
 * E7 — ອ່ານໃບຮັບເງິນ/ໃບແຈ້ງໜີ້ ເພື່ອຕື່ມຟອມລາຍຈ່າຍລ່ວງໜ້າ. ໃຊ້ pipeline OCR ດຽວກັບສະລິບ (W3: sharp → tesseract).
 *
 * ຫຼັກການ: ຄືນ null ເມື່ອບໍ່ແນ່ໃຈ ດີກວ່າເດົາຜິດ — ຜູ້ໃຊ້ເປັນຄົນກົດ "ນຳໃຊ້" ທຸກຄັ້ງ, ບໍ່ມີການບັນທຶກອັດຕະໂນມັດ.
 * ຮອງຮັບສະເພາະຮູບ (PDF ຕ້ອງ render ກ່ອນ — ຍັງບໍ່ເຮັດ).
 */

const TOTAL_LABEL_RE = /(grand\s*total|net\s*total|total\s*(amount|due|payable)?|amount\s*due|ລວມທັງໝົດ|ຍອດລວມ|ລວມເງິນ|ລວມ|ຍອດຊຳລະ)/i;
const SUBTOTAL_RE = /sub\s*-?\s*total|ລວມຍ່ອຍ/i;
const VAT_LABEL_RE = /(vat|tax|ອາກອນ|ພາສີ)/i;
const INVOICE_RE = /(?:invoice|inv|bill|receipt|ໃບບິນ|ໃບຮັບເງິນ|ເລກທີ)\s*(?:no\.?|number|#|ເລກທີ)?\s*[:#.]?\s*([A-Z0-9][A-Z0-9\-/]{2,24})/i;
const CURRENCY_RE = /\b(LAK|KIP|THB|BAHT|USD)\b|₭|ກີບ|฿|\$/i;
const MONEY_RE = /\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d{3,}(?:[.,]\d{1,2})?/g;

function moneyOnLine(line: string): number[] {
  return (line.match(MONEY_RE) ?? [])
    .map((m) => parseMoney(m.replace(/\s/g, ',')))
    .filter((n): n is number => n != null && n > 0 && n < 1e12);
}

function normalizeCurrency(text: string): string | null {
  const m = text.match(CURRENCY_RE);
  if (!m) return null;
  const t = m[0].toUpperCase();
  if (t === 'LAK' || t === 'KIP' || t === '₭' || t === 'ກີບ') return 'LAK';
  if (t === 'THB' || t === 'BAHT' || t === '฿') return 'THB';
  return 'USD';
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** dd/mm/yyyy · dd-mm-yyyy · yyyy-mm-dd · dd/mm/yy — ຄືນ YYYY-MM-DD ທີ່ບໍ່ຢູ່ໃນອະນາຄົດ. */
export function extractDate(text: string, today = new Date()): string | null {
  const cands: string[] = [];
  for (const m of text.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) cands.push(`${m[1]}-${pad(+m[2]!)}-${pad(+m[3]!)}`);
  for (const m of text.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g)) {
    const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    cands.push(`${y}-${pad(+m[2]!)}-${pad(+m[1]!)}`);
  }
  const todayKey = today.toISOString().slice(0, 10);
  for (const c of cands) {
    const d = new Date(`${c}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== c) continue;
    if (c > todayKey || c < '2000-01-01') continue;
    return c;
  }
  return null;
}

export function parseReceiptText(text: string, today = new Date()): Omit<ReceiptScanView, 'confidence' | 'engine' | 'ms' | 'duplicateOf'> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // ຍອດລວມ: ແຖວທີ່ມີປ້າຍ total (ບໍ່ແມ່ນ subtotal/vat) — ເອົາແຖວສຸດທ້າຍ (ໃບຮັບເງິນມັກວາງ grand total ລຸ່ມສຸດ).
  let total: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (!TOTAL_LABEL_RE.test(l) || SUBTOTAL_RE.test(l) || VAT_LABEL_RE.test(l)) continue;
    const nums = [...moneyOnLine(l), ...(i + 1 < lines.length ? moneyOnLine(lines[i + 1]!) : [])];
    if (nums.length) total = nums[0]!;
  }
  // fallback: ຕົວເລກເງິນທີ່ໃຫຍ່ສຸດ ຖ້າມີພຽງອັນດຽວທີ່ໃຫຍ່ຊັດເຈນ (ບໍ່ເດົາຖ້າມີຫຼາຍຕົວເທົ່າກັນ)
  if (total == null) {
    const all = lines.flatMap(moneyOnLine).sort((a, b) => b - a);
    if (all.length && (all.length === 1 || all[0]! > all[1]!)) total = all[0]!;
  }

  let taxAmount: number | null = null;
  for (const l of lines) {
    if (!VAT_LABEL_RE.test(l)) continue;
    const nums = moneyOnLine(l).filter((n) => total == null || n < total);
    if (nums.length) taxAmount = nums[nums.length - 1]!;
  }

  const inv = text.match(INVOICE_RE);
  const invoiceNumber = inv && /\d/.test(inv[1]!) ? inv[1]!.toUpperCase() : null;

  // ຜູ້ຂາຍ: ແຖວທຳອິດທີ່ມີຕົວອັກສອນ ≥ 3 ຕົວ ແລະ ບໍ່ແມ່ນປ້າຍ/ຕົວເລກລ້ວນ.
  const vendor =
    lines.find((l) => /[A-Za-z຀-໿]{3,}/.test(l) && !TOTAL_LABEL_RE.test(l) && !INVOICE_RE.test(l) && l.length <= 60) ?? null;

  return {
    total,
    taxAmount,
    currency: normalizeCurrency(text),
    date: extractDate(text, today),
    invoiceNumber,
    vendor,
    preview: lines.slice(0, 5),
  };
}

/** POST /expenses/receipt-scan — ອ່ານ + ກວດວ່າໃບຮັບເງິນນີ້ຖືກໃຊ້ແລ້ວບໍ (hash ດຽວກັບ attachment). */
export async function scanReceipt(input: ReceiptScanInput): Promise<ReceiptScanView> {
  const buffer = Buffer.from(input.dataBase64, 'base64');
  if (buffer.byteLength === 0) throw ApiError.badRequest('ໄຟລ໌ບໍ່ຖືກຕ້ອງ');
  if (buffer.byteLength > 8 * 1024 * 1024) throw ApiError.badRequest('ໄຟລ໌ໃຫຍ່ເກີນ 8MB');
  const imageHash = createHash('sha256').update(buffer).digest('hex');
  const started = Date.now();
  const [dup, ocr] = await Promise.all([
    prisma.expenseAttachment.findFirst({ where: { imageHash }, select: { expense: { select: { id: true, title: true } } } }),
    preprocessForOcr(buffer)
      .then((img) => getOcrProvider().recognize(img))
      .catch(() => {
        throw ApiError.badRequest('ອ່ານຮູບບໍ່ໄດ້ — ລອງຖ່າຍໃໝ່ໃຫ້ຊັດ');
      }),
  ]);
  return {
    ...parseReceiptText(ocr.text),
    confidence: Math.round(ocr.confidence),
    engine: ocr.engine,
    ms: Date.now() - started,
    duplicateOf: dup ? { expenseId: dup.expense.id, title: dup.expense.title } : null,
  };
}
