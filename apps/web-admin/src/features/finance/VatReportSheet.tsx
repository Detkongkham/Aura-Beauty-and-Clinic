import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAuth } from '@/features/auth/useAuth';
import { downloadCsv } from '@/features/reports/lib/csv';
import { formatCurrency } from '@/lib/format';
import { NormalizedApiError } from '@/services/apiError';

import type { VatSettings } from '@abcp/shared-types';

import { useSaveVatSettings, useVatReport, useVatSettings } from './finance.api';

/** Wave 10B — ລາຍງານ VAT ປະຈຳເດືອນ (ພາສີຂາອອກ − ໃບຄືນເງິນ) + ຕັ້ງຄ່າ VAT (SUPER_ADMIN). */
export function VatReportSheet({ open, branchId, onClose }: { open: boolean; branchId: string | 'all'; onClose: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuper = user?.role === 'SUPER_ADMIN';
  const months = useMemo(() => {
    const now = new Date(Date.now() + 7 * 3_600_000);
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    });
  }, []);
  const [month, setMonth] = useState(months[0]!);
  const report = useVatReport({ month, branchId }, open);
  const vat = useVatSettings(open);
  const save = useSaveVatSettings();
  const [ratePct, setRatePct] = useState<string | null>(null);
  const d = report.data;
  const m = (n: number) => formatCurrency(n, 'LAK');

  function saveVat(patch: Partial<VatSettings>) {
    if (!vat.data) return;
    save.mutate(
      { ...vat.data, ...patch },
      {
        onSuccess: () => toast.success(t('finance.vat.saved')),
        onError: (e) => toast.error(e instanceof NormalizedApiError ? e.message : t('common.saveError')),
      },
    );
  }

  function exportCsv() {
    if (!d) return;
    downloadCsv(`vat-${d.month}`, [
      [t('finance.vat.date'), t('finance.vat.invoices'), t('finance.vat.gross'), t('finance.vat.net'), t('finance.vat.outputTax'), t('finance.vat.creditNotes'), t('finance.vat.creditTax')],
      ...d.days.map((x) => [x.date, x.invoices, x.gross, x.net, x.tax, x.creditNotes, x.creditTax]),
      [t('finance.vat.total'), d.invoices, d.gross, d.net, d.outputTax, d.creditNotes, d.creditTax],
    ]);
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="gap-0 p-0">
        <SheetHeader className="pr-10">
          <SheetTitle>{t('finance.vat.title')}</SheetTitle>
          <SheetDescription>{t('finance.vat.subtitle')}</SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-5 py-5">
          <div className="flex items-center gap-2">
            <Select
              className="w-[140px]"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              options={months.map((x) => ({ value: x, label: x }))}
              aria-label={t('finance.vat.month')}
            />
            <Button variant="secondary" onClick={exportCsv} disabled={!d}>
              <Download className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('common.export')}
            </Button>
          </div>

          {vat.data ? (
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <label className="flex items-center justify-between gap-3">
                <span>{t('finance.vat.enabled')}</span>
                <Switch checked={vat.data.enabled} disabled={!isSuper || save.isPending} onCheckedChange={(v) => saveVat({ enabled: v })} />
              </label>
              <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>{t('finance.vat.rate')}</span>
                <Input
                  className="h-8 w-20 text-right"
                  inputMode="decimal"
                  disabled={!isSuper}
                  value={ratePct ?? String(Math.round(vat.data.rate * 1000) / 10)}
                  onChange={(e) => setRatePct(e.target.value)}
                  onBlur={() => {
                    if (ratePct == null) return;
                    const n = Number(ratePct);
                    if (n >= 0 && n <= 50) saveVat({ rate: n / 100 });
                    setRatePct(null);
                  }}
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>{t('finance.vat.mode')}</span>
                <Select
                  className="h-8 w-[160px]"
                  value={vat.data.mode}
                  disabled={!isSuper || save.isPending}
                  onChange={(e) => saveVat({ mode: e.target.value as VatSettings['mode'] })}
                  options={[
                    { value: 'INCLUSIVE', label: t('finance.vat.modeInclusive') },
                    { value: 'EXCLUSIVE', label: t('finance.vat.modeExclusive') },
                  ]}
                  aria-label={t('finance.vat.mode')}
                />
              </label>
              <p className="text-2xs text-muted-foreground">
                {vat.data.mode === 'EXCLUSIVE' ? t('finance.vat.exclusiveHint') : t('finance.vat.inclusiveHint')}
              </p>
            </div>
          ) : null}

          {report.isLoading || !d ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Kpi label={t('finance.vat.invoices')} value={String(d.invoices)} />
                <Kpi label={t('finance.vat.gross')} value={m(d.gross)} />
                <Kpi label={t('finance.vat.outputTax')} value={m(d.outputTax)} />
                <Kpi label={t('finance.vat.creditTax')} value={`−${m(d.creditTax)}`} />
                <Kpi label={t('finance.vat.netPayable')} value={m(d.netTaxPayable)} strong />
                <Kpi label={t('finance.vat.creditNotes')} value={String(d.creditNotes)} />
              </div>
              {d.invoicesWithoutTax > 0 ? (
                <p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
                  {t('finance.vat.untaxedWarn', { count: d.invoicesWithoutTax })}
                </p>
              ) : null}
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">{t('finance.vat.date')}</th>
                      <th className="px-3 py-1.5 text-right font-medium">{t('finance.vat.net')}</th>
                      <th className="px-3 py-1.5 text-right font-medium">{t('finance.vat.outputTax')}</th>
                      <th className="px-3 py-1.5 text-right font-medium">{t('finance.vat.creditTax')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.days.map((x) => (
                      <tr key={x.date} className="border-t">
                        <td className="px-3 py-1.5">{x.date}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{m(x.net)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{m(x.tax)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{x.creditTax ? `−${m(x.creditTax)}` : '—'}</td>
                      </tr>
                    ))}
                    {d.days.length === 0 ? (
                      <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">{t('finance.vat.empty')}</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function Kpi({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border p-2.5">
      <p className="text-2xs text-muted-foreground">{label}</p>
      <p className={strong ? 'text-base font-semibold' : 'text-sm font-medium'}>{value}</p>
    </div>
  );
}
