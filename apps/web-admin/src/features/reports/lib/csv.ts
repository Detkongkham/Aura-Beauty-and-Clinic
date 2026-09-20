/** Minimal client-side CSV export — quotes every cell, BOM-prefixed for Excel + Lao. */
export type CsvRow = Array<string | number | null | undefined>;

export function toCsv(rows: CsvRow[]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const v = cell == null ? '' : String(cell);
          return `"${v.replace(/"/g, '""')}"`;
        })
        .join(','),
    )
    .join('\r\n');
}

export function downloadCsv(filename: string, rows: CsvRow[]): void {
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
