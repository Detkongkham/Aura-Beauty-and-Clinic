import { LEDGER_ACCOUNT_KEYS, type ChartOfAccounts, type FinancePolicy, type LedgerAccountKey } from '@abcp/shared-types';
import { Lock, LockOpen, Play, RefreshCw, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { DateTimeText } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/features/auth/useAuth';
import { NormalizedApiError } from '@/services/apiError';

import {
  useAccounts,
  useFxRates,
  usePolicy,
  useRefreshFx,
  useRunMaintenance,
  useSaveAccounts,
  useSaveFx,
  useSavePolicy,
} from './accounting.api';
import { Section } from './accounting.parts';

const errText = (e: unknown, fallback: string) => (e instanceof NormalizedApiError ? e.message : fallback);

type NumKey = 'serviceChargePercent' | 'noShowFeePercent' | 'lateCancelFeePercent' | 'pointsExpiryMonths' | 'pointsExpiryNoticeDays';
const NUM_FIELDS: { key: NumKey; max: number; suffix: string }[] = [
  { key: 'serviceChargePercent', max: 20, suffix: '%' },
  { key: 'noShowFeePercent', max: 100, suffix: '%' },
  { key: 'lateCancelFeePercent', max: 100, suffix: '%' },
  { key: 'pointsExpiryMonths', max: 120, suffix: 'm' },
  { key: 'pointsExpiryNoticeDays', max: 90, suffix: 'd' },
];

/** Finance policy, chart of accounts and FX feed — SUPER_ADMIN edits, others read. */
export function SettingsPanel() {
  const { t } = useTranslation();
  const { role, hasPermission } = useAuth();
  const canEdit = role === 'SUPER_ADMIN' && hasPermission('finance:manage');
  const policyQ = usePolicy();
  const accountsQ = useAccounts();
  const fxQ = useFxRates();
  const savePolicy = useSavePolicy();
  const saveAccounts = useSaveAccounts();
  const saveFx = useSaveFx();
  const refreshFx = useRefreshFx();
  const runMaintenance = useRunMaintenance();

  const [policy, setPolicy] = useState<FinancePolicy | null>(null);
  const [ccyText, setCcyText] = useState('');
  const [accounts, setAccounts] = useState<ChartOfAccounts | null>(null);
  const [fxDraft, setFxDraft] = useState<{ currency: string; rate: string }>({ currency: '', rate: '' });

  useEffect(() => {
    if (policyQ.data) {
      setPolicy(policyQ.data);
      setCcyText(policyQ.data.fxCurrencies.join(', '));
    }
  }, [policyQ.data]);
  useEffect(() => {
    if (accountsQ.data) setAccounts(accountsQ.data);
  }, [accountsQ.data]);

  if (!policy || !accounts) return <Skeleton className="h-64 w-full rounded-xl" />;

  const onSavePolicy = () => {
    const fxCurrencies = ccyText
      .split(/[\s,]+/)
      .map((c) => c.trim().toUpperCase())
      .filter((c) => /^[A-Z]{3}$/.test(c));
    savePolicy.mutate(
      { ...policy, fxCurrencies },
      {
        onSuccess: () => toast.success(t('common.saved')),
        onError: (e) => toast.error(errText(e, t('common.saveError'))),
      },
    );
  };

  const setAccount = (k: LedgerAccountKey, field: 'code' | 'name', value: string) =>
    setAccounts((a) => (a ? { ...a, [k]: { ...a[k], [field]: value } } : a));

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Section
        title={t('accounting.policy.title')}
        description={t('accounting.policy.subtitle')}
        action={
          canEdit ? (
            <Button size="sm" onClick={onSavePolicy} disabled={savePolicy.isPending}>
              <Save className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('common.save')}
            </Button>
          ) : null
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {NUM_FIELDS.map((f) => (
            <div key={f.key}>
              <Label htmlFor={`pol-${f.key}`}>{t(`accounting.policy.${f.key}`)}</Label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  id={`pol-${f.key}`}
                  type="number"
                  min={0}
                  max={f.max}
                  disabled={!canEdit}
                  value={policy[f.key]}
                  onChange={(e) => setPolicy({ ...policy, [f.key]: Math.min(f.max, Math.max(0, Number(e.target.value) || 0)) })}
                />
                <span className="w-6 text-xs text-muted-foreground">{t(`accounting.policy.unit.${f.suffix}`)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t(`accounting.policy.${f.key}Hint`)}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-3 border-t border-border pt-3">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-medium">{t('accounting.policy.giftCardBreakage')}</span>
              <span className="block text-xs text-muted-foreground">{t('accounting.policy.giftCardBreakageHint')}</span>
            </span>
            <Switch checked={policy.giftCardBreakage} disabled={!canEdit} onCheckedChange={(v) => setPolicy({ ...policy, giftCardBreakage: v })} />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-medium">{t('accounting.policy.fxAutoFeed')}</span>
              <span className="block text-xs text-muted-foreground">{t('accounting.policy.fxAutoFeedHint')}</span>
            </span>
            <Switch checked={policy.fxAutoFeed} disabled={!canEdit} onCheckedChange={(v) => setPolicy({ ...policy, fxAutoFeed: v })} />
          </label>
          <div>
            <Label htmlFor="pol-ccy">{t('accounting.policy.fxCurrencies')}</Label>
            <Input id="pol-ccy" className="mt-1" disabled={!canEdit} value={ccyText} onChange={(e) => setCcyText(e.target.value)} placeholder="USD, THB, CNY" />
          </div>
          {canEdit ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={runMaintenance.isPending}
              onClick={() =>
                runMaintenance.mutate(undefined, {
                  onSuccess: (r) =>
                    toast.success(
                      t('accounting.policy.maintenanceDone', {
                        points: r.points.points.toLocaleString(),
                        cards: r.breakage.cards,
                        amount: r.breakage.amount.toLocaleString(),
                      }),
                    ),
                  onError: (e) => toast.error(errText(e, t('common.saveError'))),
                })
              }
            >
              <Play className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('accounting.policy.runMaintenance')}
            </Button>
          ) : null}
        </div>
      </Section>

      <Section
        title={t('accounting.fx.title')}
        description={t('accounting.fx.subtitle')}
        action={
          canEdit ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={refreshFx.isPending}
              onClick={() =>
                refreshFx.mutate(undefined, {
                  onSuccess: (r) =>
                    r.failed
                      ? toast.error(t('accounting.fx.failed', { reason: r.failed }))
                      : toast.success(t('accounting.fx.refreshed', { updated: r.updated.join(', ') || '—', skipped: r.skippedLocked.join(', ') || '—' })),
                  onError: (e) => toast.error(errText(e, t('common.saveError'))),
                })
              }
            >
              <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('accounting.fx.refresh')}
            </Button>
          ) : null
        }
      >
        <ul className="divide-y divide-border/60">
          {(fxQ.data ?? []).map((r) => (
            <li key={r.currency} className="flex items-center gap-3 py-2">
              <span className="w-12 font-mono text-sm font-semibold">{r.currency}</span>
              <span className="flex-1 text-sm tabular-nums">1 {r.currency} = {r.rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} ₭</span>
              <Badge variant={r.source === 'FEED' ? 'info' : 'neutral'}>{t(`accounting.fx.source.${r.source}`)}</Badge>
              {r.fetchedAt ? <DateTimeText value={r.fetchedAt} mode="relative" className="hidden text-xs text-muted-foreground sm:inline" /> : null}
              {canEdit ? (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={r.locked ? t('accounting.fx.unlock') : t('accounting.fx.lock')}
                  title={r.locked ? t('accounting.fx.unlock') : t('accounting.fx.lock')}
                  onClick={() => saveFx.mutate({ currency: r.currency, rate: r.rate, locked: !r.locked })}
                >
                  {r.locked ? <Lock className="h-4 w-4 text-warning" /> : <LockOpen className="h-4 w-4 text-muted-foreground" />}
                </Button>
              ) : r.locked ? (
                <Lock className="h-4 w-4 text-warning" aria-label={t('accounting.fx.locked')} />
              ) : null}
            </li>
          ))}
          {(fxQ.data ?? []).length === 0 ? <li className="py-4 text-center text-sm text-muted-foreground">{t('accounting.fx.empty')}</li> : null}
        </ul>
        {canEdit ? (
          <form
            className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              const rate = Number(fxDraft.rate);
              const currency = fxDraft.currency.trim().toUpperCase();
              if (!/^[A-Z]{3}$/.test(currency) || !(rate > 0)) return;
              saveFx.mutate(
                { currency, rate, locked: true },
                {
                  onSuccess: () => {
                    setFxDraft({ currency: '', rate: '' });
                    toast.success(t('common.saved'));
                  },
                  onError: (err) => toast.error(errText(err, t('common.saveError'))),
                },
              );
            }}
          >
            <div className="w-24">
              <Label htmlFor="fx-ccy">{t('accounting.fx.currency')}</Label>
              <Input id="fx-ccy" className="mt-1" maxLength={3} value={fxDraft.currency} onChange={(e) => setFxDraft({ ...fxDraft, currency: e.target.value })} placeholder="USD" />
            </div>
            <div className="w-40">
              <Label htmlFor="fx-rate">{t('accounting.fx.rate')}</Label>
              <Input id="fx-rate" className="mt-1" type="number" min={0} step="any" value={fxDraft.rate} onChange={(e) => setFxDraft({ ...fxDraft, rate: e.target.value })} />
            </div>
            <Button type="submit" size="sm" disabled={saveFx.isPending}>
              {t('accounting.fx.setManual')}
            </Button>
          </form>
        ) : null}
      </Section>

      <Section
        className="xl:col-span-2"
        title={t('accounting.coa.title')}
        description={t('accounting.coa.subtitle')}
        action={
          canEdit ? (
            <Button
              size="sm"
              disabled={saveAccounts.isPending}
              onClick={() =>
                saveAccounts.mutate(accounts, {
                  onSuccess: () => toast.success(t('common.saved')),
                  onError: (e) => toast.error(errText(e, t('common.saveError'))),
                })
              }
            >
              <Save className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('common.save')}
            </Button>
          ) : null
        }
      >
        <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
          {LEDGER_ACCOUNT_KEYS.map((k) => (
            <div key={k} className="grid grid-cols-[88px_1fr] items-center gap-2">
              <Input aria-label={`${k} code`} className="font-mono" disabled={!canEdit} value={accounts[k].code} onChange={(e) => setAccount(k, 'code', e.target.value)} />
              <Input aria-label={`${k} name`} disabled={!canEdit} value={accounts[k].name} onChange={(e) => setAccount(k, 'name', e.target.value)} title={t(`accounting.coa.keys.${k}`)} />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
