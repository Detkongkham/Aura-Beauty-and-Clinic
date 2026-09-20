import { useTranslation } from 'react-i18next';

import { useFxRates } from '@/features/fx/fx.api';
import { useSettings } from '@/features/settings/settings.api';
import { formatCurrency } from '@/lib/format';
import { convertAmount } from '@/lib/fx';
import { cn } from '@/lib/utils';

interface CurrencyTextProps {
  amount: number | null | undefined;
  currency?: 'LAK' | 'THB' | 'USD';
  className?: string;
}

/**
 * Right-aligned, tabular currency (design.md §9).
 *
 * When Settings ▸ Exchange rates has "auto-convert" on and this amount's
 * native `currency` differs from the configured display currency, shows the
 * live-converted figure (prefixed `≈`) with the original amount in a title
 * tooltip — otherwise renders exactly as before (no query, no behaviour
 * change) so every existing call site stays byte-identical by default.
 */
export function CurrencyText({ amount, currency = 'LAK', className }: CurrencyTextProps) {
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  const autoConvert = Boolean(settings?.autoConvertCurrency);
  const displayCurrency = settings?.displayCurrency ?? 'LAK';
  const needsConversion = autoConvert && currency !== displayCurrency;

  // Only subscribes to the live-rate feed once conversion is actually needed.
  const { data: rates } = useFxRates(settings?.fxRefreshMinutes ?? 30, { enabled: needsConversion });

  if (!needsConversion || amount == null || Number.isNaN(amount) || !rates) {
    return (
      <span className={cn('tabular tabular-nums', className)}>{formatCurrency(amount, currency)}</span>
    );
  }

  const converted = convertAmount(amount, currency, displayCurrency, rates);
  return (
    <span
      className={cn('tabular tabular-nums', className)}
      title={`${formatCurrency(amount, currency)} · ${t('settings.fx.liveRateTooltip')}`}
    >
      ≈ {formatCurrency(converted, displayCurrency)}
    </span>
  );
}
