export type SplitRow = { branchId: string; percent: string };

/** Sum check for a split template (empty = no split). */
export function splitValid(rows: SplitRow[]): boolean {
  if (rows.length === 0) return true;
  const ids = rows.map((r) => r.branchId);
  const sum = rows.reduce((s, r) => s + (Number(r.percent) || 0), 0);
  return ids.every(Boolean) && new Set(ids).size === ids.length && Math.abs(sum - 100) < 0.01;
}
