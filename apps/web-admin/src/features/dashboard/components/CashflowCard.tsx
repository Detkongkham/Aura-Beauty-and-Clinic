import { ArrowDownLeft, ArrowUpRight, Banknote, PiggyBank, ReceiptText } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CurrencyText } from '@/components/shared/CurrencyText';
import { cn } from '@/lib/utils';
import type { DashboardStats } from '@/types/models';

/**
 * Money that moved today (collected + deposits) on top, the period P&L as a
 * revenue-vs-expenses split bar with the net and margin, and the all-time
 * receivables still owed at the bottom as a warning row.
 */
export function CashflowCard({ data }: { data: DashboardStats }) {
  const { t } = useTranslation();
  const { revenue, expenses } = data.period;
  const net = revenue - expenses;
  const margin = revenue > 0 ? Math.round((net / revenue) * 100) : 0;
  const scale = Math.max(revenue, expenses, 1);
  const days = data.periodDays;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <Tile
          icon={<Banknote className="h-3.5 w-3.5" aria-hidden="true" />}
          label={t('dashboard.cash.collectedToday')}
          amount={data.collectedToday}
          tone="success"
        />
        <Tile
          icon={<PiggyBank className="h-3.5 w-3.5" aria-hidden="true" />}
          label={t('dashboard.cash.depositsToday')}
          amount={data.depositsToday}
          tone="info"
        />
      </div>

      <div className="space-y-2.5">
        <p className="text-xs font-medium text-muted-foreground">
          {t('dashboard.periodLabel', { days })}
        </p>
        <Bar
          label={t('dashboard.cash.revenue')}
          icon={<ArrowDownLeft className="h-3 w-3" aria-hidden="true" />}
          amount={revenue}
          pct={(revenue / scale) * 100}
          className="bg-success"
        />
        <Bar
          label={t('dashboard.cash.expenses')}
          icon={<ArrowUpRight className="h-3 w-3" aria-hidden="true" />}
          amount={expenses}
          pct={(expenses / scale) * 100}
          className="bg-destructive/80"
        />
        <div className="flex items-end justify-between gap-2 border-t border-dashed border-border pt-2.5">
          <div>
            <p className="text-xs text-muted-foreground">{t('dashboard.cash.net')}</p>
            <CurrencyText
              amount={net}
              className={cn(
                'text-lg font-semibold',
                net < 0 ? 'text-destructive' : 'text-foreground',
              )}
            />
          </div>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
              margin >= 0 ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive',
            )}
          >
            {t('dashboard.cash.margin', { pct: margin })}
          </span>
        </div>
      </div>

      <div
        className={cn(
          'mt-auto flex items-center gap-3 rounded-xl border px-3 py-2.5',
          data.attention.outstandingBalance > 0
            ? 'border-warning/30 bg-warning/[0.07]'
            : 'border-border bg-muted/30',
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
          <ReceiptText className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{t('dashboard.cash.outstanding')}</p>
          <p className="truncate text-xs text-muted-foreground">
            {t('dashboard.cash.outstandingHint', { count: data.attention.unpaidBills })}
          </p>
        </div>
        <CurrencyText
          amount={data.attention.outstandingBalance}
          className="text-sm font-semibold"
        />
      </div>
    </div>
  );
}

function Tile({
  icon,
  label,
  amount,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  amount: number;
  tone: 'success' | 'info';
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-2.5">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-md',
            tone === 'success' ? 'bg-success-soft text-success' : 'bg-info-soft text-info',
          )}
        >
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </p>
      <CurrencyText amount={amount} className="mt-1 block truncate text-base font-semibold" />
    </div>
  );
}

function Bar({
  label,
  icon,
  amount,
  pct,
  className,
}: {
  label: string;
  icon: React.ReactNode;
  amount: number;
  pct: number;
  className: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          {icon}
          {label}
        </span>
        <CurrencyText amount={amount} className="font-medium" />
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-[width] duration-500 ease-out', className)}
          style={{ width: `${amount > 0 ? Math.max(pct, 2) : 0}%` }}
        />
      </div>
    </div>
  );
}
