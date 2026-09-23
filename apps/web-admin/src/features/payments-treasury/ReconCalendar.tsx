import type { ReconciliationStatus } from '@abcp/shared-types';
import { CalendarDays, Minus } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { formatCompactNumber, formatDate } from '@/lib/format';
import { TONE } from '@/features/payroll/payroll.lib';
import { SectionCard } from '@/features/payroll/payroll.parts';
import { cn } from '@/lib/utils';

import { RECON_STATUSES, STATUS_ICON, STATUS_TONE, enumerateDays, weekdayShort, type AccountStats } from './reconciliation.lib';
import { todayKey } from './treasury.lib';

interface Props {
  from: string;
  to: string;
  accounts: AccountStats[];
  statusFilter: ReconciliationStatus | '';
  canManage: boolean;
  onOpen: (bankAccountId: string, date: string) => void;
}

/**
 * Account × day matrix. One glance shows *which account* on *which day* is
 * still open, which a flat ledger hides once there is more than one account.
 * Every cell prints a glyph (✓ / ≠ / ◌) as well as its tint, and is a real
 * button with a spoken label, so the grid works without colour or a mouse.
 * Empty days are still clickable for managers: a quiet day can still have a
 * bank fee on the statement.
 */
export function ReconCalendar({ from, to, accounts, statusFilter, canManage, onOpen }: Props) {
  const { t, i18n } = useTranslation();
  const days = useMemo(() => enumerateDays(from, to).reverse(), [from, to]);
  const today = todayKey();

  return (
    <SectionCard
      icon={CalendarDays}
      title={t('payTreasury.recon.calendarTitle')}
      meta={t('payTreasury.recon.calendarMeta', { accounts: accounts.length, days: days.length })}
      action={<Legend />}
      bodyClassName="p-0"
    >
      {accounts.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t('payTreasury.recon.noAccounts')}</p>
      ) : (
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-10 min-w-[180px] border-b border-r border-border bg-card px-3 py-2 text-left text-2xs font-medium text-muted-foreground"
                >
                  {t('payTreasury.recon.account')}
                </th>
                {days.map((d) => {
                  const isToday = d === today;
                  const monthStart = d.endsWith('-01');
                  return (
                    <th
                      key={d}
                      scope="col"
                      className={cn(
                        'border-b border-border px-0.5 py-1.5 text-center font-normal',
                        monthStart && 'border-l border-l-border',
                      )}
                    >
                      <span className="block text-[10px] leading-none text-muted-foreground">{weekdayShort(d, i18n.language).slice(0, 2)}</span>
                      <span
                        className={cn(
                          'mx-auto mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] tabular-nums',
                          isToday ? 'bg-primary font-semibold text-primary-foreground' : 'text-foreground',
                        )}
                      >
                        {Number(d.slice(8))}
                      </span>
                    </th>
                  );
                })}
                <th scope="col" className="border-b border-l border-border px-3 py-2 text-right text-2xs font-medium text-muted-foreground">
                  {t('payTreasury.recon.calendarOpen')}
                </th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.bankAccountId} className="group">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-r border-border bg-card px-3 py-1.5 text-left font-normal group-hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-primary/10 px-1 text-[10px] font-bold text-primary">{a.bankCode}</span>
                      <span className="min-w-0">
                        <span className="block max-w-[140px] truncate font-medium">{a.accountName}</span>
                        <span className="block max-w-[140px] truncate text-2xs text-muted-foreground">{a.branchName}</span>
                      </span>
                    </div>
                  </th>
                  {days.map((d) => {
                    const r = a.byDate.get(d);
                    const status = r?.status ?? null;
                    const dim = statusFilter !== '' && status !== statusFilter;
                    const Icon = status ? STATUS_ICON[status] : Minus;
                    const clickable = Boolean(r) || canManage;
                    const label = [
                      formatDate(d),
                      a.accountName,
                      status ? t(`payTreasury.recon.status.${status}`) : t('payTreasury.recon.noActivity'),
                      r && r.systemCredit > 0 ? `${t('payTreasury.recon.in')} ${formatCompactNumber(r.systemCredit)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <td key={d} className={cn('border-b border-border px-0.5 py-1 text-center', d.endsWith('-01') && 'border-l border-l-border')}>
                        <button
                          type="button"
                          disabled={!clickable}
                          onClick={() => onOpen(a.bankAccountId, d)}
                          aria-label={label}
                          title={label}
                          className={cn(
                            'mx-auto flex h-7 w-7 items-center justify-center rounded-md transition-[transform,opacity] duration-150',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                            status
                              ? cn(TONE[STATUS_TONE[status]].chip, 'hover:scale-110 motion-reduce:hover:scale-100')
                              : 'border border-dashed border-border text-muted-foreground/50 enabled:hover:border-primary/40 enabled:hover:text-primary',
                            dim && 'opacity-25',
                            !clickable && 'cursor-default',
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </td>
                    );
                  })}
                  <td className="border-b border-l border-border px-3 text-right tabular-nums">
                    {a.variance + a.unreconciled > 0 ? (
                      <span className="inline-flex items-center gap-1.5">
                        {a.variance > 0 ? <span className={cn('rounded px-1 font-semibold', TONE.danger.chip)}>≠ {a.variance}</span> : null}
                        {a.unreconciled > 0 ? <span className={cn('rounded px-1 font-semibold', TONE.warning.chip)}>◌ {a.unreconciled}</span> : null}
                      </span>
                    ) : (
                      <span className="text-success">✓</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function Legend() {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
      {RECON_STATUSES.map((s) => {
        const Icon = STATUS_ICON[s];
        return (
          <li key={s} className="inline-flex items-center gap-1">
            <span className={cn('flex h-4 w-4 items-center justify-center rounded', TONE[STATUS_TONE[s]].chip)}>
              <Icon className="h-2.5 w-2.5" aria-hidden="true" />
            </span>
            {t(`payTreasury.recon.status.${s}`)}
          </li>
        );
      })}
      <li className="inline-flex items-center gap-1">
        <span className="flex h-4 w-4 items-center justify-center rounded border border-dashed border-border">
          <Minus className="h-2.5 w-2.5" aria-hidden="true" />
        </span>
        {t('payTreasury.recon.noActivity')}
      </li>
    </ul>
  );
}
