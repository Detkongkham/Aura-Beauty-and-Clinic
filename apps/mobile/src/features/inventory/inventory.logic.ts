import type {
  GoodsReceiptLineInput,
  ProductUomConversionView,
  PurchaseOrderItemView,
  StockAdjustReasonValue,
  StockCountLineView,
} from '@abcp/shared-types';
import { STOCK_ADJUST_REASONS_REQUIRING_NOTES } from '@abcp/shared-types';

/**
 * M14 — ຕັກກະສາດລ້ວນ (ບໍ່ມີ React / RN) ຂອງໜ້າສະຕັອກໃນມືຖື ເພື່ອໃຫ້ vitest ທົດສອບໄດ້ໃນ node.
 */

/** ປະເພດ barcode ທີ່ກ້ອງສະແກນ (expo-camera `barcodeScannerSettings`). */
export const STOCK_BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr'] as const;

/** ລະຫັດທີ່ອ່ານໄດ້ → ຮູບແບບທີ່ /products/lookup ຮັບ (ຕັດຍະຫວ່າງ/ຕົວຄວບຄຸມ, ≤ 64 ຕົວ). null = ໃຊ້ບໍ່ໄດ້. */
export function normalizeScannedCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // eslint-disable-next-line no-control-regex
  const code = raw.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!code || code.length > 64) return null;
  return code;
}

// ---- ຈຳນວນ -----------------------------------------------------------------

/** ຂໍ້ຄວາມທີ່ພິມ → ຈຳນວນບວກ/ສູນ (ຮັບ "," ເປັນຈຸດທົດສະນິຍົມ). "" → null, ຜິດ → NaN. */
export function parseQty(text: string): number | null {
  const s = text.trim().replace(',', '.');
  if (s === '') return null;
  if (!/^\d*\.?\d*$/.test(s) || s === '.') return Number.NaN;
  return Number(s);
}

/** ສະແດງຈຳນວນແບບສັ້ນ (ບໍ່ເກີນ 3 ທົດສະນິຍົມ, ບໍ່ມີ 0 ທ້າຍ). */
export function formatQty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const r = Math.round(n * 1000) / 1000;
  return r.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

// ---- ວັນໝົດອາຍຸ ---------------------------------------------------------

export type ExpiryTone = 'destructive' | 'warning' | 'success' | 'neutral';

/** ສີຕາມຈຳນວນວັນເຫຼືອ: ໝົດແລ້ວ = ແດງ, ≤ 60 ວັນ = ເຫຼືອງ (ກົງກັບ StockLotStatus EXPIRING), ນອກນັ້ນ = ຂຽວ. */
export function expiryTone(daysLeft: number | null | undefined): ExpiryTone {
  if (daysLeft == null) return 'neutral';
  if (daysLeft < 0) return 'destructive';
  if (daysLeft <= 60) return 'warning';
  return 'success';
}

/**
 * ຊ່ອງວັນທີແບບ mask (ພິມຕົວເລກ 8 ຕົວ → YYYY-MM-DD) — ບໍ່ຂຶ້ນກັບ locale ຂອງເຄື່ອງ
 * (ຄືກັບ DateField ຂອງ web-admin), ບໍ່ຕ້ອງໃຊ້ native date picker.
 */
export function maskIsoDate(text: string): string {
  const d = text.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

/** YYYY-MM-DD ທີ່ເປັນວັນຈິງ (ບໍ່ແມ່ນ 2026-02-31). */
export function isValidIsoDate(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** ຈຳນວນວັນປະຕິທິນລະຫວ່າງ 2 ວັນ YYYY-MM-DD (b − a). */
export function daysBetweenIso(a: string, b: string): number {
  const toUtc = (s: string): number => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

// ---- ນັບສະຕັອກ -------------------------------------------------------------

/** ຮ່າງຂອງແຖວນັບ (ຂໍ້ຄວາມໃນຊ່ອງ) — key = lineId. */
export type CountDrafts = Record<string, string>;

/** ແຖວທີ່ຮ່າງຕ່າງຈາກຄ່າ server ແລະ ພິມຖືກຕ້ອງ → payload PATCH /stock-counts/:id/lines. */
export function dirtyCountLines(
  lines: readonly Pick<StockCountLineView, 'id' | 'countedQty'>[],
  drafts: CountDrafts,
): { lineId: string; countedQty: number | null }[] {
  const out: { lineId: string; countedQty: number | null }[] = [];
  for (const line of lines) {
    const text = drafts[line.id];
    if (text === undefined) continue;
    const qty = parseQty(text);
    if (qty !== null && Number.isNaN(qty)) continue;
    if (qty === line.countedQty) continue;
    out.push({ lineId: line.id, countedQty: qty });
  }
  return out;
}

/** ຈຳນວນແຖວທີ່ນັບແລ້ວ (ລວມຮ່າງທີ່ຍັງບໍ່ບັນທຶກ). */
export function countedProgress(
  lines: readonly Pick<StockCountLineView, 'id' | 'countedQty'>[],
  drafts: CountDrafts,
): { counted: number; total: number } {
  let counted = 0;
  for (const l of lines) {
    const d = drafts[l.id];
    const v = d === undefined ? l.countedQty : parseQty(d);
    if (v != null && !Number.isNaN(v)) counted += 1;
  }
  return { counted, total: lines.length };
}

// ---- ປັບສະຕັອກ -------------------------------------------------------------

export function adjustNeedsNotes(reason: StockAdjustReasonValue | null): boolean {
  return !!reason && STOCK_ADJUST_REASONS_REQUIRING_NOTES.includes(reason);
}

export type AdjustFormError = 'qty' | 'reason' | 'notes' | 'lot' | null;

export function validateAdjust(v: {
  direction: 'add' | 'deduct';
  qtyText: string;
  reason: StockAdjustReasonValue | null;
  notes: string;
  trackLot: boolean;
  lotNumber: string;
  expiry: string;
}): AdjustFormError {
  const qty = parseQty(v.qtyText);
  if (qty == null || Number.isNaN(qty) || qty <= 0) return 'qty';
  if (!v.reason) return 'reason';
  if (adjustNeedsNotes(v.reason) && !v.notes.trim()) return 'notes';
  if (v.direction === 'add' && v.trackLot) {
    if (!v.lotNumber.trim()) return 'lot';
    if (v.expiry && !isValidIsoDate(v.expiry)) return 'lot';
  }
  return null;
}

// ---- ຮັບສິນຄ້າ (GRN) -------------------------------------------------------

export type ReceiveDraft = {
  received: string;
  rejected: string;
  rejectReason: string;
  /** null = ໜ່ວຍພື້ນຖານ; undefined = ໜ່ວຍທີ່ສັ່ງໃນ PO. */
  uomId: string | null | undefined;
  lotNumber: string;
  expiryDate: string;
};

export function initialReceiveDraft(item: PurchaseOrderItemView): ReceiveDraft {
  const factor = item.factorToBase > 0 ? item.factorToBase : 1;
  return {
    received: item.qtyOutstanding > 0 ? formatPlain(item.qtyOutstanding / factor) : '',
    rejected: '',
    rejectReason: '',
    uomId: undefined,
    lotNumber: item.lotNumber ?? '',
    expiryDate: item.expiryDate ?? '',
  };
}

function formatPlain(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** ອັດຕາແປງຂອງໜ່ວຍທີ່ເລືອກ → ໜ່ວຍພື້ນຖານ. */
export function receiveFactor(
  item: Pick<PurchaseOrderItemView, 'uomId' | 'factorToBase'>,
  uomId: string | null | undefined,
  conversions: readonly ProductUomConversionView[],
): number {
  if (uomId === undefined) return item.factorToBase > 0 ? item.factorToBase : 1;
  if (uomId === null) return 1;
  return conversions.find((c) => c.uomId === uomId)?.factorToBase ?? 1;
}

export type ReceiveLineError = 'qty' | 'rejectReason' | 'lot' | 'expiry' | null;

export function validateReceiveLine(item: Pick<PurchaseOrderItemView, 'trackLot'>, d: ReceiveDraft): ReceiveLineError {
  const rec = parseQty(d.received);
  const rej = parseQty(d.rejected);
  if ((rec !== null && Number.isNaN(rec)) || (rej !== null && Number.isNaN(rej))) return 'qty';
  if ((rej ?? 0) > 0 && !d.rejectReason.trim()) return 'rejectReason';
  if (item.trackLot && (rec ?? 0) > 0 && !d.lotNumber.trim()) return 'lot';
  if (d.expiryDate && !isValidIsoDate(d.expiryDate)) return 'expiry';
  return null;
}

/** ຮ່າງ → lines ຂອງ POST /purchase-orders/:id/receipts (ຂ້າມແຖວທີ່ບໍ່ມີຈຳນວນ). */
export function buildReceiptLines(
  items: readonly PurchaseOrderItemView[],
  drafts: Record<string, ReceiveDraft>,
): GoodsReceiptLineInput[] {
  const lines: GoodsReceiptLineInput[] = [];
  for (const item of items) {
    const d = drafts[item.id];
    if (!d) continue;
    const rec = parseQty(d.received) ?? 0;
    const rej = parseQty(d.rejected) ?? 0;
    if (Number.isNaN(rec) || Number.isNaN(rej) || (rec <= 0 && rej <= 0)) continue;
    const line: GoodsReceiptLineInput = { poItemId: item.id, qtyReceived: rec, qtyRejected: rej };
    if (rej > 0) line.rejectReason = d.rejectReason.trim();
    if (d.uomId !== undefined) line.uomId = d.uomId;
    if (d.lotNumber.trim()) line.lotNumber = d.lotNumber.trim();
    if (d.expiryDate) line.expiryDate = d.expiryDate;
    lines.push(line);
  }
  return lines;
}
