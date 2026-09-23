import type { ReconciliationStatus } from '@abcp/shared-types';
import { useTranslation } from 'react-i18next';

import { CurrencyText } from '@/components/shared';
import { TONE } from '@/features/payroll/payroll.lib';
import { cn } from '@/lib/utils';

import { STATUS_ICON, STATUS_TONE } from './reconciliation.lib';

/**
 * Signed money. The sign glyph and (for zero) the word carry the meaning, so
 * colour only backs it up: `+` = the bank shows more than the system booked,
 * `−` = the bank shows less.
 */
export function SignedAmount({
  value,
  currency = 'LAK',
  className,
  zeroLabel,
}: {
  value: number | null;
  currency?: string;
  className?: string;
  zeroLabel?: string;
}) {
  const { t } = useTranslation();
  if (value === null) return <span className={cn('text-muted-foreground', className)}>—</span>;
  if (Math.abs(value) < 0.005)
    return <span className={cn('text-muted-foreground', className)}>{zeroLabel ?? t('payTreasury.recon.none')}</span>;
  return (
    <span className={cn('whitespace-nowrap font-semibold', value > 0 ? 'text-info' : 'text-destructive', className)}>
      {value > 0 ? '+' : '−'}
      <CurrencyText amount={Math.abs(value)} currency={currency as 'LAK'} />
    </span>
  );
}

/** Status pill: dot + icon + word, never colour alone. */
export function ReconStatusPill({ status, className }: { status: ReconciliationStatus; className?: string }) {
  const { t } = useTranslation();
  const tone = TONE[STATUS_TONE[status]];
  const Icon = STATUS_ICON[status];
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-medium', tone.chip, className)}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {t(`payTreasury.recon.status.${status}`)}
    </span>
  );
}

/** Two-line "in / out" money cell used by the ledger. */
export function InOutCell({
  credit,
  debit,
  currency,
  render,
}: {
  credit: number | null;
  debit: number | null;
  currency: string;
  render?: (v: number | null) => React.ReactNode;
}) {
  const { t } = useTranslation();
  const show = render ?? ((v: number | null) => (v === null ? <span className="text-muted-foreground">—</span> : <CurrencyText amount={v} currency={currency as 'LAK'} />));
  return (
    <div className="space-y-0.5 text-right text-sm tabular-nums">
      <div className="flex items-baseline justify-end gap-1.5 whitespace-nowrap">
        <span className="text-2xs text-muted-foreground">{t('payTreasury.recon.in')}</span>
        {show(credit)}
      </div>
      <div className="flex items-baseline justify-end gap-1.5 whitespace-nowrap text-muted-foreground">
        <span className="text-2xs">{t('payTreasury.recon.out')}</span>
        <span className="text-foreground/80">{show(debit)}</span>
      </div>
    </div>
  );
}
