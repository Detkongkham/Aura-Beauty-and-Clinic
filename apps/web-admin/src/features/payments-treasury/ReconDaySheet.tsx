import type { ReconciliationRow, ReconciliationStatus, SlipVerdict } from '@abcp/shared-types';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  ExternalLink,
  FileSpreadsheet,
  History,
  Link2,
  Link2Off,
  Lock,
  Lightbulb,
  ReceiptText,
  Scale,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { CurrencyText } from '@/components/shared';
import { StatusPill } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/hooks/useConfirm';
import { formatDate, formatDateTime, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';
import { NormalizedApiError } from '@/services/apiError';

import { ageInDays, weekdayShort } from './reconciliation.lib';
import { ReconStatusPill, SignedAmount } from './recon.parts';
import { BalanceChecks, HistorySection, ResolutionPanel, StatementLinesSection } from './recon.day-parts';
import { OPEN_VERDICTS, SLIP_VERDICT_VARIANT, maskAccount, shiftDays, todayKey } from './treasury.lib';
import { useDeleteStatement, useReconciliationDay, useUpsertStatement } from './treasury.api';

const EPS = 0.01;

interface Props {
  target: { bankAccountId: string; date: string } | null;
  /** The ledger row already on screen, shown instantly while the detail loads. */
  fallback: ReconciliationRow | null;
  canManage: boolean;
  /** payments:reconcile — approve differences, match statement lines. */
  canReconcile: boolean;
  /** Maker ≠ checker: a non-super-admin cannot approve a statement they entered. */
  currentUserName: string | null;
  isSuper: boolean;
  onClose: () => void;
  onNavigate: (date: string) => void;
}

/**
 * One account on one day. The old dialog showed four totals and two inputs;
 * finding *why* a day did not tie out meant leaving the page. This drawer puts
 * the transaction lines behind each total, the day's slips and a live preview of
 * the result next to the entry form, so a reconciler can type the bank's
 * figures, see the difference change as they type, and find the line that
 * explains it in one place.
 *
 * Inputs start empty (or with the saved statement), never pre-filled with the
 * system totals: a pre-filled form makes it too easy to press Save without
 * reading the bank statement. Copying the system figures is one deliberate click.
 */
export function ReconDaySheet({ target, fallback, canManage, canReconcile, currentUserName, isSuper, onClose, onNavigate }: Props) {
  const { t, i18n } = useTranslation();
  const confirm = useConfirm();
  const { data, isLoading, isError } = useReconciliationDay(target?.bankAccountId ?? null, target?.date ?? null);
  const upsert = useUpsertStatement();
  const del = useDeleteStatement();

  const row = data?.row ?? fallback;
  const [credit, setCredit] = useState('');
  const [debit, setDebit] = useState('');
  const [note, setNote] = useState('');
  const [opening, setOpening] = useState('');
  const [closing, setClosing] = useState('');
  const [dirty, setDirty] = useState(false);

  // Reset the draft when a different account-day opens, or when the saved statement changes.
  const seedKey = `${target?.bankAccountId}|${target?.date}|${row?.statementId ?? ''}|${row?.statementCredit ?? ''}|${row?.statementDebit ?? ''}|${row?.openingBalance ?? ''}|${row?.closingBalance ?? ''}`;
  useEffect(() => {
    setCredit(row?.statementCredit != null ? String(row.statementCredit) : '');
    setDebit(row?.statementDebit != null ? String(row.statementDebit) : '');
    setNote(row?.note ?? '');
    setOpening(row?.openingBalance != null ? String(row.openingBalance) : '');
    setClosing(row?.closingBalance != null ? String(row.closingBalance) : '');
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seedKey captures exactly the fields that matter
  }, [seedKey]);

  const c = credit === '' ? null : Number(credit);
  const d = debit === '' ? null : Number(debit);
  const ob = opening.trim() === '' ? null : Number(opening);
  const cb = closing.trim() === '' ? null : Number(closing);
  const balancesValid = (ob == null || Number.isFinite(ob)) && (cb == null || Number.isFinite(cb));
  const valid = c != null && d != null && Number.isFinite(c) && Number.isFinite(d) && c >= 0 && d >= 0 && balancesValid;
  const locked = Boolean(row?.locked);

  const preview = useMemo(() => {
    if (!row || !valid) return null;
    const cv = Math.round((c! - (row.expectedCredit ?? row.systemCredit)) * 100) / 100;
    const dv = Math.round((d! - row.systemDebit) * 100) / 100;
    const status: ReconciliationStatus = Math.abs(cv) <= EPS && Math.abs(dv) <= EPS ? 'MATCHED' : 'VARIANCE';
    return { cv, dv, status };
  }, [row, valid, c, d]);

  const needsNote = preview?.status === 'VARIANCE' && note.trim() === '';
  const today = todayKey();
  const onError = (err: unknown) => toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));

  if (!target) return null;

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!row || !valid) return;
    upsert.mutate(
      {
        bankAccountId: row.bankAccountId,
        date: row.date,
        statementCredit: c!,
        statementDebit: d!,
        note: note.trim() || undefined,
        openingBalance: ob,
        closingBalance: cb,
      },
      {
        onSuccess: (saved) => {
          toast.success(
            saved.status === 'MATCHED' ? t('payTreasury.recon.savedMatched') : t('payTreasury.recon.savedVariance'),
          );
          setDirty(false);
        },
        onError,
      },
    );
  }

  async function remove() {
    if (!row?.statementId) return;
    const ok = await confirm({
      title: t('payTreasury.recon.clearConfirmTitle'),
      description: t('payTreasury.recon.clearConfirmBody', { date: formatDate(row.date), account: row.accountName }),
      confirmLabel: t('payTreasury.recon.clear'),
      destructive: true,
    });
    if (!ok) return;
    del.mutate(row.statementId, { onSuccess: () => toast.success(t('payTreasury.recon.cleared')), onError });
  }

  const describeMatch = (kind: 'TX' | 'EXPENSE' | 'REFUND', id: string): string | null => {
    if (kind === 'TX') {
      const c = data?.credits.find((x) => x.id === id);
      return c ? `${c.customerName ?? t('payTreasury.recon.walkIn')} · ${formatTime(c.at)}` : null;
    }
    const dl = data?.debits.find((x) => x.id === id);
    return dl ? `${dl.title || (i18n.language.startsWith('en') ? dl.categoryEn : dl.categoryLo)} · ${formatTime(dl.at)}` : null;
  };
  const hasLines = (data?.lines.length ?? 0) > 0;
  const selfEntered = !isSuper && Boolean(row?.enteredByName && currentUserName && row.enteredByName === currentUserName);

  const openSlips = (data?.slips ?? []).filter((s) => OPEN_VERDICTS.includes(s.verdict as SlipVerdict));
  const openSlipTotal = openSlips.reduce((n, s) => n + (s.amount ?? s.declaredAmount ?? 0), 0);
  const shownCv = preview?.cv ?? row?.creditVariance ?? null;
  const shownDv = preview?.dv ?? row?.debitVariance ?? null;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-[680px]">
        <SheetHeader>
          <div className="flex items-start gap-3 pr-8">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
              {row?.bankCode ?? '—'}
            </span>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-lg">
                {formatDate(target.date)}{' '}
                <span className="text-sm font-normal text-muted-foreground">{weekdayShort(target.date, i18n.language)}</span>
              </SheetTitle>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {row ? (
                  <>
                    {row.accountName} · <span className="font-mono">{maskAccount(row.accountNumber)}</span> · {row.branchName}
                  </>
                ) : null}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {row ? <ReconStatusPill status={row.status} /> : null}
                {row?.status === 'UNRECONCILED' && ageInDays(target.date) > 0 ? (
                  <span className="text-2xs text-muted-foreground">{t('payTreasury.recon.daysAgo', { count: ageInDays(target.date) })}</span>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onNavigate(shiftDays(target.date, -1))}
                aria-label={t('payTreasury.recon.prevDay')}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={target.date >= today}
                onClick={() => onNavigate(shiftDays(target.date, 1))}
                aria-label={t('payTreasury.recon.nextDay')}
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <SheetBody className="space-y-4 py-4">
          {locked ? (
            <p className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs">
              <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              {t('payTreasury.recon.lockedBanner', { month: target.date.slice(0, 7) })}
            </p>
          ) : null}
          {isError ? <p className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">{t('payTreasury.loadError')}</p> : null}

          {/* ── comparison ── */}
          {row ? (
            <section aria-labelledby="recon-compare" className="overflow-hidden rounded-lg border border-border">
              <h3 id="recon-compare" className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3.5 py-2 text-xs font-semibold text-muted-foreground">
                <Scale className="h-3.5 w-3.5" aria-hidden="true" />
                {t('payTreasury.recon.compareTitle')}
                {dirty && preview ? (
                  <span className="ml-auto inline-flex items-center gap-1 text-2xs font-medium">
                    {t('payTreasury.recon.previewLabel')} <ReconStatusPill status={preview.status} />
                  </span>
                ) : null}
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-2xs text-muted-foreground">
                    <th scope="col" className="px-3.5 py-1.5 text-left font-medium" />
                    <th scope="col" className="px-3 py-1.5 text-right font-medium">{t('payTreasury.recon.system')}</th>
                    <th scope="col" className="px-3 py-1.5 text-right font-medium">{t('payTreasury.recon.statementShort')}</th>
                    <th scope="col" className="px-3.5 py-1.5 text-right font-medium">{t('payTreasury.recon.variance')}</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  <CompareRow
                    icon={ArrowDownLeft}
                    label={t('payTreasury.recon.health.moneyIn')}
                    count={row.systemCreditCount}
                    system={row.systemCredit}
                    statement={dirty ? c : row.statementCredit}
                    variance={shownCv}
                    currency={row.currency}
                  />
                  <CompareRow
                    icon={ArrowUpRight}
                    label={t('payTreasury.recon.health.moneyOut')}
                    count={row.systemDebitCount}
                    system={row.systemDebit}
                    statement={dirty ? d : row.statementDebit}
                    variance={shownDv}
                    currency={row.currency}
                  />
                </tbody>
              </table>
              {row.systemFee > 0 ? (
                <p className="border-t border-border bg-info-soft/40 px-3.5 py-1.5 text-2xs text-info">
                  {t('payTreasury.recon.feeLine')} <CurrencyText amount={row.systemFee} currency={row.currency as 'LAK'} className="font-semibold" /> ·{' '}
                  {t('payTreasury.recon.expectedIn')} <CurrencyText amount={row.expectedCredit} currency={row.currency as 'LAK'} className="font-semibold" />
                </p>
              ) : null}
            </section>
          ) : (
            <Skeleton className="h-[120px] w-full rounded-lg" />
          )}

          {/* ── statement entry ── */}
          {canManage && row && !locked ? (
            <form id="recon-statement-form" onSubmit={submit} className="rounded-lg border border-primary/20 bg-primary/[0.03] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold">{t('payTreasury.recon.enterTitle')}</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setCredit(String(row.systemCredit));
                    setDebit(String(row.systemDebit));
                    setDirty(true);
                  }}
                >
                  <ClipboardCopy className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  {t('payTreasury.recon.copySystem')}
                </Button>
              </div>
              <p className="mt-0.5 text-2xs text-muted-foreground">{t('payTreasury.recon.enterHint')}</p>
              <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="st-credit">{t('payTreasury.recon.statementCredit')}</Label>
                  <Input
                    id="st-credit"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    className="tabular-nums"
                    value={credit}
                    placeholder="0"
                    onChange={(e) => {
                      setCredit(e.target.value);
                      setDirty(true);
                    }}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="st-debit">{t('payTreasury.recon.statementDebit')}</Label>
                  <Input
                    id="st-debit"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    className="tabular-nums"
                    value={debit}
                    placeholder="0"
                    onChange={(e) => {
                      setDebit(e.target.value);
                      setDirty(true);
                    }}
                  />
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="st-open">{t('payTreasury.recon.openingBalance')}</Label>
                  <Input
                    id="st-open"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    className="tabular-nums"
                    value={opening}
                    placeholder={t('payTreasury.recon.optional')}
                    onChange={(e) => {
                      setOpening(e.target.value);
                      setDirty(true);
                    }}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="st-close">{t('payTreasury.recon.closingBalance')}</Label>
                  <Input
                    id="st-close"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    className="tabular-nums"
                    value={closing}
                    placeholder={t('payTreasury.recon.optional')}
                    onChange={(e) => {
                      setClosing(e.target.value);
                      setDirty(true);
                    }}
                  />
                </div>
              </div>
              <BalanceChecks
                opening={ob}
                closing={cb}
                credit={c}
                debit={d}
                openingGap={dirty ? null : row.openingGap}
                currency={row.currency}
              />
              {row.source === 'IMPORT' ? (
                <p className="mt-2 flex items-center gap-1 text-2xs text-muted-foreground">
                  <FileSpreadsheet className="h-3 w-3" aria-hidden="true" />
                  {t('payTreasury.recon.fromImport')}
                </p>
              ) : null}
              <div className="mt-3 grid gap-1.5">
                <Label htmlFor="st-note">{t('payTreasury.recon.note')}</Label>
                <Textarea
                  id="st-note"
                  rows={2}
                  maxLength={300}
                  value={note}
                  placeholder={t('payTreasury.recon.notePlaceholder')}
                  aria-describedby={needsNote ? 'st-note-hint' : undefined}
                  onChange={(e) => {
                    setNote(e.target.value);
                    setDirty(true);
                  }}
                />
                {needsNote ? (
                  <p id="st-note-hint" className="text-2xs text-warning">
                    {t('payTreasury.recon.noteRecommended')}
                  </p>
                ) : null}
              </div>
            </form>
          ) : null}

          {row && (!canManage || locked) ? (
            <BalanceChecks
              opening={row.openingBalance}
              closing={row.closingBalance}
              credit={row.statementCredit}
              debit={row.statementDebit}
              openingGap={row.openingGap}
              currency={row.currency}
            />
          ) : null}

          {row && !dirty ? <ResolutionPanel row={row} canReconcile={canReconcile} selfEntered={selfEntered} /> : null}

          {/* ── diagnosis hint ── */}
          {row && row.status !== 'RESOLVED' && (shownCv ?? 0) !== 0 ? (
            <div className="flex gap-2.5 rounded-lg border border-accent/30 bg-accent-soft/30 px-3.5 py-2.5 text-xs">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              <div className="space-y-1">
                <p className="font-semibold">
                  {(shownCv ?? 0) > 0 ? t('payTreasury.recon.hint.moreTitle') : t('payTreasury.recon.hint.lessTitle')}
                </p>
                <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                  {((shownCv ?? 0) > 0
                    ? ['more1', 'more2', 'more3']
                    : ['less1', 'less2', 'less3']
                  ).map((k) => (
                    <li key={k}>{t(`payTreasury.recon.hint.${k}`)}</li>
                  ))}
                </ul>
                {(shownCv ?? 0) > 0 && openSlipTotal > 0 ? (
                  <p className="font-medium text-foreground">
                    {t('payTreasury.recon.hint.openSlipMatch', { count: openSlips.length })}{' '}
                    <CurrencyText amount={openSlipTotal} className="font-semibold" />
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* ── statement lines (imported) ── */}
          {data && row ? (
            <StatementLinesSection
              lines={data.lines}
              currency={row.currency}
              canReconcile={canReconcile}
              locked={locked}
              describeMatch={describeMatch}
            />
          ) : null}

          {/* ── the lines ── */}
          <LineSection
            icon={ArrowDownLeft}
            title={t('payTreasury.recon.creditsTitle')}
            total={row ? <CurrencyText amount={row.systemCredit} currency={row.currency as 'LAK'} /> : null}
            loading={isLoading}
            empty={t('payTreasury.recon.noCredits')}
            count={data?.credits.length ?? 0}
          >
            {data?.credits.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {l.customerName ?? t('payTreasury.recon.walkIn')}
                    {l.serviceName ? <span className="font-normal text-muted-foreground"> · {l.serviceName}</span> : null}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-2xs text-muted-foreground">
                    <span className="tabular-nums">{formatTime(l.at)}</span>
                    <span className="rounded bg-muted px-1.5 py-px font-medium text-foreground/80">{t(`payment.${l.method}`, { defaultValue: l.method })}</span>
                    {l.reference ? <span className="truncate font-mono">{l.reference}</span> : null}
                    {hasLines ? <OnStatement matched={Boolean(l.matchedLineId)} /> : null}
                    {l.fee > 0 ? (
                      <span className="text-info">
                        {t('payTreasury.recon.feeShort')} <CurrencyText amount={l.fee} />
                      </span>
                    ) : null}
                    {l.slipId ? (
                      <Link to={`${ROUTES.paymentsSlips}?s=${l.slipId}`} className="inline-flex items-center gap-0.5 text-primary hover:underline">
                        <ReceiptText className="h-3 w-3" aria-hidden="true" />
                        {t('payTreasury.recon.slip')}
                      </Link>
                    ) : null}
                    {l.appointmentId ? (
                      <Link to={ROUTES.appointmentDetail(l.appointmentId)} className="inline-flex items-center gap-0.5 text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        {t('payTreasury.recon.appointment')}
                      </Link>
                    ) : null}
                  </p>
                </div>
                <CurrencyText amount={l.amount} className="shrink-0 text-sm font-semibold tabular-nums" />
              </li>
            ))}
          </LineSection>

          <LineSection
            icon={ArrowUpRight}
            title={t('payTreasury.recon.debitsTitle')}
            total={row ? <CurrencyText amount={row.systemDebit} currency={row.currency as 'LAK'} /> : null}
            loading={isLoading}
            empty={t('payTreasury.recon.noDebits')}
            count={data?.debits.length ?? 0}
          >
            {data?.debits.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{l.title || (i18n.language.startsWith('en') ? l.categoryEn : l.categoryLo)}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-2xs text-muted-foreground">
                    <span className="tabular-nums">{formatTime(l.at)}</span>
                    <span className={cn('rounded px-1.5 py-px font-medium', l.kind === 'REFUND' ? 'bg-accent-soft text-accent-foreground' : 'bg-muted text-foreground/80')}>
                      {i18n.language.startsWith('en') ? l.categoryEn : l.categoryLo}
                    </span>
                    {hasLines ? <OnStatement matched={Boolean(l.matchedLineId)} /> : null}
                    {l.supplierName ? <span className="truncate">{l.supplierName}</span> : null}
                    {l.reference ? <span className="truncate font-mono">{l.reference}</span> : null}
                  </p>
                </div>
                <CurrencyText amount={l.amount} className="shrink-0 text-sm font-semibold tabular-nums" />
              </li>
            ))}
          </LineSection>

          {(data?.slips.length ?? 0) > 0 ? (
            <LineSection
              icon={ReceiptText}
              title={t('payTreasury.recon.slipsTitle')}
              total={openSlips.length > 0 ? <span className="text-warning">{t('payTreasury.recon.openCount', { count: openSlips.length })}</span> : null}
              loading={false}
              empty=""
              count={data!.slips.length}
            >
              {data!.slips.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`${ROUTES.paymentsSlips}?s=${s.id}`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/60"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm">
                        <StatusPill
                          status={s.verdict}
                          variant={SLIP_VERDICT_VARIANT[s.verdict as SlipVerdict]}
                          label={t(`payTreasury.verdict.${s.verdict}`)}
                        />
                        <span className="truncate">{s.senderName ?? '—'}</span>
                      </p>
                      <p className="mt-0.5 flex gap-2 text-2xs text-muted-foreground">
                        <span className="tabular-nums">{formatTime(s.createdAt)}</span>
                        {s.txnRef ? <span className="truncate font-mono">{s.txnRef}</span> : null}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {s.amount != null || s.declaredAmount != null ? <CurrencyText amount={(s.amount ?? s.declaredAmount)!} /> : '—'}
                    </span>
                  </Link>
                </li>
              ))}
            </LineSection>
          ) : null}

          {/* ── audit ── */}
          {row?.statementId ? (
            <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              <History className="h-3 w-3" aria-hidden="true" />
              {t('payTreasury.recon.auditLine', {
                name: row.enteredByName ?? '—',
                at: row.enteredAt ? formatDateTime(row.enteredAt) : '—',
              })}
            </p>
          ) : null}
          {row?.statementId ? <HistorySection statementId={row.statementId} /> : null}
        </SheetBody>

        {canManage && row && !locked ? (
          <SheetFooter className="flex-row items-center gap-2">
            {row.statementId ? (
              <Button type="button" variant="ghost" className="mr-auto text-destructive hover:bg-destructive-soft" disabled={del.isPending} onClick={remove}>
                {t('payTreasury.recon.clear')}
              </Button>
            ) : (
              <span className="mr-auto" />
            )}
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.close')}
            </Button>
            <Button type="submit" form="recon-statement-form" disabled={!valid || upsert.isPending || (!dirty && Boolean(row.statementId))}>
              {t('common.save')}
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function CompareRow({
  icon: Icon,
  label,
  count,
  system,
  statement,
  variance,
  currency,
}: {
  icon: typeof ArrowDownLeft;
  label: string;
  count: number;
  system: number;
  statement: number | null;
  variance: number | null;
  currency: string;
}) {
  const { t } = useTranslation();
  const off = variance != null && Math.abs(variance) > EPS;
  return (
    <tr className={cn('border-t border-border', off && 'bg-destructive-soft/30')}>
      <th scope="row" className="px-3.5 py-2 text-left font-normal">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          {label}
        </span>
        <span className="text-2xs text-muted-foreground">{t('payTreasury.recon.txCount', { count })}</span>
      </th>
      <td className="px-3 py-2 text-right font-semibold">
        <CurrencyText amount={system} currency={currency as 'LAK'} />
      </td>
      <td className="px-3 py-2 text-right font-semibold">
        {statement == null || Number.isNaN(statement) ? <span className="text-muted-foreground">—</span> : <CurrencyText amount={statement} currency={currency as 'LAK'} />}
      </td>
      <td className="px-3.5 py-2 text-right">
        <SignedAmount value={variance} currency={currency} />
      </td>
    </tr>
  );
}

function LineSection({
  icon: Icon,
  title,
  total,
  count,
  loading,
  empty,
  children,
}: {
  icon: typeof ArrowDownLeft;
  title: string;
  total: ReactNode;
  count: number;
  loading: boolean;
  empty: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border px-3.5 py-2.5">
      <h3 className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {title}
          <span className="rounded-full bg-muted px-1.5 text-2xs font-medium tabular-nums">{count}</span>
        </span>
        <span className="text-sm font-semibold text-foreground tabular-nums">{total}</span>
      </h3>
      {loading ? (
        <div className="mt-2 space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : count === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-1 divide-y divide-border/70">{children}</ul>
      )}
    </section>
  );
}

/** Whether a system line appears on the imported statement. */
function OnStatement({ matched }: { matched: boolean }) {
  const { t } = useTranslation();
  const Icon = matched ? Link2 : Link2Off;
  return (
    <span className={cn('inline-flex items-center gap-0.5 font-medium', matched ? 'text-success' : 'text-warning')}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {matched ? t('payTreasury.recon.onStatement') : t('payTreasury.recon.notOnStatement')}
    </span>
  );
}
