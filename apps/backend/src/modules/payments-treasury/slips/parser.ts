import { VIENTIANE_OFFSET_MINUTES } from '../../../utils/dateHelpers.js';

/** ຜົນ parse ຈາກຂໍ້ຄວາມ OCR ຂອງສະລິບ — ທຸກ field ອາດເປັນ null (ອ່ານບໍ່ໄດ້). */
export interface SlipParsed {
  bankCode: string | null;
  amount: number | null;
  currency: string | null;
  txnRef: string | null;
  transferredAt: Date | null;
  /** ສະລິບບໍ່ມີເວລາ (ມີແຕ່ວັນທີ) — matcher ຈະປຽບທຽບເປັນລະດັບວັນ. */
  dateOnly: boolean;
  senderName: string | null;
  /** ໂຕເລກຂອງ token ທີ່ຄ້າຍເລກບັນຊີ (ລວມແບບປິດບັງ xxxx1234) — matcher ປຽບທຽບກັບບັນຊີຂອງສາຂາ. */
  accountTokens: string[];
}

const BANK_KEYWORDS: ReadonlyArray<readonly [string, RegExp]> = [
  ['BCEL', /bcel|one\s?pay|onepay|banque\s+pour\s+le\s+commerce/i],
  ['LDB', /\bldb\b|lao\s+development\s+bank/i],
  ['JDB', /\bjdb\b|joint\s+development\s+bank/i],
  ['APB', /\bapb\b|agricultural\s+promotion/i],
  ['ST_BANK', /\bst\s?bank\b|sacom/i],
  ['LAO_VIET', /lao\s?viet|\blvb\b/i],
  ['BIC', /\bbic\b/i],
];

export function detectBankCode(text: string): string | null {
  for (const [code, re] of BANK_KEYWORDS) if (re.test(text)) return code;
  return null;
}

/** "150,000" / "150.000" / "150,000.00" / "1.500.000,50" → number. ຄືນ null ຖ້າບໍ່ແມ່ນຕົວເລກເງິນ. */
export function parseMoney(raw: string): number | null {
  const s = raw.replace(/\s+/g, '');
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const lastSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  let intPart = s;
  let decPart = '';
  if (lastSep >= 0) {
    const after = s.slice(lastSep + 1);
    // 1-2 ຫຼັກຫຼັງຕົວແຍກສຸດທ້າຍ = ທົດສະນິຍົມ; 3 ຫຼັກ = ຕົວແຍກຫຼັກພັນ
    if (after.length >= 1 && after.length <= 2) {
      intPart = s.slice(0, lastSep);
      decPart = after;
    }
  }
  const digits = intPart.replace(/[.,]/g, '');
  if (!digits) return null;
  const n = Number(decPart ? `${digits}.${decPart}` : digits);
  return Number.isFinite(n) ? n : null;
}

const CURRENCY_RE = /(LAK|KIP|₭|ກີບ|THB|USD)/i;
const MONEY_TOKEN_RE = /\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/g;
/** ປ້າຍທີ່ຊີ້ຊັດວ່າເປັນ "ຈຳນວນທີ່ໂອນ" (ບໍ່ລວມ transfer/payment ທີ່ອາດເປັນຫົວຂໍ້ ເຊັ່ນ "Transfer Successful"). */
const STRONG_AMOUNT_LABEL_RE = /amount|total|ຈຳນວນ|ຍອດ|ມູນຄ່າ/i;
const WEAK_AMOUNT_LABEL_RE = /transfer(?:red)?|paid|payment|ຈ່າຍ|ໂອນ/i;

function normalizeCurrency(raw: string | undefined): string | null {
  if (!raw) return null;
  const u = raw.toUpperCase();
  if (u === 'KIP' || u === '₭' || u === 'ກີບ' || u === 'LAK') return 'LAK';
  return u;
}

function moneyCandidates(line: string): number[] {
  const out: number[] = [];
  for (const m of line.matchAll(MONEY_TOKEN_RE)) {
    const digitsOnly = m[0].replace(/\D/g, '');
    // ຕົວເລກຍາວບໍ່ມີຕົວແຍກ ≥ 9 ຫຼັກ = ເລກບັນຊີ/ອ້າງອີງ ບໍ່ແມ່ນຈຳນວນເງິນ
    if (!/[.,]/.test(m[0]) && digitsOnly.length >= 9) continue;
    const n = parseMoney(m[0]);
    if (n !== null && n > 0) out.push(n);
  }
  return out;
}

/**
 * ເລືອກຈຳນວນເງິນຕາມລຳດັບຄວາມໜ້າເຊື່ອຖື — ແຕ່ລະຂັ້ນເອົາ "ໂຕທຳອິດ" ຕາມລຳດັບອ່ານ (ບໍ່ແມ່ນໂຕໃຫຍ່ສຸດ ເພາະ
 * ສະລິບມັກມີ "Balance"/"Fee" ຢູ່ໃກ້ໆ): (1) ແຖວທີ່ມີປ້າຍ amount/total (ຫຼືແຖວຖັດໄປຖ້າແຖວນັ້ນບໍ່ມີເລກ)
 * (2) ແຖວທີ່ມີສັນຍາລັກສະກຸນເງິນ (3) ແຖວປ້າຍ transfer/paid (4) ໂຕໃຫຍ່ສຸດໃນທັງໝົດ.
 */
function extractAmount(lines: string[]): { amount: number | null; currency: string | null } {
  let currency: string | null = null;
  const strong: number[] = [];
  const withCurrency: number[] = [];
  const weak: number[] = [];
  const all: number[] = [];

  lines.forEach((line, i) => {
    const cur = line.match(CURRENCY_RE);
    const nums = moneyCandidates(line);
    if (cur) currency ??= normalizeCurrency(cur[1]);
    all.push(...nums);
    if (STRONG_AMOUNT_LABEL_RE.test(line)) {
      strong.push(...(nums.length ? nums : moneyCandidates(lines[i + 1] ?? '')));
    } else if (WEAK_AMOUNT_LABEL_RE.test(line)) {
      weak.push(...nums);
    }
    if (cur) withCurrency.push(...nums);
  });

  const amount = strong[0] ?? withCurrency[0] ?? weak[0] ?? (all.length ? Math.max(...all) : null);
  return { amount, currency };
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const TIME_RE = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i;

function toInstant(y: number, mo: number, d: number, hh: number, mm: number, ss: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59 || y < 2000 || y > 2100) return null;
  // ເວລາໃນສະລິບເປັນເວລາທ້ອງຖິ່ນວຽງຈັນ (UTC+7) → instant UTC
  const ms = Date.UTC(y, mo - 1, d, hh, mm, ss) - VIENTIANE_OFFSET_MINUTES * 60_000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractDateTime(text: string): { at: Date | null; dateOnly: boolean } {
  let y: number | undefined;
  let mo: number | undefined;
  let d: number | undefined;
  let idx = -1;
  let len = 0;

  let m = text.match(/(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (m) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if ((m = text.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/))) {
    // dd/mm/yyyy (ທຳນຽມລາວ); ຖ້າເດືອນ > 12 ສະແດງວ່າເປັນ mm/dd/yyyy
    let a = Number(m[1]);
    let b = Number(m[2]);
    if (b > 12 && a <= 12) [a, b] = [b, a];
    [d, mo, y] = [a, b, Number(m[3])];
  } else if ((m = text.match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})/i))) {
    [d, mo, y] = [Number(m[1]), MONTHS[m[2]!.toLowerCase()], Number(m[3])];
  }
  if (!m || y === undefined || mo === undefined || d === undefined) return { at: null, dateOnly: false };
  idx = m.index ?? 0;
  len = m[0].length;

  // ຫາເວລາໃກ້ວັນທີ (ພາຍໃນ 40 ຕົວອັກສອນ ກ່ອນ/ຫຼັງ)
  const window = text.slice(Math.max(0, idx - 40), idx + len + 40);
  const t = window.match(TIME_RE);
  if (!t) {
    const at = toInstant(y, mo, d, 0, 0, 0);
    return { at, dateOnly: true };
  }
  let hh = Number(t[1]);
  const meridiem = t[4]?.toLowerCase();
  if (meridiem === 'pm' && hh < 12) hh += 12;
  if (meridiem === 'am' && hh === 12) hh = 0;
  return { at: toInstant(y, mo, d, hh, Number(t[2]), Number(t[3] ?? 0)), dateOnly: false };
}

const REF_LABEL_RE =
  /(?:ref(?:erence)?(?:\s*(?:no|number|id|code))?|transaction\s*(?:id|no|number|ref)?|txn(?:\s*(?:id|no|ref))?|trace(?:\s*no)?|receipt\s*(?:no|number)?|ເລກທີ່?ອ້າງອີງ|ເລກອ້າງອີງ|ລະຫັດທຸລະກຳ|ເລກທຸລະກຳ)\s*[:#.-]?\s*([A-Za-z0-9][A-Za-z0-9-]{5,31})/i;

function extractRef(text: string): string | null {
  const m = text.match(REF_LABEL_RE);
  if (!m) return null;
  const v = m[1]!;
  // ຕ້ອງມີຕົວເລກຢ່າງໜ້ອຍ 4 ໂຕ — ກັນຈັບຄຳທົ່ວໄປເຊັ່ນ "Reference" ເຂົ້າໃຈຜິດ
  return (v.match(/\d/g)?.length ?? 0) >= 4 ? v : null;
}

/** token ທີ່ຄ້າຍເລກບັນຊີ: ຂຶ້ນຕົ້ນ/ລົງທ້າຍດ້ວຍຕົວເລກ, ອະນຸຍາດ x * • - ຍະຫວ່າງ ເປັນຕົວປິດບັງ. */
export function extractAccountTokens(text: string): string[] {
  const tokens = new Set<string>();
  for (const m of text.matchAll(/[0-9Xx*•·][0-9Xx*•· -]{4,30}[0-9]/g)) {
    const raw = m[0];
    const masked = /[Xx*•·]/.test(raw);
    const digits = raw.replace(/\D/g, '');
    // ຕົວເລກປົກກະຕິຕ້ອງ ≥ 6 ຫຼັກ; ແບບປິດບັງ ຕ້ອງເຫັນຫາງ ≥ 4 ຫຼັກ
    if (masked ? digits.length >= 4 : digits.length >= 6) tokens.add(digits);
  }
  return [...tokens];
}

function extractSender(text: string): string | null {
  const m = text.match(/(?:^|\n)\s*(?:from|sender|ຜູ້ໂອນ|ຈາກ)\s*[:-]\s*([^\n]{2,60})/i);
  return m ? m[1]!.trim() : null;
}

/** Pure function: ຂໍ້ຄວາມ OCR (+ ຂໍ້ມູນຈາກ QR) → field ທີ່ໂຄງສ້າງແລ້ວ. */
export function parseSlipText(text: string, qr: { reference?: string; amount?: number } = {}): SlipParsed {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const { amount, currency } = extractAmount(lines);
  const { at, dateOnly } = extractDateTime(text);
  return {
    bankCode: detectBankCode(text),
    // QR ເປັນຂໍ້ມູນດິບຈາກທະນາຄານ → ໜ້າເຊື່ອຖືກວ່າ OCR ຖ້າມີ
    amount: qr.amount ?? amount,
    currency: currency ?? (amount !== null || qr.amount !== undefined ? 'LAK' : null),
    txnRef: qr.reference ?? extractRef(text),
    transferredAt: at,
    dateOnly,
    senderName: extractSender(text),
    accountTokens: extractAccountTokens(text),
  };
}
