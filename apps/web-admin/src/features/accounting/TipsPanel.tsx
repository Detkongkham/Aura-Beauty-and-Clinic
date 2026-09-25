import { HandCoins } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { CurrencyText, DateTimeText, EmptyState } from '@/components/shared';
import { CardCount } from '@/components/shared/CardCount';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/useAuth';
import { useConfirm } from '@/hooks/useConfirm';
import { NormalizedApiError } from '@/services/apiError';

import { useGratuities, usePayoutTips } from './accounting.api';
import { Section } from './accounting.parts';

type PayoutMethod = 'CASH' | 'BANK_TRANSFER' | 'PAYROLL';

/** Tips owed to staff (liability) + collection log; pay out per person. */
export function TipsPanel({ branchId, from, to }: { branchId: string; from: string; to: string }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const confirm = useConfirm();
  const q = useGratuities({ branchId, from, to, status: 'all' });
  const payout = usePayoutTips();
  const [method, setMethod] = useState<PayoutMethod>('CASH');

  if (q.isLoading || !q.data) return <Skeleton className="h-64 w-full rounded-xl" />;
  const v = q.data;
  const canPay = hasPermission('finance:manage');

  async function pay(staffProfileId: string, staffName: string, amount: number) {
    const ok = await confirm({
      title: t('accounting.tips.payoutTitle'),
      description: t('accounting.tips.payoutConfirm', { name: staffName, amount: amount.toLocaleString() }),
    });
    if (!ok) return;
    payout.mutate(
      { staffProfileId, method, ...(branchId !== 'all' ? { branchId } : {}) },
      {
        onSuccess: (r) => toast.success(t('accounting.tips.paid', { amount: r.amount.toLocaleString() })),
        onError: (e) => toast.error(e instanceof NormalizedApiError ? e.message : t('common.saveError')),
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <CardCount index={0} icon={<HandCoins className="h-4 w-4" />} label={t('accounting.tips.collected')} value={<CurrencyText amount={v.totals.collected} />} />
        <CardCount index={1} icon={<HandCoins className="h-4 w-4" />} label={t('accounting.tips.unpaid')} value={<CurrencyText amount={v.totals.unpaid} />} />
        <CardCount index={2} icon={<HandCoins className="h-4 w-4" />} label={t('accounting.tips.paidOut')} value={<CurrencyText amount={v.totals.paid} />} />
      </div>

      <Section
        title={t('accounting.tips.byStaff')}
        description={t('accounting.tips.byStaffHint')}
        action={
          canPay ? (
            <div className="w-44">
              <Select
                aria-label={t('accounting.tips.method')}
                value={method}
                onChange={(e) => setMethod(e.target.value as PayoutMethod)}
                options={(['CASH', 'BANK_TRANSFER', 'PAYROLL'] as const).map((m) => ({ value: m, label: t(`accounting.tips.methods.${m}`) }))}
              />
            </div>
          ) : null
        }
      >
        {v.byStaff.length === 0 ? (
          <EmptyState icon={HandCoins} title={t('accounting.tips.empty')} description={t('accounting.tips.emptyHint')} />
        ) : (
          <ul className="divide-y divide-border/60">
            {v.byStaff.map((s) => (
              <li key={s.staffProfileId} className="flex items-center gap-3 py-2.5">
                <PersonAvatar name={s.staffName} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.staffName}</div>
                  <div className="text-xs text-muted-foreground">
                    {t('accounting.tips.paidLine', { amount: s.paid.toLocaleString() })}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums">
                    <CurrencyText amount={s.unpaid} />
                  </div>
                  <div className="text-xs text-muted-foreground">{t('accounting.tips.owed')}</div>
                </div>
                {canPay ? (
                  <Button size="sm" variant="secondary" disabled={s.unpaid <= 0 || payout.isPending} onClick={() => pay(s.staffProfileId, s.staffName, s.unpaid)}>
                    {t('accounting.tips.payout')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {v.items.length > 0 ? (
        <Section title={t('accounting.tips.log')}>
          <ul className="divide-y divide-border/60">
            {v.items.slice(0, 50).map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <DateTimeText value={g.createdAt} mode="datetime" className="text-xs text-muted-foreground" />
                <span className="font-mono text-xs">{g.invoiceNo ?? '—'}</span>
                <Badge variant="neutral">{g.method}</Badge>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{g.shares.map((s) => s.staffName).join(', ')}</span>
                <CurrencyText amount={g.amount} className="font-medium" />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
