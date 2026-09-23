import type { StatementImportPreview, StatementMapping } from '@abcp/shared-types';
import { FileSpreadsheet, RefreshCw, Trash2, TriangleAlert, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { CurrencyText } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { TONE } from '@/features/payroll/payroll.lib';
import { useConfirm } from '@/hooks/useConfirm';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { useCommitImport, useDeleteImport, useImports, usePreviewImport } from './reconciliation.api';

/** The API body limit is 2MB; the CSV travels as a JSON string. */
const MAX_CSV_CHARS = 1_400_000;

type ColumnKey = 'date' | 'time' | 'description' | 'reference' | 'credit' | 'debit' | 'amount' | 'balance';
const COLUMNS: ColumnKey[] = ['date', 'time', 'description', 'reference', 'credit', 'debit', 'amount', 'balance'];

interface Props {
  open: boolean;
  onClose: () => void;
  accounts: { id: string; label: string }[];
  defaultAccountId: string;
  /** After a successful import: widen the page to the imported dates. */
  onImported: (from: string, to: string) => void;
}

/**
 * G1 — bring the bank's own statement in as lines instead of typing daily totals.
 *
 * Banks export CSV in different shapes and no real sample files exist yet, so the server
 * guesses the columns from the header row (English + Lao) and this dialog shows that guess
 * next to the parsed rows. The reconciler can change any column before anything is
 * saved. Nothing is written until "Import"; re-importing the same file adds no duplicates.
 */
export function ReconImportDialog({ open, onClose, accounts, defaultAccountId, onImported }: Props) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [accountId, setAccountId] = useState(defaultAccountId);
  const [file, setFile] = useState<{ name: string; csv: string } | null>(null);
  const [mapping, setMapping] = useState<StatementMapping | null>(null);
  const [preview, setPreview] = useState<StatementImportPreview | null>(null);
  const previewM = usePreviewImport();
  const commit = useCommitImport();
  const del = useDeleteImport();
  const imports = useImports(open ? accountId || null : null);

  useEffect(() => {
    if (!open) return;
    setAccountId(defaultAccountId || accounts[0]?.id || '');
    setFile(null);
    setMapping(null);
    setPreview(null);
  }, [open, defaultAccountId, accounts]);

  const onError = (e: unknown) => toast.error(e instanceof NormalizedApiError ? e.message : t('common.saveError'));

  const runPreview = (f: { name: string; csv: string }, m: StatementMapping | null) => {
    if (!accountId) return;
    previewM.mutate(
      { bankAccountId: accountId, fileName: f.name, csv: f.csv, ...(m ? { mapping: m } : {}), dryRun: true },
      {
        onSuccess: (p) => {
          setPreview(p);
          setMapping(p.mapping);
        },
        onError,
      },
    );
  };

  async function pickFile(fl: File | undefined) {
    if (!fl) return;
    const csv = await readText(fl);
    if (csv.length > MAX_CSV_CHARS) {
      toast.error(t('payTreasury.fileTooLarge'));
      return;
    }
    const f = { name: fl.name, csv };
    setFile(f);
    setMapping(null);
    runPreview(f, null);
  }

  function setCol(key: ColumnKey, value: string) {
    if (!mapping) return;
    const v = value === '' ? null : Number(value);
    const next: StatementMapping = { ...mapping, [key]: v };
    // amount vs credit/debit are alternatives
    if (key === 'amount' && v != null) Object.assign(next, { credit: null, debit: null });
    if ((key === 'credit' || key === 'debit') && v != null) next.amount = null;
    setMapping(next);
  }

  function doImport() {
    if (!file || !mapping || !accountId) return;
    commit.mutate(
      { bankAccountId: accountId, fileName: file.name, csv: file.csv, mapping, dryRun: false },
      {
        onSuccess: (r) => {
          toast.success(t('payTreasury.recon.import.done', { inserted: r.inserted, matched: r.matched, unmatched: r.unmatched }));
          if (preview?.fromDate && preview.toDate) onImported(preview.fromDate, preview.toDate);
          onClose();
        },
        onError,
      },
    );
  }

  const headerOptions = (preview?.headers ?? []).map((h, i) => ({ value: String(i), label: `${i + 1}. ${h || '—'}` }));
  const newRows = preview ? preview.count - preview.duplicates : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[820px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" aria-hidden="true" />
            {t('payTreasury.recon.import.title')}
          </DialogTitle>
          <DialogDescription>{t('payTreasury.recon.import.subtitle')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="imp-account">{t('payTreasury.recon.account')}</Label>
            <Select
              id="imp-account"
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                setPreview(null);
                setFile(null);
              }}
              options={accounts.map((a) => ({ value: a.id, label: a.label }))}
            />
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              aria-label={t('payTreasury.recon.import.chooseFile')}
              onChange={(e) => {
                void pickFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Button type="button" variant="secondary" disabled={!accountId} onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1 h-4 w-4" aria-hidden="true" />
              {file ? file.name : t('payTreasury.recon.import.chooseFile')}
            </Button>
          </div>
        </div>

        {!file ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {t('payTreasury.recon.import.empty')}
          </p>
        ) : null}

        {preview && mapping ? (
          <div className="space-y-3">
            {/* summary */}
            <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <Stat label={t('payTreasury.recon.import.rows')} value={`${newRows} / ${preview.count}`} />
              <Stat label={t('payTreasury.recon.health.moneyIn')} value={<CurrencyText amount={preview.creditTotal} />} />
              <Stat label={t('payTreasury.recon.health.moneyOut')} value={<CurrencyText amount={preview.debitTotal} />} />
              <Stat
                label={t('payTreasury.recon.import.period')}
                value={preview.fromDate ? `${formatDate(preview.fromDate)} – ${formatDate(preview.toDate)}` : '—'}
              />
            </dl>
            <div className="flex flex-wrap gap-1.5 text-2xs">
              <span className={cn('rounded-full px-2 py-0.5', preview.detected ? TONE.success.chip : TONE.warning.chip)}>
                {preview.detected ? t('payTreasury.recon.import.detected') : t('payTreasury.recon.import.notDetected')}
              </span>
              {preview.duplicates > 0 ? (
                <span className={cn('rounded-full px-2 py-0.5', TONE.neutral.chip)}>
                  {t('payTreasury.recon.import.duplicates', { count: preview.duplicates })}
                </span>
              ) : null}
              {preview.lockedDates.length > 0 ? (
                <span className={cn('rounded-full px-2 py-0.5', TONE.danger.chip)}>
                  {t('payTreasury.recon.import.locked', { count: preview.lockedDates.length })}
                </span>
              ) : null}
            </div>

            {/* column mapping */}
            <fieldset className="rounded-lg border border-border p-3">
              <legend className="px-1 text-xs font-semibold">{t('payTreasury.recon.import.mapping')}</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {COLUMNS.map((k) => (
                  <div key={k} className="grid gap-1">
                    <Label htmlFor={`map-${k}`} className="text-2xs">
                      {t(`payTreasury.recon.import.col.${k}`)}
                    </Label>
                    <Select
                      id={`map-${k}`}
                      className="h-8 text-xs"
                      value={mapping[k] == null ? '' : String(mapping[k])}
                      onChange={(e) => setCol(k, e.target.value)}
                      placeholder="—"
                      options={headerOptions}
                    />
                  </div>
                ))}
                <div className="grid gap-1">
                  <Label htmlFor="map-fmt" className="text-2xs">
                    {t('payTreasury.recon.import.dateFormat')}
                  </Label>
                  <Select
                    id="map-fmt"
                    className="h-8 text-xs"
                    value={mapping.dateFormat}
                    onChange={(e) => setMapping({ ...mapping, dateFormat: e.target.value as StatementMapping['dateFormat'] })}
                    options={[
                      { value: 'DMY', label: 'DD/MM/YYYY' },
                      { value: 'MDY', label: 'MM/DD/YYYY' },
                      { value: 'YMD', label: 'YYYY-MM-DD' },
                    ]}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="map-header" className="text-2xs">
                    {t('payTreasury.recon.import.headerRow')}
                  </Label>
                  <Select
                    id="map-header"
                    className="h-8 text-xs"
                    value={String(mapping.headerRow)}
                    onChange={(e) => setMapping({ ...mapping, headerRow: Number(e.target.value) })}
                    options={Array.from({ length: 10 }, (_, i) => ({ value: String(i), label: String(i + 1) }))}
                  />
                </div>
              </div>
              <div className="mt-2 flex justify-end">
                <Button type="button" size="sm" variant="secondary" disabled={previewM.isPending} onClick={() => file && runPreview(file, mapping)}>
                  <RefreshCw className={cn('mr-1 h-3.5 w-3.5', previewM.isPending && 'animate-spin motion-reduce:animate-none')} aria-hidden="true" />
                  {t('payTreasury.recon.import.apply')}
                </Button>
              </div>
            </fieldset>

            {preview.errors.length > 0 ? (
              <div className="rounded-md border border-warning/40 bg-warning-soft/50 px-3 py-2 text-2xs">
                <p className="flex items-center gap-1 font-semibold text-warning">
                  <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('payTreasury.recon.import.errors', { count: preview.errors.length })}
                </p>
                <ul className="mt-1 max-h-20 overflow-y-auto">
                  {preview.errors.slice(0, 20).map((e) => (
                    <li key={`${e.row}-${e.message}`}>
                      {t('payTreasury.recon.import.rowN', { row: e.row })}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* parsed rows */}
            <div className="max-h-64 overflow-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/80 text-2xs text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">{t('payTreasury.recon.date')}</th>
                    <th className="px-2 py-1.5 text-left font-medium">{t('payTreasury.recon.import.col.description')}</th>
                    <th className="px-2 py-1.5 text-left font-medium">{t('payTreasury.recon.import.col.reference')}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{t('payTreasury.recon.import.col.amount')}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{t('payTreasury.recon.import.col.balance')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border tabular-nums">
                  {preview.lines.slice(0, 50).map((l) => (
                    <tr key={l.row}>
                      <td className="whitespace-nowrap px-2 py-1">{formatDate(l.date)}</td>
                      <td className="max-w-[220px] truncate px-2 py-1">{l.description ?? '—'}</td>
                      <td className="max-w-[140px] truncate px-2 py-1 font-mono text-2xs">{l.reference ?? '—'}</td>
                      <td className={cn('whitespace-nowrap px-2 py-1 text-right font-semibold', l.direction === 'CREDIT' ? 'text-success' : 'text-foreground/80')}>
                        {l.direction === 'CREDIT' ? '+' : '−'}
                        <CurrencyText amount={l.amount} />
                      </td>
                      <td className="whitespace-nowrap px-2 py-1 text-right text-muted-foreground">
                        {l.balance != null ? <CurrencyText amount={l.balance} /> : '—'}
                      </td>
                    </tr>
                  ))}
                  {preview.lines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-2 py-4 text-center text-muted-foreground">
                        {t('payTreasury.recon.import.noRows')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {/* previous imports */}
        {(imports.data?.length ?? 0) > 0 ? (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground">{t('payTreasury.recon.import.previous')}</h3>
            <ul className="mt-1 divide-y divide-border rounded-lg border border-border text-xs">
              {imports.data!.slice(0, 5).map((im) => (
                <li key={im.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{im.fileName}</span>
                    <span className="text-2xs text-muted-foreground">
                      {formatDate(im.fromDate)} – {formatDate(im.toDate)} · {t('payTreasury.recon.import.rowsN', { count: im.rowCount })} ·{' '}
                      {im.importedByName ?? '—'} · {formatDateTime(im.createdAt)}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    aria-label={t('payTreasury.recon.import.undo', { name: im.fileName })}
                    disabled={del.isPending}
                    onClick={async () => {
                      const ok = await confirm({
                        title: t('payTreasury.recon.import.undoTitle'),
                        description: t('payTreasury.recon.import.undoBody', { name: im.fileName }),
                        confirmLabel: t('payTreasury.recon.import.undoConfirm'),
                        destructive: true,
                      });
                      if (ok) del.mutate(im.id, { onSuccess: () => toast.success(t('payTreasury.recon.import.undone')), onError });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" disabled={!preview || newRows <= 0 || commit.isPending || previewM.isPending} onClick={doImport}>
            <Upload className="mr-1 h-4 w-4" aria-hidden="true" />
            {t('payTreasury.recon.import.confirm', { count: Math.max(0, newRows) })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** FileReader rather than File.text() — works in every browser and in jsdom. */
function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(new Error('read-failed'));
    r.readAsText(file, 'utf-8');
  });
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md bg-muted/50 px-2.5 py-1.5">
      <dt className="text-2xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
