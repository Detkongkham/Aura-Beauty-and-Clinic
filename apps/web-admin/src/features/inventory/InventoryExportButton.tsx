import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { downloadCsv, type CsvRow } from '@/features/reports/lib/csv';
import { downloadXlsx } from '@/features/reports/lib/xlsx';
import { NormalizedApiError } from '@/services/apiError';

import { fetchInventoryExport } from './inventory.api';

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => CsvRow[number];
}

interface InventoryExportButtonProps<T> {
  base: Parameters<typeof fetchInventoryExport>[0] | '/retail-sales';
  /** The page's current filters — the export returns every matching row, not just the visible page. */
  params: Record<string, unknown>;
  filename: string;
  columns: ExportColumn<T>[];
  label?: string;
}

/**
 * M15 — CSV + Excel (.xlsx, dependency-free writer) export for inventory lists. Fetches `<base>/export` (all filtered rows, capped server-side)
 * and downloads through the shared reports CSV helper (BOM-prefixed so Excel shows Lao correctly).
 */
export function InventoryExportButton<T>({ base, params, filename, columns, label }: InventoryExportButtonProps<T>) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<'csv' | 'xlsx' | null>(null);

  async function run(format: 'csv' | 'xlsx') {
    setBusy(format);
    try {
      const res = await fetchInventoryExport<T>(base, params);
      const stamp = new Date().toISOString().slice(0, 10);
      const rows: CsvRow[] = [columns.map((c) => c.header), ...res.items.map((row) => columns.map((c) => c.value(row)))];
      if (format === 'xlsx') downloadXlsx(`${filename}-${stamp}`, rows, filename);
      else downloadCsv(`${filename}-${stamp}`, rows);
      if (res.truncated) {
        toast.warning(t('inventory.export.truncated', { shown: res.items.length, total: res.total }));
      } else {
        toast.success(t('inventory.export.done', { count: res.items.length }));
      }
    } catch (err) {
      toast.error(err instanceof NormalizedApiError ? err.message : t('inventory.export.failed'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button type="button" variant="secondary" size="sm" className="h-8 gap-1.5" onClick={() => void run('csv')} disabled={busy != null}>
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        {busy === 'csv' ? t('inventory.export.busy') : (label ?? t('inventory.export.csv'))}
      </Button>
      <Button type="button" variant="secondary" size="sm" className="h-8 gap-1.5" onClick={() => void run('xlsx')} disabled={busy != null}>
        <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
        {busy === 'xlsx' ? t('inventory.export.busy') : t('inventory.export.xlsx')}
      </Button>
    </div>
  );
}
