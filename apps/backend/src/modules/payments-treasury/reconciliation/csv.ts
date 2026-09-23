import type { StatementMapping, StatementParsedLine } from '@abcp/shared-types';

/**
 * G1 — ອ່ານໄຟລ໌ CSV ຂອງ statement ທະນາຄານ.
 *
 * ແຕ່ລະທະນາຄານ (BCEL/LDB/JDB…) ສົ່ງອອກ CSV ຕ່າງກັນ ແລະ ພວກເຮົາຍັງບໍ່ມີໄຟລ໌ຕົວຢ່າງຈິງ, ສະນັ້ນ
 * ບໍ່ hard-code ຮູບແບບຕໍ່ທະນາຄານ: ເດົາຄໍລຳຈາກຫົວຕາຕະລາງ (ອັງກິດ + ລາວ) ແລ້ວໃຫ້ຜູ້ໃຊ້ແກ້ mapping
 * ໄດ້ໃນໜ້າຈໍກ່ອນຢືນຢັນ. mapping ທີ່ໃຊ້ຖືກເກັບໄວ້ກັບ import ເພື່ອໃຊ້ຄືນຄັ້ງຕໍ່ໄປ.
 */

/** RFC 4180 ແບບງ່າຍ: ຮອງຮັບ "quoted, fields" ແລະ "" ພາຍໃນ quote. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row.map((f) => f.trim()));
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row.map((f) => f.trim()));
  return rows;
}

function detectDelimiter(text: string): string {
  const firstLines = text.split(/\r?\n/).slice(0, 5).join('\n');
  const counts = [',', ';', '\t'].map((d) => ({ d, n: firstLines.split(d).length }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0]!.n > 1 ? counts[0]!.d : ',';
}

const ALIASES: Record<'date' | 'time' | 'description' | 'reference' | 'credit' | 'debit' | 'amount' | 'balance', string[]> = {
  date: ['date', 'transaction date', 'txn date', 'trans date', 'posting date', 'post date', 'value date', 'ວັນທີ', 'ວັນທີເຮັດທຸລະກຳ'],
  time: ['time', 'txn time', 'transaction time', 'ເວລາ'],
  description: ['description', 'details', 'detail', 'narrative', 'remark', 'remarks', 'particulars', 'memo', 'ລາຍລະອຽດ', 'ເນື້ອໃນ', 'ໝາຍເຫດ'],
  reference: ['reference', 'ref', 'ref no', 'ref.', 'reference no', 'transaction id', 'txn id', 'txn ref', 'ເລກອ້າງອີງ', 'ເລກທີ'],
  credit: ['credit', 'credits', 'deposit', 'deposits', 'cr', 'cr amount', 'money in', 'in', 'ເງິນເຂົ້າ', 'ຝາກ', 'ເຄຣດິດ'],
  debit: ['debit', 'debits', 'withdrawal', 'withdrawals', 'dr', 'dr amount', 'money out', 'out', 'ເງິນອອກ', 'ຖອນ', 'ເດບິດ'],
  amount: ['amount', 'transaction amount', 'txn amount', 'ຈຳນວນເງິນ', 'ຈຳນວນ'],
  balance: ['balance', 'running balance', 'available balance', 'ledger balance', 'ຍອດເງິນຄົງເຫຼືອ', 'ຍອດຄົງເຫຼືອ', 'ຍອດເຫຼືອ'],
};

function norm(h: string): string {
  return h.toLowerCase().replace(/[()_:*]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** ເດົາ mapping ຈາກແຖວຫົວ. null ຖ້າຫາຄໍລຳວັນທີ ຫຼື ຈຳນວນເງິນບໍ່ພົບ. */
export function detectMapping(rows: string[][]): StatementMapping | null {
  // ບາງທະນາຄານມີແຖວຂໍ້ມູນບັນຊີກ່ອນຫົວຕາຕະລາງ — ຫາແຖວຫົວໃນ 10 ແຖວທຳອິດ.
  for (let h = 0; h < Math.min(rows.length, 10); h++) {
    const headers = rows[h]!.map(norm);
    const find = (key: keyof typeof ALIASES): number | null => {
      const aliases = ALIASES[key];
      const exact = headers.findIndex((x) => aliases.includes(x));
      if (exact >= 0) return exact;
      const partial = headers.findIndex((x) => x.length > 1 && aliases.some((a) => a.length > 2 && x.includes(a)));
      return partial >= 0 ? partial : null;
    };
    const date = find('date');
    const credit = find('credit');
    const debit = find('debit');
    const amount = credit == null && debit == null ? find('amount') : null;
    if (date == null || (credit == null && debit == null && amount == null)) continue;
    const mapping: StatementMapping = {
      date,
      time: find('time'),
      description: find('description'),
      reference: find('reference'),
      credit,
      debit,
      amount,
      balance: find('balance'),
      dateFormat: guessDateFormat(rows.slice(h + 1).map((r) => r[date] ?? '')),
      hasHeader: true,
      headerRow: h,
    };
    return mapping;
  }
  return null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function guessDateFormat(samples: string[]): StatementMapping['dateFormat'] {
  let firstOver12 = false;
  let secondOver12 = false;
  for (const s of samples.slice(0, 50)) {
    const parts = s.trim().split(/[\s T]/)[0]!.split(/[/.-]/);
    if (parts.length < 3) continue;
    if (parts[0]!.length === 4) return 'YMD';
    if (Number(parts[0]) > 12) firstOver12 = true;
    if (Number(parts[1]) > 12) secondOver12 = true;
  }
  if (secondOver12 && !firstOver12) return 'MDY';
  return 'DMY';
}

/** ວັນທີ + ເວລາ (ຖ້າມີ) → { dateKey YYYY-MM-DD, postedAt ISO (UTC) | null }. ເວລາໃນໄຟລ໌ຖືເປັນເວລາວຽງຈັນ. */
export function parseStatementDate(
  raw: string,
  format: StatementMapping['dateFormat'],
  rawTime?: string,
): { date: string; postedAt: string | null } | null {
  const s = raw.trim();
  if (!s) return null;
  const [datePart, ...rest] = s.split(/[\sT]+/);
  const parts = datePart!.split(/[/.-]/);
  if (parts.length !== 3) return null;
  let y: number;
  let m: number;
  let d: number;
  const monthName = (p: string) => MONTHS[p.slice(0, 3).toLowerCase()];
  if (parts[0]!.length === 4) {
    [y, m, d] = [Number(parts[0]), Number(parts[1]), Number(parts[2])];
  } else if (format === 'MDY') {
    [m, d, y] = [Number(parts[0]), Number(parts[1]), Number(parts[2])];
  } else {
    d = Number(parts[0]);
    m = /^\d+$/.test(parts[1]!) ? Number(parts[1]) : (monthName(parts[1]!) ?? NaN);
    y = Number(parts[2]);
  }
  if (y < 100) y += 2000;
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCMonth() !== m - 1) return null;
  const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const timeStr = (rawTime?.trim() || rest.join(' ')).trim();
  const tm = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!tm) return { date, postedAt: null };
  let hh = Number(tm[1]);
  const mm = Number(tm[2]);
  const ss = Number(tm[3] ?? 0);
  const ampm = tm[4]?.toLowerCase();
  if (ampm === 'pm' && hh < 12) hh += 12;
  if (ampm === 'am' && hh === 12) hh = 0;
  if (hh > 23 || mm > 59 || ss > 59) return { date, postedAt: null };
  const utc = Date.UTC(y, m - 1, d, hh - 7, mm, ss);
  return { date, postedAt: new Date(utc).toISOString() };
}

/** "1,234,500.00" / "(5,000)" / "5,000-" / "1 000 CR" → number; null ຖ້າວ່າງ. */
export function parseAmount(raw: string | undefined): { value: number; hint: 'CR' | 'DR' | null } | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (!s || s === '-') return null;
  let hint: 'CR' | 'DR' | null = null;
  if (/\bcr\b/i.test(s)) hint = 'CR';
  if (/\bdr\b/i.test(s)) hint = 'DR';
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  s = s.replace(/[^\d.,]/g, '');
  // "1.234.567,89" (ຈຸດແບ່ງຫຼັກພັນ, ຈຸດທົດສະນິຍົມເປັນ comma)
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return { value: negative ? -n : n, hint };
}

export type ParseResult = {
  headers: string[];
  sampleRows: string[][];
  lines: StatementParsedLine[];
  errors: { row: number; message: string }[];
};

/** ແປງແຖວ CSV ເປັນແຖວ statement ຕາມ mapping. */
export function parseStatement(rows: string[][], mapping: StatementMapping): ParseResult {
  const headerRow = mapping.hasHeader ? mapping.headerRow : -1;
  const headers = headerRow >= 0 ? (rows[headerRow] ?? []) : (rows[0] ?? []).map((_, i) => `#${i + 1}`);
  const body = rows.slice(headerRow + 1);
  const lines: StatementParsedLine[] = [];
  const errors: { row: number; message: string }[] = [];
  const cell = (r: string[], i: number | null | undefined) => (i == null ? undefined : r[i]);

  body.forEach((r, idx) => {
    const rowNo = headerRow + 2 + idx; // 1-based ຕາມທີ່ເຫັນໃນ spreadsheet
    const dateCell = cell(r, mapping.date) ?? '';
    const parsedDate = parseStatementDate(dateCell, mapping.dateFormat, cell(r, mapping.time));
    let direction: 'CREDIT' | 'DEBIT' | null = null;
    let amount = 0;
    if (mapping.amount != null) {
      const a = parseAmount(cell(r, mapping.amount));
      if (a && a.value !== 0) {
        direction = a.hint === 'DR' || a.value < 0 ? 'DEBIT' : 'CREDIT';
        amount = Math.abs(a.value);
      }
    } else {
      const c = parseAmount(cell(r, mapping.credit));
      const d = parseAmount(cell(r, mapping.debit));
      if (c && Math.abs(c.value) > 0) {
        direction = 'CREDIT';
        amount = Math.abs(c.value);
      } else if (d && Math.abs(d.value) > 0) {
        direction = 'DEBIT';
        amount = Math.abs(d.value);
      }
    }
    // ແຖວສະຫຼຸບ/ຍອດຍົກມາ (ບໍ່ມີວັນທີ ຫຼື ບໍ່ມີຈຳນວນ) — ຂ້າມແບບງຽບ; ມີວັນທີແຕ່ຈຳນວນ 0 ກໍຂ້າມ.
    if (!parsedDate) {
      if (direction && errors.length < 50) errors.push({ row: rowNo, message: `ອ່ານວັນທີບໍ່ໄດ້: "${dateCell}"` });
      return;
    }
    if (!direction) return;
    const bal = parseAmount(cell(r, mapping.balance));
    lines.push({
      row: rowNo,
      date: parsedDate.date,
      postedAt: parsedDate.postedAt,
      direction,
      amount: Math.round(amount * 100) / 100,
      balance: bal ? bal.value : null,
      description: cell(r, mapping.description)?.slice(0, 500) || null,
      reference: cell(r, mapping.reference)?.slice(0, 120) || null,
    });
  });
  return { headers, sampleRows: body.slice(0, 8), lines, errors };
}
