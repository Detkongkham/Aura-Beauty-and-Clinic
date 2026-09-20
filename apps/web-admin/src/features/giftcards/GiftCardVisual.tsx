import { Gift } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CurrencyText } from '@/components/shared';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { CardCurrency, CardState } from './giftCardModel';

interface GiftCardVisualProps {
  code: string;
  balance: number;
  initialBalance?: number;
  currency?: CardCurrency;
  recipient?: string | null;
  branchName?: string | null;
  expireDate?: string | null;
  state?: CardState;
  className?: string;
}

/**
 * Physical-card rendering of a gift card (credit-card ratio, brand gradient, soft
 * light blooms). Spent/expired/void cards desaturate so state reads at a glance even
 * before the badge is noticed. Used by the detail sheet and the issue dialog preview.
 */
export function GiftCardVisual({
  code,
  balance,
  initialBalance,
  currency = 'LAK',
  recipient,
  branchName,
  expireDate,
  state = 'active',
  className,
}: GiftCardVisualProps) {
  const { t } = useTranslation();
  const muted = state === 'redeemed' || state === 'expired' || state === 'void';

  return (
    <div
      className={cn(
        'relative isolate aspect-[1.586] w-full overflow-hidden rounded-2xl p-4 text-white shadow-lg sm:p-5',
        'bg-gradient-to-br from-primary via-primary/85 to-accent',
        'transition-[filter] duration-300',
        muted && 'grayscale-[0.85]',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="absolute -right-10 -top-12 -z-10 h-40 w-40 rounded-full bg-white/15 blur-2xl"
      />
      <span
        aria-hidden="true"
        className="absolute -bottom-16 -left-8 -z-10 h-44 w-44 rounded-full bg-black/10 blur-2xl"
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.12)_1px,transparent_0)] [background-size:14px_14px]"
      />

      <div className="flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-white/80">{t('giftCards.visual.brand')}</p>
            {branchName ? <p className="truncate text-2xs text-white/65">{branchName}</p> : null}
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
            <Gift className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>

        <div>
          <p className="text-2xs text-white/70">{t('giftCards.col.balance')}</p>
          <p className="text-2xl font-semibold leading-tight tabular-nums sm:text-[28px]">
            <CurrencyText amount={balance} currency={currency} />
          </p>
          {initialBalance != null && initialBalance !== balance ? (
            <p className="text-2xs text-white/70">
              {t('giftCards.visual.of')} <CurrencyText amount={initialBalance} currency={currency} />
            </p>
          ) : null}
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-mono text-sm font-medium tracking-wider">{code}</p>
            {recipient ? <p className="truncate text-2xs text-white/75">{recipient}</p> : null}
          </div>
          {expireDate ? (
            <div className="shrink-0 text-right">
              <p className="text-2xs text-white/70">{t('giftCards.col.expires')}</p>
              <p className="text-xs font-medium tabular-nums">{formatDate(expireDate)}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
