/**
 * Small RFC-4180 CSV parser — handles quoted fields, escaped `""` quotes,
 * embedded commas / newlines, a leading UTF-8 BOM, and CRLF or LF line ends.
 * Deliberately dependency-free; the reports feature only ever imports a few
 * hundred rows of hand-kept data, so a streaming parser would be overkill.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      // swallow CRLF as one break
      if (text[i + 1] === '\n') i += 1;
      pushRow();
      i += 1;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // trailing field / row (unless the file ended on a clean newline)
  if (field !== '' || row.length > 0) pushRow();

  // drop fully-empty trailing rows
  return rows.filter((r) => r.length > 1 || (r[0] ?? '').trim() !== '');
}

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

/** Split a parsed CSV into a header row + body, trimming header cells. */
export function toTable(cells: string[][]): ParsedTable {
  if (cells.length === 0) return { headers: [], rows: [] };
  const [head, ...body] = cells;
  return { headers: head!.map((h) => h.trim()), rows: body };
}

/** Normalise a header for fuzzy matching: lowercase, strip non-alphanumerics. */
export function normaliseKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}
