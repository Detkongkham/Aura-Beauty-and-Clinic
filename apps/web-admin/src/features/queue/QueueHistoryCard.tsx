import { CircleCheckBig, Download, Undo2, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CurrencyText } from '@/components/shared/CurrencyText';
import { DateTimeText } from '@/components/shared/DateTimeText';
import { Button } from '@/components/ui/button';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { downloadCsv } from '@/features/reports/lib/csv';
import type { QueueTicket } from '@/types/models';

import { QueueSearchField } from './QueueSearchField';
import { TicketTags } from './TicketTags';
import { completedWait, serviceMinutes, ticketMatches } from './queue.lib';

interface Props {
  completed: QueueTicket[];
  cancelled: QueueTicket[];
  canManage: boolean;
  pendingId?: string;
  fmtWait: (m: number) => string;
  onOpenDetail: (tk: QueueTicket) => void;
  onRestore: (tk: QueueTicket) => void;
}

type Tab = 'completed' | 'cancelled';

/** Today's closed tickets — completed (with wait/service time + revenue) and cancelled (with reason). */
export function QueueHistoryCard({
  completed,
  cancelled,
  canManage,
  pendingId,
  fmtWait,
  onOpenDetail,
  onRestore,
}: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('completed');
  const [query, setQuery] = useState('');
  const q = useDebounce(query.trim().toLowerCase(), 200);

  const source = tab === 'completed' ? completed : cancelled;
  const rows = useMemo(() => source.filter((tk) => ticketMatches(tk, q)), [source, q]);
  const revenue = completed.reduce((s, tk) => s + (tk.servicePrice ?? 0), 0);

  const exportCsv = () => {
    const header =
      tab === 'completed'
        ? ['Ticket', 'Customer', 'Phone', 'Service', 'Staff', 'Branch', 'Issued', 'Called', 'Started', 'Completed', 'Wait (min)', 'Service (min)', 'Price']
        : ['Ticket', 'Customer', 'Phone', 'Service', 'Staff', 'Branch', 'Issued', 'Cancelled', 'Reason'];
    const body = source.map((tk) =>
      tab === 'completed'
        ? [
            tk.number, tk.customerName, tk.customerPhone, tk.serviceName, tk.staffName, tk.branchName,
            formatTime(tk.issuedAt), tk.calledAt ? formatTime(tk.calledAt) : '',
            tk.startedAt ? formatTime(tk.startedAt) : '', tk.completedAt ? formatTime(tk.completedAt) : '',
            completedWait(tk), serviceMinutes(tk), tk.servicePrice,
          ]
        : [
            tk.number, tk.customerName, tk.customerPhone, tk.serviceName, tk.staffName, tk.branchName,
            formatTime(tk.issuedAt), tk.cancelledAt ? formatTime(tk.cancelledAt) : '', tk.cancelReason,
          ],
    );
    downloadCsv(`queue-${tab}-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div role="tablist" aria-label={t('queue.historyTitle')} className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
          {(
            [
              { key: 'completed', icon: CircleCheckBig, label: t('queue.completedTitle'), n: completed.length },
              { key: 'cancelled', icon: XCircle, label: t('queue.cancelledTitle'), n: cancelled.length },
            ] as const
          ).map((x) => {
            const Icon = x.icon;
            const active = tab === x.key;
            return (
              <button
                key={x.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(x.key)}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors duration-150',
                  active ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon
                  className={cn('h-3.5 w-3.5', active && (x.key === 'completed' ? 'text-success' : 'text-destructive'))}
                  aria-hidden="true"
                />
                {x.label}
                <span className="rounded-full bg-muted px-1.5 text-2xs tabular-nums">{x.n}</span>
              </button>
            );
          })}
        </div>

        {tab === 'completed' && revenue > 0 ? (
          <span className="text-xs text-muted-foreground">
            {t('queue.serviceValue')}{' '}
            <CurrencyText amount={revenue} className="font-semibold text-foreground" />
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <QueueSearchField
            value={query}
            onChange={setQuery}
            placeholder={t('queue.searchCompletedPlaceholder')}
            className="w-56"
          />
          <Button variant="secondary" size="sm" className="h-9" onClick={exportCsv} disabled={source.length === 0}>
            <Download className="h-4 w-4" aria-hidden="true" />
            CSV
          </Button>
        </div>
      </header>

      {source.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          {tab === 'completed' ? t('queue.completedEmpty') : t('queue.cancelledEmpty')}
        </p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t('queue.noMatch')}</p>
      ) : (
        <div className="max-h-[26rem] overflow-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 z-10 bg-card text-left text-2xs text-muted-foreground shadow-[0_1px_0_hsl(var(--border))]">
              <tr>
                <th className="px-4 py-2 font-medium">{t('queue.ticketNo')}</th>
                <th className="px-2 py-2 font-medium">{t('appointments.customer')}</th>
                <th className="px-2 py-2 font-medium">{t('appointments.service')}</th>
                <th className="px-2 py-2 font-medium">{t('appointments.staff')}</th>
                {tab === 'completed' ? (
                  <>
                    <th className="px-2 py-2 text-right font-medium">{t('queue.waitTime')}</th>
                    <th className="px-2 py-2 text-right font-medium">{t('queue.serviceTime')}</th>
                    <th className="px-2 py-2 text-right font-medium">{t('queue.timeRange')}</th>
                  </>
                ) : (
                  <>
                    <th className="px-2 py-2 font-medium">{t('queue.cancelReason')}</th>
                    <th className="px-2 py-2 text-right font-medium">{t('queue.cancelledAt')}</th>
                  </>
                )}
                <th className="w-12 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((tk) => {
                const wait = completedWait(tk);
                const svc = serviceMinutes(tk);
                return (
                  <tr
                    key={tk.id}
                    onClick={() => onOpenDetail(tk)}
                    className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          'rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums',
                          tab === 'completed' ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground line-through',
                        )}
                      >
                        {tk.number}
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <p className="max-w-[200px] truncate font-medium">{tk.customerName}</p>
                      <TicketTags ticket={tk} className="mt-0.5" />
                    </td>
                    <td className="px-2 py-2.5">
                      <p className="max-w-[200px] truncate">{tk.serviceName}</p>
                      {tab === 'completed' && tk.servicePrice ? (
                        <CurrencyText amount={tk.servicePrice} className="text-2xs text-muted-foreground" />
                      ) : null}
                    </td>
                    <td className="max-w-[160px] truncate px-2 py-2.5 text-muted-foreground">
                      {tk.staffName ?? t('queue.anyStaff')}
                    </td>
                    {tab === 'completed' ? (
                      <>
                        <td className="px-2 py-2.5 text-right tabular-nums">{wait != null ? fmtWait(wait) : '–'}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">
                          {svc != null ? (
                            <span
                              className={cn(
                                tk.serviceDurationMin && svc > tk.serviceDurationMin * 1.2 && 'font-semibold text-warning',
                              )}
                            >
                              {fmtWait(svc)}
                            </span>
                          ) : (
                            '–'
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right text-2xs tabular-nums text-muted-foreground">
                          <DateTimeText value={tk.issuedAt} mode="time" /> →{' '}
                          <DateTimeText value={tk.completedAt ?? tk.calledAt} mode="time" />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-2 py-2.5">
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-2xs font-medium',
                              tk.cancelReason === 'NO_SHOW' ? 'bg-destructive-soft text-destructive' : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {t(`queue.reason.${tk.cancelReason ?? 'OTHER'}`)}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-right text-2xs tabular-nums text-muted-foreground">
                          <DateTimeText value={tk.cancelledAt} mode="time" />
                        </td>
                      </>
                    )}
                    <td className="px-4 py-2.5 text-right">
                      {tab === 'cancelled' && canManage && tk.cancelReason !== 'EXPIRED' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          disabled={pendingId === tk.id}
                          aria-label={t('queue.restore')}
                          title={t('queue.restore')}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRestore(tk);
                          }}
                        >
                          <Undo2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
