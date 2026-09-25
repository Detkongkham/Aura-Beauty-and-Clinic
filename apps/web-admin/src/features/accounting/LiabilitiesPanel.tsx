import { Coins, Gift, HandCoins, Package, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CurrencyText } from '@/components/shared';
import { CardCount } from '@/components/shared/CardCount';
import { Skeleton } from '@/components/ui/skeleton';

import { useLiabilities } from './accounting.api';
import { Row, Section } from './accounting.parts';

/** Contract liabilities (IFRS 15) still owed to customers/staff + what was recognised in the period. */
export function LiabilitiesPanel({ branchId, from, to }: { branchId: string; from: string; to: string }) {
  const { t } = useTranslation();
  const q = useLiabilities({ branchId, from, to });
  const v = q.data;
  if (q.isLoading || !v) return <Skeleton className="h-64 w-full rounded-xl" />;

  const cards = [
    { icon: <Wallet className="h-4 w-4" />, label: t('accounting.liab.deposits'), value: v.customerDeposits.amount },
    { icon: <Gift className="h-4 w-4" />, label: t('accounting.liab.giftCards'), value: v.giftCards.amount },
    { icon: <Package className="h-4 w-4" />, label: t('accounting.liab.packages'), value: v.packages.amount },
    { icon: <Coins className="h-4 w-4" />, label: t('accounting.liab.points'), value: v.loyaltyPoints.amount },
    { icon: <HandCoins className="h-4 w-4" />, label: t('accounting.liab.tips'), value: v.tipsPayable.amount },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {cards.map((c, i) => (
          <CardCount key={c.label} index={i} icon={c.icon} label={c.label} value={<CurrencyText amount={c.value} />} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('accounting.liab.title')} description={t('accounting.liab.subtitle')}>
          <Row
            label={t('accounting.liab.deposits')}
            hint={t('accounting.liab.depositsHint', { count: v.customerDeposits.bills })}
            value={<CurrencyText amount={v.customerDeposits.amount} />}
          />
          <Row
            label={t('accounting.liab.giftCards')}
            hint={t('accounting.liab.giftCardsHint', { count: v.giftCards.cards, amount: v.giftCards.expiringIn30Days.toLocaleString() })}
            value={<CurrencyText amount={v.giftCards.amount} />}
          />
          <Row
            label={t('accounting.liab.packages')}
            hint={t('accounting.liab.packagesHint', { count: v.packages.packages, sessions: v.packages.sessions })}
            value={<CurrencyText amount={v.packages.amount} />}
          />
          <Row
            label={t('accounting.liab.points')}
            hint={t('accounting.liab.pointsHint', {
              points: v.loyaltyPoints.points.toLocaleString(),
              value: v.loyaltyPoints.pointValueLak.toLocaleString(),
              expiring: v.loyaltyPoints.expiringIn30Days.toLocaleString(),
            })}
            value={<CurrencyText amount={v.loyaltyPoints.amount} />}
          />
          <Row
            label={t('accounting.liab.tips')}
            hint={t('accounting.liab.tipsHint', { count: v.tipsPayable.staff })}
            value={<CurrencyText amount={v.tipsPayable.amount} />}
          />
          <Row strong label={t('accounting.liab.total')} value={<CurrencyText amount={v.total} />} />
        </Section>
        <Section title={t('accounting.recognized.title')} description={t('accounting.recognized.subtitle', { from: v.from, to: v.to })}>
          <Row label={t('accounting.recognized.fees')} value={<CurrencyText amount={v.recognized.cancellationFees} />} />
          <Row label={t('accounting.recognized.serviceCharges')} value={<CurrencyText amount={v.recognized.serviceCharges} />} />
          <Row label={t('accounting.recognized.breakage')} value={<CurrencyText amount={v.recognized.breakage} />} />
          <Row
            label={t('accounting.recognized.pointsExpired')}
            value={t('accounting.points', { count: v.recognized.pointsExpired, n: v.recognized.pointsExpired.toLocaleString() })}
          />
        </Section>
      </div>
    </div>
  );
}
