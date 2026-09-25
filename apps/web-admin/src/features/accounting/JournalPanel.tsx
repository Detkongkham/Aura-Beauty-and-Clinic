import { Download, Scale } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { EmptyState } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { accountingApi, useJournal } from './accounting.api';
import { Section } from './accounting.parts';

const fmt = (n: number) => (n ? n.toLocaleString() : '');

/** Double-entry journal for the period: trial balance + entry list + CSV export for the accountant. */
export function JournalPanel({ branchId, from, to }: { branchId: string; from: string; to: string }) {
  const { t } = useTranslation();
  const q = useJournal({ branchId, from, to });
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  async function exportCsv() {
    setBusy(true);
    try {
      const blob = await accountingApi.journalCsv({ branchId, from, to });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `journal_${from}_${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('accounting.journal.exportError'));
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (q.isError || !q.data) return <EmptyState icon={Scale} title={t('accounting.journal.error')} />;
  const j = q.data;
  const entries = showAll ? j.entries : j.entries.slice(-100);

  return (
    <div className="space-y-4">
      <Section
        title={t('accounting.journal.trialBalance')}
        description={t('accounting.journal.subtitle', { count: j.entries.length })}
        action={
          <div className="flex items-center gap-2">
            <Badge variant={j.balanced ? 'success' : 'danger'}>
              {j.balanced ? t('accounting.journal.balanced') : t('accounting.journal.unbalanced')}
            </Badge>
            <Button variant="secondary" size="sm" onClick={exportCsv} disabled={busy || j.entries.length === 0}>
              <Download className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('accounting.journal.exportCsv')}
            </Button>
          </div>
        }
      >
        {j.totals.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('accounting.journal.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{t('accounting.journal.account')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t('accounting.journal.debit')}</th>
                  <th className="py-2 text-right font-medium">{t('accounting.journal.credit')}</th>
                </tr>
              </thead>
              <tbody>
                {j.totals.map((r) => (
                  <tr key={r.account} className="border-b border-border/50">
                    <td className="py-1.5 pr-3">
                      <span className="mr-2 font-mono text-xs text-muted-foreground">{r.account}</span>
                      {r.accountName}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(r.debit)}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmt(r.credit)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 pr-3">{t('accounting.journal.total')}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{j.debitTotal.toLocaleString()}</td>
                  <td className="py-2 text-right tabular-nums">{j.creditTotal.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {j.entries.length > 0 ? (
        <Section title={t('accounting.journal.entries')} description={t('accounting.journal.entriesHint')}>
          <div className="space-y-2">
            {entries.map((e, i) => (
              <div key={`${e.date}-${e.ref}-${i}`} className="rounded-lg border border-border/70 p-2.5">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">{e.date}</span>
                  <Badge variant="primary">{t(`accounting.source.${e.source}`)}</Badge>
                  <span className="font-mono">{e.ref}</span>
                  <span className="truncate">· {e.branchName}</span>
                </div>
                <div className="mb-1 text-sm text-foreground">{e.memo}</div>
                {e.lines.map((l, k) => (
                  <div key={k} className="grid grid-cols-[1fr_auto_auto] gap-3 text-xs">
                    <span className={l.credit ? 'pl-5' : ''}>
                      <span className="mr-1.5 font-mono text-muted-foreground">{l.account}</span>
                      {l.accountName}
                    </span>
                    <span className="w-24 text-right tabular-nums">{fmt(l.debit)}</span>
                    <span className="w-24 text-right tabular-nums">{fmt(l.credit)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {!showAll && j.entries.length > 100 ? (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll(true)}>
              {t('accounting.journal.showAll', { count: j.entries.length })}
            </Button>
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}
