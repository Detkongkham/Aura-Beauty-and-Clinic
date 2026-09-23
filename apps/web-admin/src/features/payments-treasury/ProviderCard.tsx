import { Check, Copy, Percent, PlugZap, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { PaymentProviderView } from '@abcp/shared-types';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { TONE } from '@/features/payroll/payroll.lib';
import { NormalizedApiError } from '@/services/apiError';

import { TonePill } from './banks.parts';
import { CHANNEL_TONE, channelHealth } from './banks.lib';
import { useUpdateProvider } from './treasury.api';

interface Props {
  provider: PaymentProviderView;
  canEdit: boolean;
  index: number;
}

/** One payment channel: mode, on/off, fee, webhook endpoint and recent health. */
export function ProviderCard({ provider: p, canEdit, index }: Props) {
  const { t, i18n } = useTranslation();
  const lang: 'lo' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'lo';
  const update = useUpdateProvider();
  const [copied, setCopied] = useState(false);
  const [feeDraft, setFeeDraft] = useState<string | null>(null);
  const feePct = Math.round(p.feeRate * 10_000) / 100;
  const health = channelHealth(p);
  const tone = CHANNEL_TONE[health];

  const onError = (err: unknown) =>
    toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));

  async function copy() {
    try {
      await navigator.clipboard.writeText(p.webhookPath);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('payTreasury.copyFailed'));
    }
  }

  function saveFee() {
    const n = Number(feeDraft);
    if (feeDraft === null || !Number.isFinite(n) || n < 0 || n > 20) {
      toast.error(t('payTreasury.banks.feeInvalid'));
      return;
    }
    update.mutate(
      { code: p.code, input: { feeRate: Math.round(n * 100) / 10_000 } },
      { onSuccess: () => setFeeDraft(null), onError },
    );
  }

  return (
    <div
      className={cn(
        'relative flex flex-col gap-3 overflow-hidden rounded-xl border bg-card p-4 shadow-sm',
        'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
        p.isActive ? 'border-border' : 'border-dashed border-border opacity-80',
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <span aria-hidden="true" className={cn('absolute inset-x-0 top-0 h-0.5', TONE[tone].bar)} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
              TONE[tone].chip,
            )}
          >
            <PlugZap className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{lang === 'en' ? p.nameEn : p.nameLo}</p>
            <p className="truncate font-mono text-2xs text-muted-foreground">{p.code}</p>
            <TonePill tone={tone} className="mt-1">
              {t(`payTreasury.banks.channel.${health}`)}
            </TonePill>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={p.mode === 'LIVE' ? 'success' : 'warning'}>{t(`payTreasury.banks.mode.${p.mode}`)}</Badge>
          <Switch
            checked={p.isActive}
            disabled={!canEdit || update.isPending}
            aria-label={t('payTreasury.banks.toggleProvider', { name: lang === 'en' ? p.nameEn : p.nameLo })}
            onCheckedChange={(isActive) => update.mutate({ code: p.code, input: { isActive } }, { onError })}
          />
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-muted/50 px-2 py-1.5">
          <dt className="text-2xs text-muted-foreground">{t('payTreasury.banks.pendingIntents')}</dt>
          <dd className="text-sm font-semibold tabular-nums">{p.pendingIntents}</dd>
        </div>
        <div
          className={cn('rounded-md px-2 py-1.5', p.recentIssues > 0 ? 'bg-warning-soft text-warning' : 'bg-muted/50')}
        >
          <dt className="flex items-center justify-center gap-1 text-2xs">
            {p.recentIssues > 0 ? <TriangleAlert className="h-3 w-3" aria-hidden="true" /> : null}
            {t('payTreasury.banks.issues7d')}
          </dt>
          <dd className="text-sm font-semibold tabular-nums">{p.recentIssues}</dd>
        </div>
        <div className="rounded-md bg-muted/50 px-2 py-1.5">
          <dt className="text-2xs text-muted-foreground">{t('payTreasury.banks.lastEvent')}</dt>
          <dd className="truncate text-sm font-semibold">
            {p.lastEventAt ? formatRelative(p.lastEventAt, lang) : t('payTreasury.banks.never')}
          </dd>
        </div>
      </dl>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-2xs" title={p.webhookPath}>
            {p.webhookPath}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 p-0"
            onClick={() => void copy()}
            aria-label={t('payTreasury.banks.copyWebhook')}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </Button>
        </div>
        <p className={cn('text-2xs', p.secretConfigured ? 'text-success' : 'text-destructive')}>
          {t(p.secretConfigured ? 'payTreasury.banks.secretOk' : 'payTreasury.banks.secretMissing')}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground" htmlFor={`fee-${p.code}`}>
          <Percent className="h-3.5 w-3.5" aria-hidden="true" />
          {t('payTreasury.banks.fee')}
        </label>
        {canEdit ? (
          <div className="flex items-center gap-1.5">
            <Input
              id={`fee-${p.code}`}
              type="number"
              inputMode="decimal"
              min={0}
              max={20}
              step={0.1}
              className="h-8 w-20 text-right text-sm tabular-nums"
              value={feeDraft ?? String(feePct)}
              onChange={(e) => setFeeDraft(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8"
              disabled={feeDraft === null || update.isPending}
              onClick={saveFee}
            >
              {t('common.save')}
            </Button>
          </div>
        ) : (
          <span className="text-sm font-medium tabular-nums">{feePct}%</span>
        )}
      </div>

      {/* G2 — does the bank credit the account net of this fee? Drives the expected figure in reconciliation. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium">{t('payTreasury.banks.settlesNet')}</p>
          <p className="text-2xs text-muted-foreground">{t('payTreasury.banks.settlesNetHint')}</p>
        </div>
        <Switch
          checked={p.settlesNet}
          disabled={!canEdit || update.isPending}
          aria-label={t('payTreasury.banks.settlesNet')}
          onCheckedChange={(settlesNet) => update.mutate({ code: p.code, input: { settlesNet } }, { onError })}
        />
      </div>
    </div>
  );
}
