import { Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PoMatchStatusValue } from '@abcp/shared-types';

import { CurrencyText, StatusPill } from '@/components/shared';
import type { BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { usePoMatch } from './inventory.api';

const MATCH_VARIANT: Record<PoMatchStatusValue, NonNullable<BadgeProps['variant']>> = {
  MATCHED: 'success',
  UNDER_RECEIVED: 'warning',
  OVER_INVOICED: 'danger',
  NO_INVOICE: 'neutral',
};

/** H4 — 3-way match: ordered ↔ received (GRN) ↔ invoiced (PO-linked expenses), net of debit notes. */
export function PoMatchPanel({ poId }: { poId: string }) {
  const { t } = useTranslation();
  const { data: m, isLoading } = usePoMatch(poId);
  if (isLoading || !m) return <div className="h-[92px] animate-pulse rounded-xl border border-border bg-muted/30" />;

  const tiles = [
    { label: t('inventory.match.ordered'), value: m.ordered },
    { label: t('inventory.match.received'), value: m.received },
    { label: t('inventory.match.returned'), value: m.returned },
    { label: t('inventory.match.invoiced'), value: m.invoiced },
  ];

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Scale className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('inventory.match.title')}
        </p>
        <StatusPill status={m.status} variant={MATCH_VARIANT[m.status]} label={t(`inventory.match.st.${m.status}`)} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((x) => (
          <div key={x.label} className="rounded-lg border border-border bg-card px-2.5 py-2">
            <p className="text-2xs text-muted-foreground">{x.label}</p>
            <CurrencyText amount={x.value} className="text-sm font-semibold" />
          </div>
        ))}
      </div>
      {m.status !== 'NO_INVOICE' ? (
        <p className="text-xs text-muted-foreground">
          {t('inventory.match.summary', { tol: m.tolerancePct })}{' '}
          <CurrencyText amount={m.expected} className="font-medium text-foreground" /> ·{' '}
          {t('inventory.match.variance')}{' '}
          <CurrencyText
            amount={m.variance}
            className={cn('font-medium', m.variance > 0 ? 'text-destructive' : 'text-foreground')}
          />
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{t('inventory.match.noInvoiceHint')}</p>
      )}
      {m.invoices.length ? (
        <ul className="divide-y divide-border/60 text-xs">
          {m.invoices.map((i) => (
            <li key={i.expenseId} className="flex items-center justify-between gap-2 py-1.5">
              <span className="min-w-0 truncate">
                {i.invoiceNumber ?? i.title} <span className="text-muted-foreground">· {i.status}</span>
              </span>
              <CurrencyText amount={i.amountBase} />
            </li>
          ))}
          {m.debitNotes.map((d) => (
            <li key={d.supplierReturnId} className="flex items-center justify-between gap-2 py-1.5 text-muted-foreground">
              <span className="min-w-0 truncate">
                {t('inventory.match.debitNote')} {d.returnNumber}
              </span>
              <CurrencyText amount={-d.value} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
