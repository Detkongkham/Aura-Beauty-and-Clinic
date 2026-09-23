import type { BankAccountChangeView, BankAccountInsight, BankAccountView } from '@abcp/shared-types';
import {
  ArrowRight,
  CalendarCheck,
  Download,
  Pencil,
  Power,
  QrCode,
  History,
  ScanLine,
  ShieldAlert,
  Smartphone,
  Star,
  Timer,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatCurrency, formatDate, formatDateTime, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';

import type { AccountActions } from './AccountCard';
import { BankMonogram, CopyButton, DailyBars, Figure, TonePill } from './banks.parts';
import {
  asCur,
  bankHue,
  daysBetweenKeys,
  deltaPct,
  groupAccountNumber,
  HEALTH_TONE,
  ISSUE_TONE,
  type AccountIssue,
  type HealthLevel,
} from './banks.lib';
import { formatDelta } from '@/features/payroll/payroll.lib';

/**
 * Account drawer — everything about one receiving account without leaving the page: the
 * customer-facing card (what the payer sees), the period's money, reconciliation standing,
 * work waiting on it, and the actions. Deep-linked by `?a=<id>`.
 */
export function BankAccountSheet({
  account: a,
  insight,
  days,
  fromKey,
  todayKey,
  branchName,
  issues,
  health,
  canManage,
  busy,
  actions,
  onClose,
  history = [],
}: {
  /** Change requests for this account, newest first (pending + decided). */
  history?: BankAccountChangeView[];
  account: BankAccountView | null;
  insight: BankAccountInsight | undefined;
  days: number;
  fromKey: string | undefined;
  todayKey: string | undefined;
  branchName: string;
  issues: AccountIssue[];
  health: HealthLevel;
  canManage: boolean;
  busy: boolean;
  actions: AccountActions;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang: 'lo' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'lo';

  return (
    <Sheet open={Boolean(a)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-[600px]">
        {a ? (
          <SheetInner
            a={a}
            insight={insight}
            days={days}
            fromKey={fromKey}
            todayKey={todayKey}
            branchName={branchName}
            issues={issues}
            health={health}
            canManage={canManage}
            busy={busy}
            actions={actions}
            history={history}
            lang={lang}
            t={t}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SheetInner({
  a,
  insight,
  days,
  fromKey,
  todayKey,
  branchName,
  issues,
  health,
  canManage,
  busy,
  actions,
  history,
  lang,
  t,
}: {
  history: BankAccountChangeView[];
  a: BankAccountView;
  insight: BankAccountInsight | undefined;
  days: number;
  fromKey: string | undefined;
  todayKey: string | undefined;
  branchName: string;
  issues: AccountIssue[];
  health: HealthLevel;
  canManage: boolean;
  busy: boolean;
  actions: AccountActions;
  lang: 'lo' | 'en';
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const cur = asCur(a.currency);
  const delta = insight ? deltaPct(insight.receivedPeriod, insight.receivedPrevPeriod) : null;
  const avg = insight && insight.receivedPeriodCount > 0 ? insight.receivedPeriod / insight.receivedPeriodCount : 0;
  const net = insight ? insight.receivedPeriod - insight.paidOutPeriod : 0;
  const stmtAge = insight?.lastStatementDate && todayKey ? daysBetweenKeys(insight.lastStatementDate, todayKey) : null;
  const bankName = lang === 'en' ? a.bank.nameEn : a.bank.nameLo;

  return (
    <>
      <SheetHeader>
        <div className="flex items-start gap-3 pr-8">
          <BankMonogram code={a.bank.code} size="lg" />
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate">{a.accountName}</SheetTitle>
            <SheetDescription className="truncate">
              {bankName} · {branchName}
            </SheetDescription>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <TonePill tone={HEALTH_TONE[health]}>{t(`payTreasury.banks.health.${health}`)}</TonePill>
              {a.isDefault ? (
                <TonePill tone="accent" icon={<Star className="h-2.5 w-2.5 fill-current" aria-hidden="true" />}>
                  {t('payTreasury.banks.default')}
                </TonePill>
              ) : null}
              <TonePill tone="neutral">{a.currency}</TonePill>
            </div>
          </div>
        </div>
      </SheetHeader>

      <SheetBody className="space-y-5 py-5">
        {a.pendingChange ? (
          <p className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning-soft/50 px-3 py-2 text-xs text-warning">
            <ShieldAlert className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
            {t('payTreasury.banks.change.sheetPending', {
              name: a.pendingChange.requestedByName,
              kind: t(`payTreasury.banks.change.kind.${a.pendingChange.kind}`),
            })}
          </p>
        ) : null}
        {/* What the payer sees — mirrors the mobile bank-transfer screen */}
        <section aria-labelledby="payer-view" className="space-y-2">
          <h3 id="payer-view" className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
            {t('payTreasury.banks.sheet.payerView')}
          </h3>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div
              className="relative overflow-hidden rounded-xl p-4 text-white shadow-md"
              // text sits over the dark primary end; the bank hue only tints the far corner (gold/teal on white text fails AA)
              style={{ background: `linear-gradient(135deg, hsl(var(--primary-strong)) 0%, hsl(var(--primary-strong)) 50%, ${bankHue(a.bank.code)} 150%)` }}
            >
              <div aria-hidden="true" className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10" />
              <div aria-hidden="true" className="absolute -bottom-12 -left-6 h-28 w-28 rounded-full bg-white/5" />
              <p className="relative text-2xs font-medium uppercase opacity-80">{a.bank.code}</p>
              <p className="relative mt-3 flex items-center gap-1 font-mono text-lg tracking-wider tabular-nums">
                {groupAccountNumber(a.accountNumber)}
                <CopyButton
                  value={a.accountNumber}
                  label={t('payTreasury.banks.copyNumber')}
                  className="text-white/80 hover:bg-white/15 hover:text-white"
                />
              </p>
              <p className="relative mt-2 truncate text-sm font-semibold">{a.accountName}</p>
              <p className="relative truncate text-2xs opacity-80">{bankName}</p>
            </div>
            <button
              type="button"
              onClick={() => actions.onQr(a)}
              aria-label={t('payTreasury.banks.qrOpen', { name: a.accountName })}
              className={cn(
                'flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border bg-card sm:w-[132px]',
                'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                a.qrImageUrl ? 'border-border hover:border-primary/50' : 'border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-primary',
              )}
            >
              {a.qrImageUrl ? (
                <img src={a.qrImageUrl} alt={t('payTreasury.banks.qrAlt')} className="h-full w-full object-contain p-1.5" />
              ) : (
                <span className="flex flex-col items-center gap-1 px-3 text-center text-2xs">
                  <QrCode className="h-5 w-5" aria-hidden="true" />
                  {a.bank.supportsQr ? t('payTreasury.banks.sheet.qrMissing') : t('payTreasury.banks.sheet.qrUnsupported')}
                </span>
              )}
            </button>
          </div>
          {a.qrImageUrl ? (
            <a
              href={a.qrImageUrl}
              download={`qr-${a.bank.code}-${a.accountNumber.slice(-4)}.jpg`}
              className="inline-flex items-center gap-1 text-2xs font-medium text-primary hover:underline"
            >
              <Download className="h-3 w-3" aria-hidden="true" />
              {t('payTreasury.banks.sheet.downloadQr')}
            </a>
          ) : null}
        </section>

        {/* Money */}
        <section aria-labelledby="money" className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 id="money" className="text-xs font-semibold text-muted-foreground">
              {t('payTreasury.banks.sheet.money', { days })}
            </h3>
            {insight ? (
              <span
                className={cn(
                  'text-2xs font-semibold tabular-nums',
                  delta == null ? 'text-muted-foreground' : delta >= 0 ? 'text-success' : 'text-destructive',
                )}
              >
                {delta == null ? t('payTreasury.banks.hero.noBaseline') : t('payTreasury.banks.hero.vsPrev', { delta: formatDelta(delta), days })}
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Figure
              label={t('payTreasury.banks.card.received', { days })}
              value={formatCurrency(insight?.receivedPeriod ?? 0, cur)}
              hint={t('payTreasury.banks.hero.txns', { count: insight?.receivedPeriodCount ?? 0 })}
            />
            <Figure
              label={t('payTreasury.banks.hero.today')}
              value={formatCurrency(insight?.receivedToday ?? 0, cur)}
              hint={t('payTreasury.banks.hero.txns', { count: insight?.receivedTodayCount ?? 0 })}
            />
            <Figure label={t('payTreasury.banks.hero.avg')} value={formatCurrency(avg, cur)} hint={t('payTreasury.banks.hero.perTxn')} />
            <Figure
              label={t('payTreasury.banks.hero.paidOut')}
              value={formatCurrency(insight?.paidOutPeriod ?? 0, cur)}
              hint={t('payTreasury.banks.sheet.expenseCount', { count: insight?.paidOutPeriodCount ?? 0 })}
            />
            <Figure label={t('payTreasury.banks.hero.net')} value={formatCurrency(net, cur)} tone={net < 0 ? 'danger' : undefined} />
            <Figure
              label={t('payTreasury.banks.card.lastIn')}
              value={insight?.lastReceivedAt ? formatRelative(insight.lastReceivedAt, lang) : t('payTreasury.banks.never')}
              hint={insight?.lastReceivedAt ? formatDateTime(insight.lastReceivedAt) : undefined}
            />
          </div>
          {insight && fromKey ? (
            <div className="rounded-lg border border-border p-3">
              <DailyBars values={insight.daily} fromKey={fromKey} currency={a.currency} height={88} />
            </div>
          ) : null}
        </section>

        {/* Reconciliation + queues */}
        <section aria-labelledby="standing" className="space-y-2">
          <h3 id="standing" className="text-xs font-semibold text-muted-foreground">
            {t('payTreasury.banks.sheet.standing')}
          </h3>
          <ul className="divide-y divide-border rounded-lg border border-border">
            <StandingRow
              icon={CalendarCheck}
              tone={insight?.varianceDays ? 'danger' : insight?.unreconciledDays ? 'warning' : 'success'}
              title={
                insight?.lastStatementDate
                  ? t(stmtAge === 0 ? 'payTreasury.banks.sheet.lastStatementToday' : 'payTreasury.banks.sheet.lastStatement', {
                      date: formatDate(insight.lastStatementDate),
                      age: stmtAge ?? 0,
                    })
                  : t('payTreasury.banks.sheet.noStatement')
              }
              detail={
                insight?.varianceDays
                  ? t('payTreasury.banks.issue.variance', { count: insight.varianceDays })
                  : insight?.unreconciledDays
                    ? t('payTreasury.banks.issue.unreconciled', { count: insight.unreconciledDays })
                    : t('payTreasury.banks.sheet.reconciledOk', { days })
              }
              to={ROUTES.paymentsReconciliation}
              cta={t('payTreasury.banks.setup.fixRecon')}
            />
            <StandingRow
              icon={ScanLine}
              tone={insight?.openSlips ? 'info' : 'success'}
              title={t('payTreasury.banks.sheet.openSlips', { count: insight?.openSlips ?? 0 })}
              detail={t('payTreasury.banks.sheet.openSlipsHint')}
              to={ROUTES.paymentsSlips}
              cta={t('payTreasury.banks.sheet.reviewSlips')}
            />
            <StandingRow
              icon={Timer}
              tone={insight?.pendingIntents ? 'info' : 'neutral'}
              title={t('payTreasury.banks.sheet.pendingIntents', { count: insight?.pendingIntents ?? 0 })}
              detail={t('payTreasury.banks.sheet.pendingIntentsHint')}
            />
          </ul>
          {issues.includes('noQr') || issues.includes('dormant') ? (
            <div className="flex flex-wrap gap-1">
              {issues
                .filter((k) => k === 'noQr' || k === 'dormant')
                .map((k) => (
                  <TonePill key={k} tone={ISSUE_TONE[k]}>
                    {t(`payTreasury.banks.issue.${k}`)}
                  </TonePill>
                ))}
            </div>
          ) : null}
        </section>
        {history.length > 0 ? (
          <section aria-labelledby="history" className="space-y-2">
            <h3 id="history" className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              {t('payTreasury.banks.change.history')}
            </h3>
            <ol className="space-y-1.5">
              {history.slice(0, 8).map((c) => (
                <li key={c.id} className="rounded-lg border border-border px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium">
                      {t(`payTreasury.banks.change.kind.${c.kind}`)} ·{' '}
                      {c.changes
                        .filter((d) => d.field !== 'bank' && d.field !== 'branch')
                        .map((d) => t(`payTreasury.banks.change.field.${d.field}`))
                        .join(', ')}
                    </span>
                    <TonePill tone={c.status === 'APPROVED' ? 'success' : c.status === 'PENDING' ? 'warning' : 'neutral'}>
                      {t(`payTreasury.banks.change.status.${c.status}`)}
                    </TonePill>
                  </div>
                  <p className="text-2xs text-muted-foreground">
                    {t('payTreasury.banks.change.historyLine', {
                      by: c.requestedByName,
                      at: formatDateTime(c.createdAt),
                      reviewer: c.reviewedByName ?? '—',
                    })}
                    {c.reviewNote ? ` · “${c.reviewNote}”` : ''}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </SheetBody>

      {canManage ? (
        <SheetFooter className="sm:justify-between">
          <Button
            variant="ghost"
            className={cn(a.isActive && 'text-destructive hover:bg-destructive-soft')}
            disabled={busy || (a.isActive && a.isDefault)}
            title={a.isActive && a.isDefault ? t('payTreasury.banks.cantDisableDefault') : undefined}
            onClick={() => actions.onToggleActive(a)}
          >
            <Power className="mr-1 h-4 w-4" aria-hidden="true" />
            {t(a.isActive ? 'payTreasury.banks.deactivateAction' : 'payTreasury.banks.reactivateAction')}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {a.isActive && !a.isDefault ? (
              <Button variant="secondary" disabled={busy} onClick={() => actions.onSetDefault(a)}>
                <Star className="mr-1 h-4 w-4" aria-hidden="true" />
                {t('payTreasury.banks.setDefault')}
              </Button>
            ) : null}
            <Button onClick={() => actions.onEdit(a)}>
              <Pencil className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('payTreasury.banks.editAccount')}
            </Button>
          </div>
        </SheetFooter>
      ) : null}
    </>
  );
}

function StandingRow({
  icon: Icon,
  tone,
  title,
  detail,
  to,
  cta,
}: {
  icon: typeof ScanLine;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  title: string;
  detail: string;
  to?: string;
  cta?: string;
}) {
  const chip = {
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-destructive-soft text-destructive',
    info: 'bg-info-soft text-info',
    neutral: 'bg-muted text-muted-foreground',
  }[tone];
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', chip)}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-2xs text-muted-foreground">{detail}</p>
      </div>
      {to && cta ? (
        <Link
          to={to}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-2xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {cta}
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      ) : null}
    </li>
  );
}
