import type { TFunction } from 'i18next';
import { STOCK_AGING_BUCKETS, type AbcView } from '@abcp/shared-types';

import type { CsvRow } from '../lib/csv';
import type { CategoryGroupRow } from './InventoryReportExtras';

/** 9C — CSV sections for the category-grouped inventory reports and the ABC report. */
type Kind = 'valuation' | 'turnover' | 'aging';
const catName = (t: TFunction, g: CategoryGroupRow) =>
  g.categoryName ?? t('reports.inv.uncategorized');

export function categoryGroupsCsv(
  kind: Kind,
  groups: CategoryGroupRow[] | undefined,
  t: TFunction,
): CsvRow[] {
  if (!groups?.length) return [];
  if (kind === 'valuation') {
    return [
      [
        t('reports.inv.category'),
        t('reports.inv.products'),
        t('reports.inv.qty'),
        t('reports.inv.value'),
      ],
      ...groups.map((g): CsvRow => [catName(t, g), g.products ?? 0, g.qty ?? 0, g.value ?? 0]),
      [],
    ];
  }
  if (kind === 'turnover') {
    return [
      [
        t('reports.inv.category'),
        t('reports.fin.cogs'),
        t('reports.inv.avgValue'),
        t('reports.inv.turnover'),
        t('reports.inv.daysOnHand'),
      ],
      ...groups.map((g): CsvRow => [
        catName(t, g),
        g.cogs ?? 0,
        g.avgValue ?? 0,
        g.turnover ?? 0,
        g.daysOnHand ?? '',
      ]),
      [],
    ];
  }
  return [
    [
      t('reports.inv.category'),
      ...STOCK_AGING_BUCKETS.map((b) => t('reports.inv.bucketDays', { range: b })),
      t('reports.inv.value'),
    ],
    ...groups.map((g): CsvRow => [
      catName(t, g),
      ...STOCK_AGING_BUCKETS.map((b) => g.byBucket?.[b] ?? 0),
      g.value ?? 0,
    ]),
    [],
  ];
}

export function abcCsv(d: AbcView, t: TFunction): CsvRow[] {
  return [
    [t('reports.inv.abcBasis'), t(`reports.inv.basis.${d.basis}`)],
    [t('reports.inv.abcThresholdsLabel'), `A ≤ ${d.thresholds.a}%`, `B ≤ ${d.thresholds.b}%`],
    [],
    [
      t('reports.inv.abc'),
      t('reports.inv.products'),
      t('reports.inv.value'),
      t('reports.inv.share'),
    ],
    ...d.classes.map((c): CsvRow => [c.abcClass, c.products, c.value, `${c.sharePct}%`]),
    [],
    [
      t('reports.inv.product'),
      t('reports.inv.sku'),
      t('reports.col.branch'),
      t('reports.inv.category'),
      t('reports.inv.abc'),
      t('reports.inv.value'),
      t('reports.inv.share'),
      t('reports.inv.cumulative'),
    ],
    ...d.rows.map((r): CsvRow => [
      r.productName,
      r.sku,
      r.branchName,
      r.categoryName ?? '',
      r.abcClass,
      r.value,
      `${r.sharePct}%`,
      `${r.cumulativePct}%`,
    ]),
  ];
}
