import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Columns3,
  FileDown,
  FileUp,
  ListChecks,
  Loader2,
  Sparkles,
  UploadCloud,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Select } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { customersApi } from '@/features/customers/customers.api';
import type { Customer } from '@/types/models';
import { cn } from '@/lib/utils';

import { downloadCsv, type CsvRow } from '../lib/csv';
import { LedgerTable } from '../components/LedgerTable';
import { ReportStatCard, type StatTone } from '../components/ReportStatCard';
import {
  autoMap,
  buildReview,
  CUSTOMER_IMPORT_FIELDS,
  CUSTOMER_TEMPLATE_HEADERS,
  CUSTOMER_TEMPLATE_SAMPLE,
  toCreatePayload,
  type ColumnMap,
  type ReviewRow,
  type RowStatus,
} from './importSpec';
import { parseCsv, toTable } from './parseCsv';

type Step = 'upload' | 'map' | 'review' | 'done';
const STEPS: { id: Step; icon: LucideIcon }[] = [
  { id: 'upload', icon: FileUp },
  { id: 'map', icon: Columns3 },
  { id: 'review', icon: ListChecks },
  { id: 'done', icon: CheckCircle2 },
];

interface RunResult {
  created: number;
  skipped: number;
  failed: { line: number; name: string; phone: string; reason: string }[];
}

const STATUS_STYLE: Record<RowStatus, { dot: string; text: string; key: string }> = {
  new: { dot: 'bg-success', text: 'text-success', key: 'importExport.status.new' },
  duplicate: { dot: 'bg-warning', text: 'text-warning', key: 'importExport.status.duplicate' },
  error: { dot: 'bg-destructive', text: 'text-destructive', key: 'importExport.status.error' },
};

export function ImportPanel() {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [raw, setRaw] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [headers, setHeaders] = useState<string[]>([]);
  const [body, setBody] = useState<string[][]>([]);
  const [map, setMap] = useState<ColumnMap>({});

  const [loadingExisting, setLoadingExisting] = useState(false);
  const [review, setReview] = useState<ReviewRow[]>([]);
  const [mode, setMode] = useState<'skip' | 'all'>('skip');

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState(0);
  const [result, setResult] = useState<RunResult | null>(null);

  function ingest(text: string, name: string | null) {
    const table = toTable(parseCsv(text));
    if (table.headers.length === 0 || table.rows.length === 0) {
      toast.error(t('importExport.import.emptyFile'));
      return;
    }
    setRaw(text);
    setFileName(name);
    setHeaders(table.headers);
    setBody(table.rows);
    setMap(autoMap(table.headers));
    setStep('map');
  }

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => ingest(String(reader.result ?? ''), file.name);
    reader.readAsText(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  function downloadTemplate() {
    downloadCsv('aura-customers-template', [
      CUSTOMER_TEMPLATE_HEADERS,
      ...CUSTOMER_TEMPLATE_SAMPLE,
    ]);
  }

  const requiredUnmapped = CUSTOMER_IMPORT_FIELDS.filter(
    (f) => f.required && map[f.key] == null,
  );

  async function goToReview() {
    setLoadingExisting(true);
    try {
      const existing: Pick<Customer, 'phone'>[] = [];
      const first = await customersApi.list({ page: 1, pageSize: 100 });
      existing.push(...first.items.map((c) => ({ phone: c.phone })));
      const pages = Math.ceil(first.total / 100);
      for (let p = 2; p <= pages; p += 1) {
        const next = await customersApi.list({ page: p, pageSize: 100 });
        existing.push(...next.items.map((c) => ({ phone: c.phone })));
      }
      setReview(buildReview({ rows: body, map, existing, t }));
      setStep('review');
    } catch {
      toast.error(t('importExport.import.loadExistingFailed'));
    } finally {
      setLoadingExisting(false);
    }
  }

  const counts = useMemo(() => {
    const c = { new: 0, duplicate: 0, error: 0 };
    for (const r of review) c[r.status] += 1;
    return c;
  }, [review]);

  const importable = useMemo(
    () => review.filter((r) => r.status === 'new' || (r.status === 'duplicate' && mode === 'all')),
    [review, mode],
  );

  async function runImport() {
    setConfirmOpen(false);
    setRunning(true);
    setRunProgress(0);
    // Skipped = rows we never attempt: always the error rows, plus duplicates when in "skip" mode.
    const skipped = counts.error + (mode === 'skip' ? counts.duplicate : 0);
    const res: RunResult = { created: 0, skipped, failed: [] };
    for (let i = 0; i < importable.length; i += 1) {
      const row = importable[i]!;
      try {
        await customersApi.create(toCreatePayload(row));
        res.created += 1;
      } catch {
        res.failed.push({
          line: row.line,
          name: row.values.name,
          phone: row.values.phone,
          reason: t('importExport.err.createFailed'),
        });
      }
      setRunProgress(Math.round(((i + 1) / importable.length) * 100));
    }
    setResult(res);
    setRunning(false);
    setStep('done');
    toast.success(t('importExport.imported', { count: res.created }));
  }

  function downloadErrors() {
    if (!result) return;
    const rows: CsvRow[] = [
      [t('importExport.review.line'), t('importExport.field.customers.name'), t('importExport.field.customers.phone'), t('importExport.review.reason')],
      ...result.failed.map((f): CsvRow => [f.line, f.name, f.phone, f.reason]),
    ];
    downloadCsv('aura-customers-import-errors', rows);
  }

  function reset() {
    setStep('upload');
    setRaw('');
    setFileName(null);
    setHeaders([]);
    setBody([]);
    setMap({});
    setReview([]);
    setResult(null);
    setRunProgress(0);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
      {/* step rail */}
      <nav
        aria-label={t('importExport.import.steps')}
        className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0"
      >
        {STEPS.map(({ id, icon: Icon }, i) => {
          const on = step === id;
          const done = STEPS.findIndex((x) => x.id === step) > i;
          return (
            <div
              key={id}
              aria-current={on ? 'step' : undefined}
              className={cn(
                'relative flex shrink-0 items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors lg:items-start',
                on
                  ? 'border-primary/40 bg-primary/[0.07]'
                  : done
                    ? 'border-border bg-muted/40'
                    : 'border-border opacity-60',
              )}
            >
              {on ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-2 left-0 hidden w-0.5 rounded-r-full bg-primary lg:block"
                />
              ) : null}
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums',
                  on
                    ? 'bg-primary text-primary-foreground'
                    : done
                      ? 'bg-success text-white'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {done ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    'flex items-center gap-1.5 text-sm font-medium',
                    on ? 'text-primary' : 'text-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 lg:hidden" aria-hidden="true" />
                  {t(`importExport.step.${id}`)}
                </span>
                <span className="mt-0.5 hidden text-[11px] leading-snug text-muted-foreground lg:block">
                  {t(`importExport.stepDesc.${id}`)}
                </span>
              </span>
            </div>
          );
        })}
      </nav>

      {/* step body */}
      <div className="min-w-0 space-y-4">
        {step === 'upload' ? (
          <div className="space-y-3">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={cn(
                'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
                dragOver ? 'border-primary bg-primary/[0.06]' : 'border-border',
              )}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UploadCloud className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="text-sm font-medium text-foreground">
                {t('importExport.import.dropTitle')}
              </p>
              <p className="text-[11px] text-muted-foreground">{t('importExport.import.dropHint')}</p>
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
                >
                  <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('importExport.import.chooseFile')}
                </button>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('importExport.import.template')}
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                  e.target.value = '';
                }}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="import-paste"
                className="text-[11px] font-semibold text-muted-foreground"
              >
                {t('importExport.import.pasteLabel')}
              </label>
              <textarea
                id="import-paste"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                rows={4}
                placeholder={'name,phone,email\nDara Vong,2028810001,dara@mail.test'}
                className="w-full rounded-lg border border-input bg-card p-2.5 font-mono text-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
              <button
                type="button"
                disabled={!raw.trim()}
                onClick={() => ingest(raw, null)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                {t('importExport.import.parsePaste')}
              </button>
            </div>
          </div>
        ) : null}

        {step === 'map' ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {t('importExport.map.intro', { file: fileName ?? t('importExport.map.pasted'), rows: body.length })}
            </p>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted text-[11px] font-semibold text-foreground">
                    <th className="px-3 py-2 text-left">{t('importExport.map.targetField')}</th>
                    <th className="px-3 py-2 text-left">{t('importExport.map.sourceColumn')}</th>
                    <th className="px-3 py-2 text-left">{t('importExport.map.sample')}</th>
                  </tr>
                </thead>
                <tbody>
                  {CUSTOMER_IMPORT_FIELDS.map((f) => {
                    const col = map[f.key];
                    const sample = col == null ? '' : (body[0]?.[col] ?? '');
                    return (
                      <tr key={f.key} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">
                          <span className="font-medium text-foreground">
                            {t(`importExport.field.customers.${f.labelKey}`)}
                          </span>
                          {f.required ? (
                            <span className="ml-1 text-destructive" title={t('importExport.map.required')}>
                              *
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            className="h-8 min-w-[160px] text-xs"
                            value={col == null ? '' : String(col)}
                            onChange={(e) =>
                              setMap((m) => ({
                                ...m,
                                [f.key]: e.target.value === '' ? null : Number(e.target.value),
                              }))
                            }
                            options={[
                              { value: '', label: t('importExport.map.notMapped') },
                              ...headers.map((h, i) => ({ value: String(i), label: h })),
                            ]}
                          />
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-2 text-xs text-muted-foreground" title={sample}>
                          {sample || '–'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {requiredUnmapped.length > 0 ? (
              <p className="flex items-center gap-1.5 text-[11px] text-destructive" role="alert">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                {t('importExport.map.missingRequired', {
                  fields: requiredUnmapped
                    .map((f) => t(`importExport.field.customers.${f.labelKey}`))
                    .join(', '),
                })}
              </p>
            ) : null}

            <div className="flex items-center gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={reset}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {t('importExport.back')}
              </button>
              <button
                type="button"
                disabled={requiredUnmapped.length > 0 || loadingExisting}
                onClick={() => void goToReview()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
              >
                {loadingExisting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : null}
                {t('importExport.map.continue')}
              </button>
            </div>
          </div>
        ) : null}

        {step === 'review' ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label={t('importExport.review.total')} value={review.length} icon={ListChecks} tone="primary" index={0} />
              <Stat label={t('importExport.status.new')} value={counts.new} icon={Sparkles} tone="success" index={1} />
              <Stat label={t('importExport.status.duplicate')} value={counts.duplicate} icon={CircleSlash} tone="accent" index={2} />
              <Stat label={t('importExport.status.error')} value={counts.error} icon={AlertTriangle} tone="violet" index={3} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground">
                {t('importExport.review.dupMode')}
              </span>
              <div className="inline-flex rounded-lg border border-border p-0.5" role="group">
                {(['skip', 'all'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => setMode(m)}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                      mode === m
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t(`importExport.review.mode.${m}`)}
                  </button>
                ))}
              </div>
            </div>

            <LedgerTable
              rows={review}
              rowKey={(r) => String(r.line)}
              columns={[
                { key: 'line', label: t('importExport.review.line'), align: 'right', width: '56px', render: (r) => <span className="tabular-nums text-muted-foreground">{r.line}</span> },
                { key: 'name', label: t('importExport.field.customers.name'), render: (r) => <span className="font-medium">{r.values.name || '–'}</span>, sortValue: (r) => r.values.name },
                { key: 'phone', label: t('importExport.field.customers.phone'), render: (r) => <span className="tabular-nums">{r.values.phone || '–'}</span> },
                {
                  key: 'status',
                  label: t('importExport.review.status'),
                  render: (r) => {
                    const s = STATUS_STYLE[r.status];
                    return (
                      <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', s.text)}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} aria-hidden="true" />
                        {t(s.key)}
                      </span>
                    );
                  },
                  sortValue: (r) => r.status,
                },
                {
                  key: 'detail',
                  label: t('importExport.review.detail'),
                  render: (r) =>
                    r.errors.length > 0 ? (
                      <span className="text-xs text-destructive">{r.errors.join('; ')}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">–</span>
                    ),
                },
              ]}
              total={[
                '',
                t('importExport.review.willImport', { count: importable.length }),
                '',
                '',
                '',
              ]}
            />

            {running ? (
              <div className="space-y-1" aria-live="polite">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${runProgress}%` }} />
                </div>
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  {t('importExport.review.importing', { pct: runProgress })}
                </p>
              </div>
            ) : null}

            <div className="flex items-center gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setStep('map')}
                disabled={running}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                {t('importExport.back')}
              </button>
              <button
                type="button"
                disabled={running || importable.length === 0}
                onClick={() => setConfirmOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
              >
                {running ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                  <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {t('importExport.review.run', { count: importable.length })}
              </button>
            </div>
          </div>
        ) : null}

        {step === 'done' && result ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label={t('importExport.done.created')} value={result.created} icon={CheckCircle2} tone="success" index={0} />
              <Stat label={t('importExport.done.skipped')} value={result.skipped} icon={CircleSlash} tone="accent" index={1} />
              <Stat label={t('importExport.done.failed')} value={result.failed.length} icon={AlertTriangle} tone="violet" index={2} />
            </div>

            {result.failed.length > 0 ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive-soft/40 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('importExport.done.failedRows', { count: result.failed.length })}
                </p>
                <button
                  type="button"
                  onClick={downloadErrors}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('importExport.done.downloadErrors')}
                </button>
              </div>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-success">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {t('importExport.done.allGood')}
              </p>
            )}

            <div className="border-t border-border pt-4">
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                {t('importExport.done.again')}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={t('importExport.confirm.title')}
        description={t('importExport.confirm.body', { count: importable.length })}
        confirmLabel={t('importExport.confirm.ok')}
        busy={running}
        onConfirm={() => void runImport()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
  index,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: StatTone;
  index: number;
}) {
  return (
    <ReportStatCard
      label={label}
      value={value}
      icon={<Icon className="h-4 w-4" aria-hidden="true" />}
      tone={tone}
      index={index}
    />
  );
}
