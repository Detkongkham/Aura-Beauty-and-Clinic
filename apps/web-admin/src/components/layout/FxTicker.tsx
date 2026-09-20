import type { Currency } from '@abcp/shared-types';
import { ArrowLeftRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useFxRates } from '@/features/fx/fx.api';
import { useSettings } from '@/features/settings/settings.api';
import { formatRelative } from '@/lib/format';
import { CCY_GLYPH, formatCrossRate } from '@/lib/fx';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';

/**
 * Compact live exchange-rate readout in the Topbar — shows on every page since
 * Topbar is mounted once in AppShell. Pairs USD against the configured display
 * currency (falls back to LAK when the display currency is USD itself), and
 * shares the same `['fx-rates']` query the Settings ▸ Exchange rates panel
 * uses, so it's already warm/cached, not an extra network hit.
 *
 * The status dot carries three states — live (green), stale/fallback (amber),
 * refreshing (pulsing) — and the tooltip spells out which one, because a
 * coloured dot alone is not an accessible status (MASTER.md §10).
 */
export function FxTicker() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('en') ? 'en' : 'lo';
  const { data: settings } = useSettings();
  const refreshMinutes = settings?.fxRefreshMinutes ?? 30;
  const { data: rates, isFetching } = useFxRates(refreshMinutes);

  if (!rates) return null;

  const quote: Currency =
    settings?.displayCurrency && settings.displayCurrency !== 'USD'
      ? settings.displayCurrency
      : 'LAK';
  const isLive = rates.source === 'live';
  const state = isFetching ? t('common.loading') : isLive ? t('queue.live') : t('settings.fx.fallback');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={`${ROUTES.settings}#sec-fx`}
          aria-label={`${CCY_GLYPH.USD}1 ≈ ${formatCrossRate('USD', quote, rates)} ${quote} · ${state}`}
          className={cn(
            'group hidden h-8 shrink-0 items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 pl-1 pr-2.5',
            'transition-all duration-150 ease-out lg:inline-flex',
            'hover:-translate-y-px hover:border-primary/30 hover:bg-card hover:shadow-sm motion-reduce:hover:translate-y-0',
          )}
        >
          <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary transition-colors group-hover:bg-primary/20">
            <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
            <span
              aria-hidden="true"
              className={cn(
                'absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-card',
                isFetching ? 'animate-pulse bg-accent' : isLive ? 'bg-success' : 'bg-warning',
              )}
            />
          </span>
          <span className="flex items-baseline gap-1 text-xs tabular-nums">
            <span className="text-muted-foreground">{CCY_GLYPH.USD}1</span>
            <span className="text-muted-foreground/70">≈</span>
            <span className="font-semibold text-foreground">{formatCrossRate('USD', quote, rates)}</span>
            <span className="hidden font-medium text-muted-foreground xl:inline">{quote}</span>
          </span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[16rem]">
        <span className="block font-semibold">{state}</span>
        {t('settings.fx.updated', { time: formatRelative(rates.asOf, locale) })}
      </TooltipContent>
    </Tooltip>
  );
}
