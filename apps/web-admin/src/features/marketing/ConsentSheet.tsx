import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ConsentChannel, MarketingPolicy } from '@abcp/shared-types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { NormalizedApiError } from '@/services/apiError';

import {
  useAddSuppression,
  useConsentSummary,
  useMarketingPolicy,
  useRemoveSuppression,
  useSaveMarketingPolicy,
  useSuppressions,
} from './marketing.api';

const CHANNELS: ConsentChannel[] = ['PUSH', 'SMS', 'EMAIL', 'LINE'];
const errMsg = (err: unknown, fallback: string) => (err instanceof NormalizedApiError ? err.message : fallback);

/** Wave 10G — consent overview, sending policy (quiet hours / weekly cap) and the suppression list. */
export function ConsentSheet({ open, canManage, onClose }: { open: boolean; canManage: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const summary = useConsentSummary(open);
  const policyQ = useMarketingPolicy(open);
  const savePolicy = useSaveMarketingPolicy();
  const [q, setQ] = useState('');
  const list = useSuppressions({ q: q || undefined, page: 1, pageSize: 20 }, open);
  const addM = useAddSuppression();
  const removeM = useRemoveSuppression();

  const [policy, setPolicy] = useState<MarketingPolicy | null>(null);
  useEffect(() => {
    if (policyQ.data) setPolicy(policyQ.data);
  }, [policyQ.data]);

  const [identifier, setIdentifier] = useState('');
  const [channel, setChannel] = useState<ConsentChannel>('PUSH');

  function onSavePolicy() {
    if (!policy) return;
    savePolicy.mutate(policy, {
      onSuccess: () => toast.success(t('campaigns.consent.policySaved')),
      onError: (e) => toast.error(errMsg(e, t('common.saveError'))),
    });
  }

  function onAdd() {
    if (!identifier.trim()) return;
    addM.mutate(
      { identifier: identifier.trim(), channel, reason: 'MANUAL' },
      {
        onSuccess: () => {
          setIdentifier('');
          toast.success(t('campaigns.consent.added'));
        },
        onError: (e) => toast.error(errMsg(e, t('common.saveError'))),
      },
    );
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="gap-0 p-0">
        <SheetHeader>
          <SheetTitle>{t('campaigns.consent.title')}</SheetTitle>
          <SheetDescription>{t('campaigns.consent.subtitle')}</SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-6">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">{t('campaigns.consent.overview')}</h3>
            {summary.isLoading || !summary.data ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">{t('campaigns.consent.channel')}</th>
                      <th className="px-3 py-1.5 text-right font-medium">{t('campaigns.consent.granted')}</th>
                      <th className="px-3 py-1.5 text-right font-medium">{t('campaigns.consent.revoked')}</th>
                      <th className="px-3 py-1.5 text-right font-medium">{t('campaigns.consent.suppressed')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.data.channels.map((c) => (
                      <tr key={c.channel} className="border-t">
                        <td className="px-3 py-1.5 font-medium">{c.channel}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-success">{c.granted}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{c.revoked}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{c.suppressed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="border-t bg-muted/30 px-3 py-1.5 text-2xs text-muted-foreground">
                  {t('campaigns.consent.overviewHint', { total: summary.data.totalCustomers })}
                </p>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">{t('campaigns.consent.policy')}</h3>
            {!policy ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="space-y-3 rounded-lg border p-3">
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>{t('campaigns.consent.quietHours')}</span>
                  <Switch
                    checked={policy.quietHoursEnabled}
                    disabled={!canManage}
                    onCheckedChange={(v) => setPolicy({ ...policy, quietHoursEnabled: v })}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1 text-xs text-muted-foreground">
                    {t('campaigns.consent.quietStart')}
                    <Input
                      type="time"
                      value={policy.quietStart}
                      disabled={!canManage || !policy.quietHoursEnabled}
                      onChange={(e) => setPolicy({ ...policy, quietStart: e.target.value })}
                    />
                  </label>
                  <label className="space-y-1 text-xs text-muted-foreground">
                    {t('campaigns.consent.quietEnd')}
                    <Input
                      type="time"
                      value={policy.quietEnd}
                      disabled={!canManage || !policy.quietHoursEnabled}
                      onChange={(e) => setPolicy({ ...policy, quietEnd: e.target.value })}
                    />
                  </label>
                </div>
                <label className="block space-y-1 text-xs text-muted-foreground">
                  {t('campaigns.consent.weeklyCap')}
                  <Input
                    type="number"
                    min={0}
                    max={50}
                    value={policy.weeklyCap}
                    disabled={!canManage}
                    onChange={(e) => setPolicy({ ...policy, weeklyCap: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })}
                  />
                  <span className="text-2xs">{t('campaigns.consent.weeklyCapHint')}</span>
                </label>
                {canManage ? (
                  <Button size="sm" onClick={onSavePolicy} disabled={savePolicy.isPending}>
                    {t('common.save')}
                  </Button>
                ) : null}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">{t('campaigns.consent.suppressionList')}</h3>
            <p className="text-xs text-muted-foreground">{t('campaigns.consent.suppressionHint')}</p>
            {canManage ? (
              <div className="flex gap-2">
                <Input
                  placeholder={t('campaigns.consent.identifierPlaceholder')}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
                <Select
                  className="w-[110px]"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as ConsentChannel)}
                  options={CHANNELS.map((c) => ({ value: c, label: c }))}
                  aria-label={t('campaigns.consent.channel')}
                />
                <Button onClick={onAdd} disabled={addM.isPending || !identifier.trim()}>
                  {t('campaigns.consent.addBtn')}
                </Button>
              </div>
            ) : null}
            <Input placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
            <ul className="divide-y rounded-lg border">
              {(list.data?.items ?? []).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-mono">{s.identifier}</div>
                    <div className="text-2xs text-muted-foreground">
                      {s.channel} · {t(`campaigns.consent.reason.${s.reason}`)}
                    </div>
                  </div>
                  {canManage ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive"
                      aria-label={t('common.delete')}
                      onClick={() =>
                        removeM.mutate(s.id, {
                          onError: (e) => toast.error(errMsg(e, t('common.saveError'))),
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  ) : null}
                </li>
              ))}
              {list.data && list.data.items.length === 0 ? (
                <li className="px-3 py-4 text-center text-xs text-muted-foreground">{t('campaigns.consent.empty')}</li>
              ) : null}
            </ul>
          </section>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
