import type { BankAccountInsight, BankAccountView } from '@abcp/shared-types';
import { ArrowDownRight, ArrowUpRight, Minus, MoreHorizontal, Pencil, Power, QrCode, ShieldAlert, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sparkline } from '@/features/payroll/payroll.parts';
import { formatDelta } from '@/features/payroll/payroll.lib';
import { formatCurrency, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

import { AccountNumber, BankMonogram, TonePill } from './banks.parts';
import { asCur, bankHue, deltaPct, HEALTH_TONE, ISSUE_TONE, type AccountIssue, type HealthLevel } from './banks.lib';

export interface AccountActions {
  onOpen: (a: BankAccountView) => void;
  onEdit: (a: BankAccountView) => void;
  onQr: (a: BankAccountView) => void;
  onSetDefault: (a: BankAccountView) => void;
  onToggleActive: (a: BankAccountView) => void;
}

/**
 * One receiving account as a wallet-style card: identity strip (bank hue), the period's inflow with
 * its delta and trend, then today / last-in, then health pills. The whole card opens the drawer;
 * the QR tile and the ⋯ menu are separate targets and stop propagation.
 */
export function AccountCard({
  account: a,
  insight,
  days,
  branchName,
  issues,
  health,
  canManage,
  index,
  actions,
  busy,
}: {
  account: BankAccountView;
  insight: BankAccountInsight | undefined;
  days: number;
  branchName: string;
  issues: AccountIssue[];
  health: HealthLevel;
  canManage: boolean;
  index: number;
  actions: AccountActions;
  busy: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang: 'lo' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'lo';
  const cur = asCur(a.currency);
  const delta = insight ? deltaPct(insight.receivedPeriod, insight.receivedPrevPeriod) : null;
  const DeltaIcon = delta == null || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm',
        'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
        'transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        a.isActive ? 'border-border' : 'border-dashed border-border opacity-75',
        health === 'critical' && 'border-destructive/40',
      )}
      style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}
    >
      {/* full-card hit target for the drawer; content layers pass clicks through (pointer-events-none)
          and only the real controls above it opt back in */}
      <button
        type="button"
        onClick={() => actions.onOpen(a)}
        aria-label={t('payTreasury.banks.card.open', { name: a.accountName })}
        className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />

      <div
        className="pointer-events-none relative flex items-start gap-3 px-4 pb-3 pt-4"
        style={{ background: `linear-gradient(135deg, ${bankHue(a.bank.code, 0.1)} 0%, transparent 70%)` }}
      >
        <BankMonogram code={a.bank.code} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold">{a.accountName}</h3>
            {a.isDefault ? (
              <TonePill tone="accent" className="shrink-0" icon={<Star className="h-2.5 w-2.5 fill-current" aria-hidden="true" />}>
                {t('payTreasury.banks.default')}
              </TonePill>
            ) : null}
          </div>
          <div className="pointer-events-auto relative z-10 -ml-0.5 w-fit">
            <AccountNumber code={a.bank.code} number={a.accountNumber} />
          </div>
          <p className="truncate text-2xs text-muted-foreground">
            {[branchName, a.currency, lang === 'en' ? a.bank.nameEn : a.bank.nameLo]
              .filter((part, i) => i < 2 || part !== a.bank.code)
              .join(' · ')}
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            actions.onQr(a);
          }}
          aria-label={t('payTreasury.banks.qrOpen', { name: a.accountName })}
          className={cn(
            'pointer-events-auto relative z-10 flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-card transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            a.qrImageUrl
              ? 'border-border hover:border-primary/50'
              : 'border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-primary',
          )}
        >
          {a.qrImageUrl ? (
            <img src={a.qrImageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <QrCode className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      <div className="pointer-events-none relative flex-1 space-y-2 border-t border-border/70 px-4 py-3">
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-2xs text-muted-foreground">{t('payTreasury.banks.card.received', { days })}</p>
            <p className="truncate text-lg font-semibold leading-tight tabular-nums" title={formatCurrency(insight?.receivedPeriod ?? 0, cur)}>
              {insight ? formatCurrency(insight.receivedPeriod, cur) : '—'}
            </p>
          </div>
          {insight ? (
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-0.5 text-2xs font-semibold tabular-nums',
                delta == null ? 'text-muted-foreground' : delta >= 0 ? 'text-success' : 'text-destructive',
              )}
              title={t('payTreasury.banks.hero.prev', { amount: formatCurrency(insight.receivedPrevPeriod, cur) })}
            >
              <DeltaIcon className="h-3 w-3" aria-hidden="true" />
              {delta == null ? t('payTreasury.banks.hero.noBaselineShort') : formatDelta(delta)}
            </span>
          ) : null}
        </div>
        {insight ? (
          <Sparkline
            values={insight.daily}
            className="h-8"
            ariaLabel={t('payTreasury.banks.card.trend', { name: a.accountName, days })}
          />
        ) : (
          <div className="h-8 rounded bg-muted/50" />
        )}
        <dl className="grid grid-cols-2 gap-2 text-2xs">
          <div className="min-w-0">
            <dt className="text-muted-foreground">{t('payTreasury.banks.hero.today')}</dt>
            <dd className="truncate font-medium tabular-nums">
              {insight ? `${formatCurrency(insight.receivedToday, cur)} · ${insight.receivedTodayCount}` : '—'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">{t('payTreasury.banks.card.lastIn')}</dt>
            <dd className="truncate font-medium">
              {insight?.lastReceivedAt ? formatRelative(insight.lastReceivedAt, lang) : t('payTreasury.banks.never')}
            </dd>
          </div>
        </dl>
      </div>

      <div className="pointer-events-none relative flex items-center gap-2 border-t border-border/70 px-4 py-2.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {a.pendingChange ? (
            <TonePill tone="warning" icon={<ShieldAlert className="h-3 w-3" aria-hidden="true" />}>
              {t('payTreasury.banks.change.pendingPill')}
            </TonePill>
          ) : null}
          {!a.isActive ? (
            <TonePill tone="neutral">{t('payTreasury.banks.inactive')}</TonePill>
          ) : issues.length === 0 ? (
            <TonePill tone={HEALTH_TONE.ok}>{t('payTreasury.banks.health.ok')}</TonePill>
          ) : (
            issues.slice(0, 2).map((k) => (
              <TonePill key={k} tone={ISSUE_TONE[k]}>
                {t(`payTreasury.banks.issue.${k}`, {
                  count: k === 'variance' ? insight?.varianceDays : k === 'unreconciled' ? insight?.unreconciledDays : insight?.openSlips,
                })}
              </TonePill>
            ))
          )}
          {issues.length > 2 ? <span className="text-2xs text-muted-foreground">+{issues.length - 2}</span> : null}
        </div>
        {canManage ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                aria-label={t('payTreasury.banks.card.actions', { name: a.accountName })}
                className="pointer-events-auto relative z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onSelect={() => actions.onEdit(a)}>
                <Pencil className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                {t('common.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => actions.onQr(a)}>
                <QrCode className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                {t(a.qrImageUrl ? 'payTreasury.banks.qrReplace' : 'payTreasury.banks.qrUpload')}
              </DropdownMenuItem>
              {a.isActive && !a.isDefault ? (
                <DropdownMenuItem disabled={busy} onSelect={() => actions.onSetDefault(a)}>
                  <Star className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                  {t('payTreasury.banks.setDefault')}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={busy || (a.isActive && a.isDefault)}
                onSelect={() => actions.onToggleActive(a)}
                className={a.isActive ? 'text-destructive focus:text-destructive' : undefined}
              >
                <Power className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                {a.isActive
                  ? a.isDefault
                    ? t('payTreasury.banks.cantDisableDefaultShort')
                    : t('payTreasury.banks.deactivateAction')
                  : t('payTreasury.banks.reactivateAction')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </article>
  );
}
