import { Check, Download, FileJson, FileSpreadsheet, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';

import { downloadCsv, type CsvRow } from '../lib/csv';
import { EXPORT_DATASETS, getExportDataset, type CsvValue } from './exportDatasets';

type Format = 'csv' | 'json';

function stamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.json') ? filename : `${filename}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExportPanel() {
  const { t } = useTranslation();
  const [datasetId, setDatasetId] = useState(EXPORT_DATASETS[0]!.id);
  const [format, setFormat] = useState<Format>('csv');
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(EXPORT_DATASETS[0]!.fields.filter((f) => f.default).map((f) => f.key)),
  );
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [lastRun, setLastRun] = useState<{ rows: number; at: string } | null>(null);

  const dataset = getExportDataset(datasetId);

  function selectDataset(id: string) {
    setDatasetId(id);
    setLastRun(null);
    const ds = getExportDataset(id);
    setPicked(new Set(ds.fields.filter((f) => f.default).map((f) => f.key)));
  }

  function toggleField(key: string) {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const activeFields = useMemo(
    () => dataset.fields.filter((f) => picked.has(f.key)),
    [dataset, picked],
  );

  async function run() {
    if (activeFields.length === 0) {
      toast.error(t('importExport.export.pickAtLeastOne'));
      return;
    }
    setBusy(true);
    setProgress({ loaded: 0, total: 0 });
    try {
      const rows = await dataset.fetchAll((loaded, total) => setProgress({ loaded, total }));
      const label = (key: string) => t(`importExport.field.${dataset.id}.${key}`);
      const filename = `aura-${dataset.id}-${stamp()}`;

      if (format === 'csv') {
        const body: CsvRow[] = [
          activeFields.map((f) => label(f.labelKey)),
          ...rows.map((r) => activeFields.map((f) => f.pick(r) satisfies CsvValue)),
        ];
        downloadCsv(filename, body);
      } else {
        const json = rows.map((r) => {
          const o: Record<string, CsvValue> = {};
          for (const f of activeFields) o[f.key] = f.pick(r);
          return o;
        });
        downloadJson(filename, json);
      }
      setLastRun({ rows: rows.length, at: new Date().toLocaleTimeString() });
      toast.success(t('importExport.exported', { count: rows.length }));
    } catch {
      toast.error(t('importExport.export.failed'));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const pct =
    progress && progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : null;

  return (
    <div className="space-y-4">
      {/* dataset picker */}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {EXPORT_DATASETS.map(({ id, icon: Icon }) => {
          const on = id === datasetId;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => selectDataset(id)}
              className={cn(
                'relative flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                on
                  ? 'border-primary/40 bg-primary/[0.07]'
                  : 'border-border hover:border-primary/30 hover:bg-muted/50',
              )}
            >
              {on ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-primary"
                />
              ) : null}
              <Icon
                className={cn('mt-0.5 h-4 w-4 shrink-0', on ? 'text-primary' : 'text-muted-foreground')}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span
                  className={cn(
                    'block text-sm font-medium',
                    on ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {t(`importExport.dataset.${id}`)}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  {t(`importExport.datasetDesc.${id}`)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* column selection */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold text-muted-foreground">
            {t('importExport.export.columns', { count: activeFields.length })}
          </p>
          <div className="flex gap-2 text-[11px]">
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => setPicked(new Set(dataset.fields.map((f) => f.key)))}
            >
              {t('importExport.export.selectAll')}
            </button>
            <span aria-hidden="true" className="text-border">
              ·
            </span>
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => setPicked(new Set())}
            >
              {t('importExport.export.clear')}
            </button>
          </div>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {dataset.fields.map((f) => {
            const on = picked.has(f.key);
            return (
              <label
                key={f.key}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
                  on ? 'border-primary/30 bg-primary/[0.05]' : 'border-border hover:bg-muted/50',
                )}
              >
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                    on ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                  )}
                  aria-hidden="true"
                >
                  {on ? <Check className="h-3 w-3" /> : null}
                </span>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={on}
                  onChange={() => toggleField(f.key)}
                />
                <span className={cn('truncate', on ? 'text-foreground' : 'text-muted-foreground')}>
                  {t(`importExport.field.${dataset.id}.${f.labelKey}`)}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* format + action */}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <div
          className="inline-flex rounded-lg border border-border p-0.5"
          role="group"
          aria-label={t('importExport.export.format')}
        >
          {(['csv', 'json'] as Format[]).map((f) => {
            const Icon = f === 'csv' ? FileSpreadsheet : FileJson;
            return (
              <button
                key={f}
                type="button"
                aria-pressed={format === f}
                onClick={() => setFormat(f)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  format === f
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {f.toUpperCase()}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {busy ? t('importExport.export.working') : t('importExport.export.download')}
        </button>

        {lastRun ? (
          <span className="text-[11px] text-muted-foreground">
            {t('importExport.export.lastRun', { count: lastRun.rows, at: lastRun.at })}
          </span>
        ) : null}
      </div>

      {progress ? (
        <div className="space-y-1" aria-live="polite">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${pct ?? 8}%` }}
            />
          </div>
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {t('importExport.export.fetched', {
              loaded: progress.loaded,
              total: progress.total || '…',
            })}
          </p>
        </div>
      ) : null}
    </div>
  );
}
