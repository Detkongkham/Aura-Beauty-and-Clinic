import type { Currency } from '@abcp/shared-types';
import { ArrowRightLeft, Clock, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useFxRates, useRefreshFxRates } from '@/features/fx/fx.api';
import { formatRelative } from '@/lib/format';
import { CCY_GLYPH, convertAmount, formatCrossRate, FX_ATTRIBUTION_URL } from '@/lib/fx';
import { cn } from '@/lib/utils';

const CROSS_PAIRS: [Currency, Currency][] = [
  ['USD', 'LAK'],
  ['USD', 'THB'],
  ['THB', 'LAK'],
];

const CCY_OPTIONS = [
  { value: 'LAK', label: 'LAK ₭' },
  { value: 'THB', label: 'THB ฿' },
  { value: 'USD', label: 'USD $' },
];

interface ExchangeRatesPanelProps {
  refreshMinutes: number;
}

const CCY_TONE: Record<Currency, string> = {
  USD: 'bg-primary/15 text-primary',
  LAK: 'bg-accent-soft text-accent-foreground',
  THB: 'bg-info-soft text-info',
};

/** Small round currency-glyph chip — same visual language across the ticker and this panel. */
function CcyChip({ currency }: { currency: Currency }) {
  return (
    <span
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
        CCY_TONE[currency],
      )}
    >
      {CCY_GLYPH[currency]}
    </span>
  );
}

/**
 * Live world-market exchange rates (source: exchangerate-api.com, USD-base
 * mid-rates) with a self-refreshing feed, a manual refresh, and a small
 * interactive converter so the numbers are visibly real, not decorative.
 */
export function ExchangeRatesPanel({ refreshMinutes }: ExchangeRatesPanelProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('en') ? 'en' : 'lo';
  const { data: rates, isFetching } = useFxRates(refreshMinutes);
  const refresh = useRefreshFxRates();

  const [amount, setAmount] = useState('100');
  const [from, setFrom] = useState<Currency>('USD');
  const [to, setTo] = useState<Currency>('LAK');

  const parsedAmount = Number(amount);
  const converted =
    rates && Number.isFinite(parsedAmount) ? convertAmount(parsedAmount, from, to, rates) : null;

  const freshness =
    rates?.source === 'live'
      ? { variant: 'success' as const, label: t('settings.fx.live'), icon: Wifi }
      : rates?.source === 'cache'
        ? { variant: 'warning' as const, label: t('settings.fx.cached'), icon: Clock }
        : { variant: 'danger' as const, label: t('settings.fx.fallback'), icon: WifiOff };

  return (
    <div className="space-y-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {rates ? (
            <Badge variant={freshness.variant}>
              <freshness.icon className="h-3 w-3" aria-hidden="true" />
              {freshness.label}
            </Badge>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {rates
              ? t('settings.fx.updated', { time: formatRelative(rates.asOf, locale) })
              : t('common.loading')}
          </span>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => refresh()}
          disabled={isFetching}
        >
          <RefreshCw className={isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} aria-hidden="true" />
          {t('settings.fx.refreshNow')}
        </Button>
      </div>

      {rates ? (
        <div className="grid gap-2 sm:grid-cols-3">
          {CROSS_PAIRS.map(([a, b]) => (
            <div
              key={`${a}-${b}`}
              className="flex items-center gap-2 rounded-lg border border-border bg-gradient-to-br from-primary-subtle/40 to-card px-3 py-2.5"
            >
              <CcyChip currency={a} />
              <ArrowRightLeft className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
              <CcyChip currency={b} />
              <span className="ml-auto text-right text-sm font-semibold tabular-nums text-foreground">
                {formatCrossRate(a, b, rates)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary">
            <ArrowRightLeft className="h-3 w-3" aria-hidden="true" />
          </span>
          {t('settings.fx.converter')}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex gap-2">
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label={t('settings.fx.amount')}
              className="w-28"
            />
            <Select
              aria-label={t('settings.fx.from')}
              value={from}
              onChange={(e) => setFrom(e.target.value as Currency)}
              options={CCY_OPTIONS}
              className="w-24"
            />
          </div>
          <ArrowRightLeft className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:mb-2.5 sm:block" aria-hidden="true" />
          <Select
            aria-label={t('settings.fx.to')}
            value={to}
            onChange={(e) => setTo(e.target.value as Currency)}
            options={CCY_OPTIONS}
            className="w-24"
          />
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-sm border border-input bg-card px-3">
            <CcyChip currency={to} />
            <span className="truncate text-base font-semibold tabular-nums text-primary">
              {converted != null
                ? new Intl.NumberFormat('en-US', {
                    maximumFractionDigits: to === 'LAK' ? 0 : 2,
                  }).format(converted)
                : '—'}
            </span>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {t('settings.fx.attribution')}{' '}
        <a
          href={FX_ATTRIBUTION_URL}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          exchangerate-api.com
        </a>
        {' · '}
        {t('settings.fx.autoRefreshNote', { minutes: refreshMinutes })}
      </p>
    </div>
  );
}
