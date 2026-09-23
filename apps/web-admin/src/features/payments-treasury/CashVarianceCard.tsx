import { ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CurrencyText } from '@/components/shared';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/features/auth/useAuth';
import { SectionCard } from '@/features/payroll/payroll.parts';

import { SignedAmount } from './recon.parts';
import { useCashPolicy, useCashVariance, useSaveCashPolicy } from './reconciliation.api';

const dayKey = (offsetDays: number) => new Date(Date.now() + 7 * 3_600_000 - offsetDays * 86_400_000).toISOString().slice(0, 10);

/** Wave 10C — over/short ຕາມພະນັກງານ/ສາຂາ (ຫາການທຸຈະລິດ) + ສະວິດນະໂຍບາຍ "ເງິນສົດຕ້ອງມີກະເປີດ". */
export function CashVarianceCard({ branchId }: { branchId: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [days, setDays] = useState('30');
  const from = useMemo(() => dayKey(Number(days) - 1), [days]);
  const to = useMemo(() => dayKey(0), []);
  const rep = useCashVariance(branchId || null, from, to);
  const policy = useCashPolicy();
  const save = useSaveCashPolicy();
  const d = rep.data;

  return (
    <SectionCard icon={ShieldAlert} title={t('payTreasury.recon.cash.var.title')} bodyClassName="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs">
          <Switch
            checked={policy.data?.requireOpenDrawer ?? false}
            disabled={user?.role !== 'SUPER_ADMIN' || save.isPending || !policy.data}
            onCheckedChange={(v) => save.mutate({ requireOpenDrawer: v })}
          />
          <span>{t('payTreasury.recon.cash.var.requireDrawer')}</span>
        </label>
        <Select
          className="h-8 w-[130px]"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          options={[7, 30, 90].map((n) => ({ value: String(n), label: t('payTreasury.recon.cash.var.lastDays', { count: n }) }))}
          aria-label={t('payTreasury.recon.cash.var.range')}
        />
      </div>

      {rep.isLoading || !d ? (
        <Skeleton className="h-24 w-full" />
      ) : d.totalSessions === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t('payTreasury.recon.cash.var.empty')}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border p-2.5"><p className="text-2xs text-muted-foreground">{t('payTreasury.recon.cash.var.net')}</p><SignedAmount value={d.net} zeroLabel={t('payTreasury.recon.cash.exact')} /></div>
            <div className="rounded-lg border p-2.5"><p className="text-2xs text-muted-foreground">{t('payTreasury.recon.cash.var.over')}</p><CurrencyText amount={d.over} /></div>
            <div className="rounded-lg border p-2.5"><p className="text-2xs text-muted-foreground">{t('payTreasury.recon.cash.var.short')}</p><CurrencyText amount={d.short} /></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-2xs text-muted-foreground">
                <tr>
                  <th className="py-1.5 text-left font-medium">{t('payTreasury.recon.cash.var.staff')}</th>
                  <th className="py-1.5 text-right font-medium">{t('payTreasury.recon.cash.var.shifts')}</th>
                  <th className="py-1.5 text-right font-medium">{t('payTreasury.recon.cash.var.offShifts')}</th>
                  <th className="py-1.5 text-right font-medium">{t('payTreasury.recon.cash.var.short')}</th>
                  <th className="py-1.5 text-right font-medium">{t('payTreasury.recon.cash.var.net')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border tabular-nums">
                {d.byStaff.map((r) => (
                  <tr key={r.key}>
                    <td className="py-1.5">{r.name}</td>
                    <td className="py-1.5 text-right">{r.sessions}</td>
                    <td className="py-1.5 text-right">{r.sessionsWithVariance}</td>
                    <td className="py-1.5 text-right">{r.short ? <CurrencyText amount={r.short} /> : '—'}</td>
                    <td className="py-1.5 text-right"><SignedAmount value={r.net} zeroLabel={t('payTreasury.recon.cash.exact')} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </SectionCard>
  );
}
