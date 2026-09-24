import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  ExternalLink,
  FileText,
  Landmark,
  MessageCircleQuestion,
  MoreHorizontal,
  Pencil,
  QrCode,
  ReceiptText,
  RotateCcw,
  ScanLine,
  Sparkles,
  Undo2,
  Upload,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type {
  PaymentSlipDetail,
  PaymentSlipView,
  SlipRef,
  SlipRejectCode,
} from '@abcp/shared-types';

import { CurrencyText } from '@/components/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TONE, type Tone } from '@/features/payroll/payroll.lib';
import { useConfirm } from '@/hooks/useConfirm';
import { formatCurrency, formatDateTime, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';
import { NormalizedApiError } from '@/services/apiError';

import { SlipImageViewer } from './SlipImageViewer';
import { CHECK_ICON, STATE_ICON } from './slip.lib';
import { ScoreRing, SlipVerdictPill, WaitChip } from './slip.parts';
import {
  CHECK_TONE,
  REJECT_CODE,
  REJECT_PRESETS,
  claimedByOther,
  acceptedAmounts,
  billAfterApprove,
  correctionsFromDraft,
  draftFromSlip,
  formatBytes,
  slipChecks,
  waitingMinutes,
  type SlipDraft,
} from './slipModel';
import { expectedAmount, isReviewable, maskAccount } from './treasury.lib';
import {
  releaseSlipClaim,
  useClaimSlip,
  usePaymentBankAccounts,
  useReprocessSlip,
  useReviewSlip,
} from './treasury.api';
import {
  AskCustomerDialog,
  BankProofCard,
  ClaimBanner,
  ReverseDialog,
  RiskCard,
} from './slip.evidence';

type Currency = 'LAK' | 'THB' | 'USD';

interface Props {
  slip: PaymentSlipView | PaymentSlipDetail;
  canReview: boolean;
  /** Narrow screens: a back button that closes the pane. */
  onBack?: () => void;
  /** Queue position + stepping; also used to move on after a decision. */
  nav?: { index: number; total: number; onPrev: (() => void) | null; onNext: (() => void) | null };
  onOpenSlip: (id: string) => void;
  slaMinutes: number;
  now: number;
  /** Page-level keyboard shortcuts are live (no dialog open, pane visible). */
  hotkeys: boolean;
  /** Signed-in user — to tell my claim from a colleague's (S5). */
  meId?: string;
}

interface CompareRow {
  key: keyof SlipDraft | 'currency';
  label: string;
  expected: string | null;
  read: string | null;
  ok: boolean | null;
  mono?: boolean;
  input?: { type?: string; inputMode?: 'decimal'; className?: string };
}

const isDetail = (s: PaymentSlipView | PaymentSlipDetail): s is PaymentSlipDetail =>
  'siblings' in s;

/**
 * Reading pane for one slip — built around the decision the reviewer has to make:
 * status banner (what state this is and what's left to do) → image with zoom/rotate → the matcher's
 * four checks with their points → expected vs read (inline correction) → bill impact preview →
 * receiving account → duplicates / other slips on the bill → OCR diagnostics → timeline. The action
 * bar pins to the bottom; A / R / E / Z are shortcuts. Mismatches are marked by icon + word, never by
 * colour alone.
 */
export function SlipDetail({
  slip: s,
  canReview,
  onBack,
  nav,
  onOpenSlip,
  slaMinutes,
  now,
  hotkeys,
  meId,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang: 'lo' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'lo';
  const confirm = useConfirm();
  const review = useReviewSlip();
  const reprocess = useReprocessSlip();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SlipDraft>(() => draftFromSlip(s));
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonCode, setReasonCode] = useState<SlipRejectCode>('OTHER');
  const [asking, setAsking] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState(s.bankAccount?.id ?? '');
  const [zoomSignal, setZoomSignal] = useState(0);

  useEffect(() => {
    setEditing(false);
    setRejecting(false);
    setReason('');
    setReasonCode('OTHER');
    setNote('');
    setDraft(draftFromSlip(s));
    setAccountId(s.bankAccount?.id ?? '');
  }, [s.id, s.verdict, s.ocrStatus]); // eslint-disable-line react-hooks/exhaustive-deps -- reset per slip/state, not per refetch

  const detail = isDetail(s) ? s : null;
  const bad = useMemo(() => new Set<string>(s.mismatchFields), [s.mismatchFields]);
  const currency = (s.currency ?? s.payment.currency) as Currency;
  const billCurrency = s.payment.currency as Currency;
  const processing = s.ocrStatus === 'PENDING' || s.ocrStatus === 'PROCESSING';
  // S5 — a colleague's live claim holds every action until "take over"
  const lockedByOther = claimedByOther(s, meId);
  const reviewable = isReviewable(s) && canReview && !lockedByOther;
  const canReject = canReview && !lockedByOther && (reviewable || s.verdict === 'DUPLICATE');
  const canReverse = canReview && s.verdict === 'APPROVED';
  const canReprocess =
    canReview && !lockedByOther && (s.verdict === 'NEEDS_REVIEW' || s.verdict === 'AUTO_MATCHED');

  // S5 — hold the slip while it is open (heartbeat 60s, server expires after 3 min) and let go on leave.
  const claim = useClaimSlip();
  const claimable = canReview && isReviewable(s);
  useEffect(() => {
    if (!claimable) return undefined;
    const beat = () => claim.mutate({ id: s.id });
    beat();
    const timer = window.setInterval(beat, 60_000);
    return () => {
      window.clearInterval(timer);
      releaseSlipClaim(s.id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- per slip, not per render
  }, [s.id, claimable]);
  const takeOver = () =>
    claim.mutate(
      { id: s.id, force: true },
      { onSuccess: () => toast.success(t('payTreasury.slips.claim.taken')) },
    );
  const checks = slipChecks(s);
  const wasApproved = s.verdict === 'APPROVED' || s.verdict === 'REVERSED';
  const waited = waitingMinutes(s, now);

  const accepted = acceptedAmounts(s);
  const rows: CompareRow[] = [
    {
      key: 'amount',
      label: t('payTreasury.slips.f.amount'),
      expected: accepted
        .map((a) => formatCurrency(a, billCurrency))
        .join(t('payTreasury.slips.or')),
      read: s.amount != null ? formatCurrency(s.amount, currency) : null,
      ok: s.amount == null ? null : !bad.has('amount') && !bad.has('currency'),
      input: { type: 'number', inputMode: 'decimal', className: 'tabular-nums' },
    },
    {
      key: 'receiverAccount',
      label: t('payTreasury.slips.f.receiver'),
      expected: s.bankAccount
        ? `${s.bankAccount.bankCode} · ${maskAccount(s.bankAccount.accountNumber)}`
        : t('payTreasury.slips.f.anyBranchAccount'),
      read: s.receiverAccount,
      ok: s.receiverAccount == null ? null : !bad.has('receiverAccount'),
      mono: true,
      input: { className: 'tabular-nums' },
    },
    {
      key: 'transferredAt',
      label: t('payTreasury.slips.f.transferredAt'),
      expected: t('payTreasury.slips.f.windowFrom', { at: formatDateTime(s.payment.createdAt) }),
      read: s.transferredAt
        ? s.dateOnly
          ? `${formatDateTime(s.transferredAt).split(' ')[0]} · ${t('payTreasury.slips.dateOnly')}`
          : formatDateTime(s.transferredAt)
        : null,
      ok: s.transferredAt == null ? null : !bad.has('transferredAt'),
      input: { type: 'datetime-local' },
    },
    {
      key: 'txnRef',
      label: t('payTreasury.slips.f.txnRef'),
      expected: t('payTreasury.slips.f.refHint'),
      read: s.txnRef,
      ok: s.txnRef == null ? null : s.verdict !== 'DUPLICATE',
      mono: true,
    },
    {
      key: 'bankCode',
      label: t('payTreasury.col.bank'),
      expected: s.bankAccount?.bankCode ?? null,
      read: s.bankCode,
      ok: null,
      input: { className: 'uppercase' },
    },
    {
      key: 'senderName',
      label: t('payTreasury.slips.f.sender'),
      expected: s.customerName,
      read: s.senderName,
      ok: null,
    },
  ];

  // The receiving account must be known before approval, or the money can never be reconciled.
  // A branch with one account resolves itself; otherwise the reviewer picks (server enforces the same).
  const accountsQ = usePaymentBankAccounts(isReviewable(s) ? s.paymentId : null);
  const branchAccounts = accountsQ.data ?? [];
  const effectiveAccountId =
    accountId || (branchAccounts.length === 1 ? branchAccounts[0]!.id : '');
  const needsAccount = !effectiveAccountId;
  const accountBlocks = needsAccount && branchAccounts.length > 1;

  const draftCorrections = editing ? correctionsFromDraft(s, draft) : undefined;
  const corrections =
    effectiveAccountId && effectiveAccountId !== s.bankAccount?.id
      ? { ...draftCorrections, bankAccountId: effectiveAccountId }
      : draftCorrections;
  const approveAmount = corrections?.amount ?? s.amount ?? expectedAmount(s);
  const after = billAfterApprove(s, approveAmount);
  const missingRef = !(corrections?.txnRef ?? s.txnRef);

  async function approve() {
    if (!reviewable || review.isPending || accountBlocks) return;
    if (missingRef) {
      setEditing(true);
      toast.error(t('payTreasury.slips.needRef'));
      return;
    }
    const risky = s.mismatchFields.length > 0 && !draftCorrections;
    const ok = await confirm({
      title: t('payTreasury.slips.approveTitle', {
        amount: formatCurrency(approveAmount, currency),
      }),
      description: [
        t(risky ? 'payTreasury.slips.approveRiskyBody' : 'payTreasury.slips.approveBody'),
        t(`payTreasury.slips.after.${after.outcome}`, {
          owed: formatCurrency(Math.max(0, after.owedAfter), billCurrency),
        }),
      ].join(' '),
      confirmLabel: t('payTreasury.slips.approve'),
    });
    if (!ok) return;
    review.mutate(
      {
        id: s.id,
        input: { action: 'APPROVE', correctedFields: corrections, note: note.trim() || undefined },
      },
      {
        onSuccess: () => {
          toast.success(t('payTreasury.slips.approved'));
          nav?.onNext?.();
        },
        onError: (err) =>
          toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
      },
    );
  }

  function reject() {
    review.mutate(
      { id: s.id, input: { action: 'REJECT', note: reason.trim(), reasonCode } },
      {
        onSuccess: () => {
          toast.success(t('payTreasury.slips.rejected'));
          setRejecting(false);
          nav?.onNext?.();
        },
        onError: (err) =>
          toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
      },
    );
  }

  function openReject() {
    if (!canReject) return;
    if (s.verdict === 'DUPLICATE' && !reason) {
      setReason(t('payTreasury.slips.rejectPreset.duplicate'));
      setReasonCode('DUPLICATE');
    }
    setRejecting(true);
  }

  function rerun() {
    reprocess.mutate(s.id, {
      onSuccess: () => toast.success(t('payTreasury.slips.reprocessed')),
      onError: (err) =>
        toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
    });
  }

  function copy(text: string) {
    void navigator.clipboard?.writeText(text).then(
      () => toast.success(t('payTreasury.slips.copied')),
      () => undefined,
    );
  }

  // A approve · R reject · E correct · Z zoom — ignored while typing or when a dialog is open.
  useEffect(() => {
    if (!hotkeys || rejecting || asking || reversing) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)))
        return;
      // narrow screens render this pane inside a Sheet (itself a dialog) — anything beyond that is a modal on top
      if (
        document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length > (onBack ? 1 : 0)
      )
        return;
      const k = e.key.toLowerCase();
      if (k === 'a' && reviewable) {
        e.preventDefault();
        void approve();
      } else if (k === 'r' && canReject) {
        e.preventDefault();
        openReject();
      } else if (k === 'e' && reviewable) {
        e.preventDefault();
        setEditing((v) => !v);
      } else if (k === 'z') {
        e.preventDefault();
        setZoomSignal((n) => n + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const set = (k: keyof SlipDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));
  const base = draftFromSlip(s);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2.5">
          {onBack ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 shrink-0 p-0"
              onClick={onBack}
              aria-label={t('common.back')}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
          >
            {(s.customerName ?? s.uploadedByName).trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{s.customerName ?? s.uploadedByName}</h2>
            <p className="truncate text-2xs text-muted-foreground">
              {s.branchName} ·{' '}
              {t('payTreasury.slips.uploadedAgo', { ago: formatRelative(s.createdAt, lang) })}
              {s.payment.invoiceNo ? ` · ${s.payment.invoiceNo}` : ''}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {waited != null ? (
            <WaitChip minutes={waited} slaMinutes={slaMinutes} className="hidden sm:inline-flex" />
          ) : null}
          <SlipVerdictPill verdict={s.verdict} />
          {nav && nav.total > 0 ? (
            <div className="ml-1 hidden items-center rounded-md border border-border sm:flex">
              <button
                type="button"
                onClick={nav.onPrev ?? undefined}
                disabled={!nav.onPrev}
                className="flex h-7 w-7 items-center justify-center text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                aria-label={t('payTreasury.slips.prev')}
                title={`${t('payTreasury.slips.prev')} (K)`}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="px-1 text-2xs tabular-nums text-muted-foreground">
                {nav.index + 1}/{nav.total}
              </span>
              <button
                type="button"
                onClick={nav.onNext ?? undefined}
                disabled={!nav.onNext}
                className="flex h-7 w-7 items-center justify-center text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                aria-label={t('payTreasury.slips.next')}
                title={`${t('payTreasury.slips.next')} (J)`}
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                aria-label={t('payTreasury.slips.more')}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link to={ROUTES.financePaymentDetail(s.paymentId)}>
                  <ReceiptText className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t('payTreasury.slips.openBill')}
                </Link>
              </DropdownMenuItem>
              {s.payment.appointmentId ? (
                <DropdownMenuItem asChild>
                  <Link to={ROUTES.appointmentDetail(s.payment.appointmentId)}>
                    <CalendarClock className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t('payTreasury.slips.openAppointment')}
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild>
                <a href={s.imageUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t('payTreasury.slips.openImage')}
                </a>
              </DropdownMenuItem>
              {s.txnRef ? (
                <DropdownMenuItem onSelect={() => copy(s.txnRef!)}>
                  <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t('payTreasury.slips.copyRef')}
                </DropdownMenuItem>
              ) : null}
              {canReprocess ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={rerun} disabled={reprocess.isPending}>
                    <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t('payTreasury.slips.reprocess')}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <StatusBanner
          slip={s}
          detail={detail}
          canReprocess={canReprocess}
          onReprocess={rerun}
          reprocessing={reprocess.isPending}
          onOpenSlip={onOpenSlip}
          lang={lang}
        />
        {lockedByOther && s.claimedBy ? (
          <ClaimBanner
            name={s.claimedBy.name}
            since={s.claimedBy.at}
            onTakeOver={takeOver}
            pending={claim.isPending}
            lang={lang}
          />
        ) : null}
        {s.infoRequestedAt && isReviewable(s) ? (
          <div
            className="flex items-start gap-3 border-b border-border bg-warning-soft/50 px-4 py-2.5"
            role="status"
          >
            <MessageCircleQuestion
              className="mt-0.5 h-4 w-4 shrink-0 text-warning"
              aria-hidden="true"
            />
            <div className="min-w-0 text-xs">
              <p className="font-semibold">
                {t('payTreasury.slips.ask.waiting', {
                  ago: formatRelative(s.infoRequestedAt, lang),
                })}
              </p>
              {s.infoRequestNote ? (
                <p className="text-muted-foreground">“{s.infoRequestNote}”</p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="space-y-4 p-4">
          <RiskCard
            slip={s}
            nearDuplicateOf={detail?.nearDuplicateOf ?? null}
            onOpenSlip={onOpenSlip}
            lang={lang}
          />
          <div className="grid gap-4 sm:grid-cols-[minmax(0,240px)_1fr] 2xl:grid-cols-[minmax(0,300px)_1fr]">
            <div className="min-w-0 space-y-2">
              <SlipImageViewer src={s.imageUrl} slipId={s.id} zoomSignal={zoomSignal} />
              <dl className="grid grid-cols-2 gap-1.5 text-2xs">
                <MetaCell
                  icon={ScanLine}
                  label={t('payTreasury.slips.engine')}
                  value={`${s.ocrEngine ?? '—'}${s.ocrMs != null ? ` · ${(s.ocrMs / 1000).toFixed(1)}s` : ''}`}
                />
                <MetaCell
                  icon={Sparkles}
                  label={t('payTreasury.slips.confidence')}
                  value={s.ocrConfidence == null ? '—' : `${s.ocrConfidence}%`}
                  tone={
                    s.ocrConfidence == null
                      ? undefined
                      : s.ocrConfidence >= 80
                        ? 'success'
                        : s.ocrConfidence >= 60
                          ? 'warning'
                          : 'danger'
                  }
                />
                <MetaCell
                  icon={QrCode}
                  label={t('payTreasury.slips.qr')}
                  value={t(s.qrPayload ? 'payTreasury.slips.qrFound' : 'payTreasury.slips.qrNone')}
                />
                <MetaCell
                  icon={FileText}
                  label={t('payTreasury.slips.fileSize')}
                  value={formatBytes(s.sizeBytes)}
                />
              </dl>
            </div>
            <div className="min-w-0">
              {/* Checks */}
              <section
                aria-labelledby="slip-checks-h"
                className="h-full rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center gap-4">
                  <ScoreRing score={s.matchScore} pending={processing} />
                  <div className="min-w-0">
                    <h3 id="slip-checks-h" className="text-sm font-semibold">
                      {t('payTreasury.slips.checks.title')}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {processing
                        ? t('payTreasury.slips.processing')
                        : s.verdict === 'AUTO_MATCHED'
                          ? t('payTreasury.slips.checks.allPass')
                          : t('payTreasury.slips.checks.summary', {
                              count: checks.filter(
                                (c) => c.state === 'fail' || c.state === 'unread',
                              ).length,
                            })}
                    </p>
                  </div>
                </div>
                <ul className="mt-3 grid gap-1.5">
                  {checks.map((c) => {
                    const Icon = CHECK_ICON[c.key];
                    const StateIcon = STATE_ICON[c.state];
                    const tone = TONE[CHECK_TONE[c.state]];
                    return (
                      <li
                        key={c.key}
                        className={cn(
                          'flex items-center gap-2.5 rounded-lg px-2.5 py-2',
                          tone.soft,
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                            tone.chip,
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">
                            {t(`payTreasury.slips.checks.${c.key}`)}
                          </span>
                          <span className="block text-[10px] text-muted-foreground">
                            {c.points > 0
                              ? t('payTreasury.slips.checks.points', { n: c.points })
                              : t('payTreasury.slips.checks.gate')}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-2xs font-semibold',
                            tone.text,
                          )}
                        >
                          <StateIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          {t(`payTreasury.slips.checkState.${c.state}`)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          </div>

          {/* Expected vs read */}
          <section
            aria-labelledby="slip-compare-h"
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <h3 id="slip-compare-h" className="text-sm font-semibold">
                {t('payTreasury.slips.compareTitle')}
              </h3>
              {reviewable ? (
                <Button
                  variant={editing ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7"
                  onClick={() => setEditing((v) => !v)}
                  aria-pressed={editing}
                >
                  {editing ? (
                    <Undo2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {t(editing ? 'payTreasury.slips.hideCorrect' : 'payTreasury.slips.correct')}
                  {!editing ? (
                    <Kbd aria-hidden="true" className="ml-1.5 hidden md:inline-flex">
                      E
                    </Kbd>
                  ) : null}
                </Button>
              ) : null}
            </header>
            <table className="w-full text-sm">
              <caption className="sr-only">{t('payTreasury.slips.compareTitle')}</caption>
              <thead>
                <tr className="bg-muted/40 text-left text-2xs text-muted-foreground">
                  <th scope="col" className="w-[28%] px-4 py-1.5 font-medium">
                    {t('payTreasury.slips.field')}
                  </th>
                  <th scope="col" className="w-[32%] px-2 py-1.5 font-medium">
                    {t('payTreasury.slips.expected')}
                  </th>
                  <th scope="col" className="px-2 py-1.5 pr-4 font-medium">
                    {t('payTreasury.slips.read')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const editable = editing && reviewable && r.key !== 'currency';
                  const changed =
                    editable && draft[r.key as keyof SlipDraft] !== base[r.key as keyof SlipDraft];
                  return (
                    <tr
                      key={r.key}
                      className={cn(
                        'border-t border-border/70 align-top',
                        r.ok === false && 'bg-destructive-soft/40',
                      )}
                      data-mismatch={r.ok === false ? 'true' : undefined}
                    >
                      <th
                        scope="row"
                        className="px-4 py-2 text-left text-xs font-medium text-muted-foreground"
                      >
                        {editable ? <Label htmlFor={`sc-${r.key}`}>{r.label}</Label> : r.label}
                      </th>
                      <td className="px-2 py-2 text-xs text-muted-foreground">
                        {r.expected ?? '—'}
                      </td>
                      <td className="px-2 py-2 pr-4">
                        {editable ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              id={`sc-${r.key}`}
                              type={r.input?.type}
                              inputMode={r.input?.inputMode}
                              className={cn(
                                'h-8 text-sm',
                                r.input?.className,
                                changed && 'border-primary ring-1 ring-primary/30',
                              )}
                              value={draft[r.key as keyof SlipDraft]}
                              onChange={set(r.key as keyof SlipDraft)}
                            />
                            {changed ? (
                              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                {t('payTreasury.slips.edited')}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span
                            className={cn(
                              'flex items-start gap-1.5 break-all font-medium',
                              r.mono && 'tabular-nums',
                            )}
                          >
                            {r.ok === true ? (
                              <BadgeCheck
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success"
                                aria-label={t('payTreasury.slips.ok')}
                              />
                            ) : r.ok === false ? (
                              <CircleAlert
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive"
                                aria-label={t('payTreasury.slips.mismatch')}
                              />
                            ) : null}
                            {r.read ?? (
                              <span className="font-normal italic text-muted-foreground">
                                {t('payTreasury.slips.unread')}
                              </span>
                            )}
                            {r.ok === false ? (
                              <span className="sr-only">{t('payTreasury.slips.mismatch')}</span>
                            ) : null}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {editing && reviewable ? (
              <p className="border-t border-border bg-muted/30 px-4 py-2 text-2xs text-muted-foreground">
                {t('payTreasury.slips.correctHint')}
              </p>
            ) : null}
          </section>

          {/* Bill impact */}
          <section
            aria-labelledby="slip-bill-h"
            className="rounded-xl border border-border bg-card p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 id="slip-bill-h" className="flex items-center gap-1.5 text-sm font-semibold">
                <ReceiptText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {t('payTreasury.slips.bill.title')}
              </h3>
              <Link
                to={ROUTES.financePaymentDetail(s.paymentId)}
                className="text-2xs font-medium text-primary hover:underline"
              >
                {t('payTreasury.slips.openBill')}
              </Link>
            </div>
            <dl
              className={cn(
                'mt-3 grid grid-cols-2 gap-2',
                s.payment.depositAmount > 0 ? 'sm:grid-cols-4' : 'sm:grid-cols-3',
              )}
            >
              <Figure
                label={t('payTreasury.slips.billTotal')}
                amount={s.payment.totalAmount}
                currency={billCurrency}
              />
              <Figure
                label={t('payTreasury.slips.bill.paid')}
                amount={s.payment.paidAmount}
                currency={billCurrency}
              />
              <Figure
                label={t('payTreasury.slips.billBalance')}
                amount={s.payment.balanceAmount}
                currency={billCurrency}
                strong
              />
              {s.payment.depositAmount > 0 ? (
                <Figure
                  label={t('payTreasury.slips.bill.deposit')}
                  amount={s.payment.depositAmount}
                  currency={billCurrency}
                  hint={
                    s.payment.depositRemaining > 0
                      ? t('payTreasury.slips.bill.depositLeft', {
                          amount: formatCurrency(s.payment.depositRemaining, billCurrency),
                        })
                      : undefined
                  }
                />
              ) : null}
            </dl>
            {s.declaredAmount != null ? (
              <p className="mt-2 text-2xs text-muted-foreground">
                {t('payTreasury.slips.bill.declared', {
                  amount: formatCurrency(s.declaredAmount, billCurrency),
                })}
              </p>
            ) : null}
            {reviewable ? (
              <div
                className={cn(
                  'mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs',
                  after.outcome === 'OVERPAID'
                    ? 'bg-destructive-soft text-destructive'
                    : 'bg-muted/60',
                )}
                aria-live="polite"
              >
                {after.outcome === 'OVERPAID' ? (
                  <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
                )}
                <span>
                  <span className="font-medium">
                    {t('payTreasury.slips.after.lead', {
                      amount: formatCurrency(approveAmount, currency),
                    })}
                  </span>{' '}
                  {t(`payTreasury.slips.after.${after.outcome}`, {
                    owed: formatCurrency(Math.max(0, after.owedAfter), billCurrency),
                    over: formatCurrency(Math.abs(after.owedAfter), billCurrency),
                  })}
                </span>
              </div>
            ) : null}
          </section>

          <BankProofCard proof={s.bankProof} currency={billCurrency} />

          {/* Receiving account */}
          {reviewable && branchAccounts.length > 0 ? (
            <div
              className={cn(
                'grid gap-1.5 rounded-xl border p-4',
                needsAccount ? 'border-warning/60 bg-warning-soft/40' : 'border-border bg-card',
              )}
            >
              <Label htmlFor="sc-target" className="flex items-center gap-1.5">
                <Landmark className="h-3.5 w-3.5" aria-hidden="true" />
                {t('payTreasury.slips.targetPick')}
              </Label>
              <Select
                id="sc-target"
                className="h-9"
                value={effectiveAccountId}
                placeholder={t('payTreasury.slips.targetPlaceholder')}
                onChange={(e) => setAccountId(e.target.value)}
                options={branchAccounts.map((a) => ({
                  value: a.id,
                  label: `${a.bank.code} · ${a.accountName} · ${maskAccount(a.accountNumber)}`,
                }))}
              />
              <p
                className={cn('text-2xs', needsAccount ? 'text-warning' : 'text-muted-foreground')}
              >
                {t(
                  needsAccount
                    ? 'payTreasury.slips.targetRequired'
                    : 'payTreasury.slips.targetHint',
                )}
              </p>
            </div>
          ) : s.bankAccount ? (
            <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              <Landmark className="h-3 w-3" aria-hidden="true" />
              {t('payTreasury.slips.target', {
                account: `${s.bankAccount.accountName} · ${s.bankAccount.bankCode}`,
              })}
            </p>
          ) : null}

          {reviewable ? (
            <div className="grid gap-1.5">
              <Label htmlFor="sc-note">{t('payTreasury.slips.noteLabel')}</Label>
              <Input
                id="sc-note"
                className="h-9"
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('payTreasury.slips.notePlaceholder')}
              />
            </div>
          ) : null}

          {/* Other slips on this bill */}
          {detail && detail.siblings.length > 0 ? (
            <section
              aria-labelledby="slip-sib-h"
              className="rounded-xl border border-border bg-card"
            >
              <h3
                id="slip-sib-h"
                className="border-b border-border px-4 py-2.5 text-sm font-semibold"
              >
                {t('payTreasury.slips.siblings', { count: detail.siblings.length })}
              </h3>
              <ul>
                {detail.siblings.map((x) => (
                  <SlipRefRow
                    key={x.id}
                    r={x}
                    lang={lang}
                    onOpen={() => onOpenSlip(x.id)}
                    currency={billCurrency}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {/* OCR diagnostics */}
          {detail?.ocrText || s.qrPayload || s.ocrError ? (
            <details className="group rounded-xl border border-border bg-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex items-center gap-1.5">
                  <ScanLine className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {t('payTreasury.slips.ocrRaw')}
                </span>
                <ChevronDown
                  className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="space-y-2 border-t border-border px-4 py-3">
                {s.ocrError ? <p className="text-xs text-destructive">{s.ocrError}</p> : null}
                {s.qrPayload ? (
                  <div>
                    <p className="text-2xs text-muted-foreground">
                      {t('payTreasury.slips.qrPayload')}
                    </p>
                    <p className="break-all rounded-md bg-muted/60 px-2 py-1 font-mono text-2xs">
                      {s.qrPayload}
                    </p>
                  </div>
                ) : null}
                {detail?.ocrText ? (
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-muted/60 p-2 font-mono text-2xs leading-relaxed">
                    {detail.ocrText}
                  </pre>
                ) : null}
              </div>
            </details>
          ) : null}

          {/* Timeline */}
          <section aria-labelledby="slip-tl-h">
            <h3 id="slip-tl-h" className="mb-2 text-sm font-semibold">
              {t('payTreasury.slips.timeline.title')}
            </h3>
            <ol className="relative space-y-3 border-l border-border pl-5">
              <TimelineItem
                icon={Upload}
                tone="primary"
                title={t(
                  s.uploadedByRole === 'CUSTOMER'
                    ? 'payTreasury.slips.timeline.uploadedCustomer'
                    : 'payTreasury.slips.timeline.uploadedStaff',
                  { name: s.uploadedByName },
                )}
                at={s.createdAt}
              />
              {s.ocrStatus === 'DONE' || s.ocrStatus === 'FAILED' ? (
                <TimelineItem
                  icon={ScanLine}
                  tone={s.ocrStatus === 'FAILED' ? 'danger' : 'info'}
                  title={t(
                    s.ocrStatus === 'FAILED'
                      ? 'payTreasury.slips.timeline.readFailed'
                      : 'payTreasury.slips.timeline.read',
                    { score: s.matchScore },
                  )}
                  meta={s.ocrMs != null ? `${(s.ocrMs / 1000).toFixed(1)}s` : undefined}
                />
              ) : (
                <TimelineItem
                  icon={ScanLine}
                  tone="neutral"
                  title={t('payTreasury.slips.processing')}
                  pending
                />
              )}
              {s.infoRequestNote ? (
                <TimelineItem
                  icon={MessageCircleQuestion}
                  tone="warning"
                  title={t('payTreasury.slips.timeline.asked')}
                  at={s.infoRequestedAt ?? undefined}
                  body={s.infoRequestNote}
                />
              ) : null}
              {s.reviewedAt ? (
                <TimelineItem
                  icon={wasApproved ? BadgeCheck : X}
                  tone={wasApproved ? 'success' : 'danger'}
                  title={
                    wasApproved
                      ? s.reviewedByName
                        ? t('payTreasury.slips.timeline.approvedBy', { name: s.reviewedByName })
                        : t('payTreasury.slips.timeline.autoApproved')
                      : t('payTreasury.slips.timeline.rejectedBy', {
                          name: s.reviewedByName ?? '—',
                        })
                  }
                  at={s.reviewedAt}
                  body={s.rejectReason ?? s.reviewNote ?? undefined}
                />
              ) : null}
              {s.paymentTransactionId ? (
                <TimelineItem
                  icon={ReceiptText}
                  tone="success"
                  title={t('payTreasury.slips.timeline.booked')}
                  meta={`#${s.paymentTransactionId.slice(0, 8)}`}
                />
              ) : null}
              {s.reversedAt ? (
                <TimelineItem
                  icon={Undo2}
                  tone="danger"
                  title={t('payTreasury.slips.timeline.reversedBy', {
                    name: s.reversedByName ?? '—',
                  })}
                  at={s.reversedAt}
                  body={s.reverseReason ?? undefined}
                />
              ) : null}
            </ol>
          </section>
        </div>
      </div>

      {/* ── Action bar ─────────────────────────────────────── */}
      {canReverse ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
          <p className="text-2xs text-muted-foreground">
            {s.reversal.allowed
              ? t('payTreasury.slips.reverse.available')
              : t(
                  `payTreasury.slips.reverse.blocked.${s.reversal.blockedReason ?? 'NOT_APPROVED'}`,
                )}
          </p>
          <Button
            variant="secondary"
            className="ml-auto text-destructive hover:bg-destructive-soft"
            disabled={!s.reversal.allowed}
            onClick={() => setReversing(true)}
          >
            <Undo2 className="mr-1 h-4 w-4" aria-hidden="true" />
            {t('payTreasury.slips.reverse.action')}
          </Button>
        </div>
      ) : null}

      {canReject ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card/95 px-4 py-3 shadow-[0_-4px_12px_rgba(28,25,23,0.04)] backdrop-blur">
          <p className="hidden text-2xs text-muted-foreground xl:block">
            {reviewable ? t('payTreasury.slips.actionHint') : t('payTreasury.slips.duplicateHint')}
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {reviewable ? (
              <Button variant="ghost" onClick={() => setAsking(true)} disabled={review.isPending}>
                <MessageCircleQuestion className="mr-1 h-4 w-4" aria-hidden="true" />
                {t('payTreasury.slips.ask.action')}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              className="text-destructive hover:bg-destructive-soft"
              disabled={review.isPending}
              onClick={openReject}
            >
              <X className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('payTreasury.slips.reject')}
              <Kbd aria-hidden="true" className="ml-1.5 hidden md:inline-flex">
                R
              </Kbd>
            </Button>
            {reviewable ? (
              <Button
                disabled={review.isPending || accountBlocks}
                title={accountBlocks ? t('payTreasury.slips.targetRequired') : undefined}
                onClick={() => void approve()}
                className="min-w-[180px]"
              >
                <Check className="mr-1 h-4 w-4" aria-hidden="true" />
                {t('payTreasury.slips.approve')}
                <span
                  aria-hidden="true"
                  className="ml-1.5 hidden font-semibold tabular-nums sm:inline"
                >
                  · {formatCurrency(approveAmount, currency)}
                </span>
                <Kbd
                  aria-hidden="true"
                  className="ml-1.5 hidden border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground md:inline-flex"
                >
                  A
                </Kbd>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <AskCustomerDialog slip={s} open={asking} onOpenChange={setAsking} />
      <ReverseDialog slip={s} open={reversing} onOpenChange={setReversing} />

      <Dialog open={rejecting} onOpenChange={(o) => !o && setRejecting(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('payTreasury.slips.rejectTitle')}</DialogTitle>
            <DialogDescription>{t('payTreasury.slips.rejectBody')}</DialogDescription>
          </DialogHeader>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label={t('payTreasury.slips.rejectQuick')}
          >
            {REJECT_PRESETS.map((p) => {
              const text = t(`payTreasury.slips.rejectPreset.${p}`);
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={reason === text}
                  onClick={() => {
                    setReason(text);
                    setReasonCode(REJECT_CODE[p]);
                  }}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-2xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                    reason === text
                      ? 'border-destructive bg-destructive-soft text-destructive'
                      : 'border-border hover:bg-muted',
                  )}
                >
                  {text}
                </button>
              );
            })}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sr-reason">{t('payTreasury.slips.rejectReason')}</Label>
            <Textarea
              id="sr-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="text-2xs text-muted-foreground">
              {t('payTreasury.slips.rejectCustomerSees')}
            </p>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRejecting(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" disabled={!reason.trim() || review.isPending} onClick={reject}>
              {t('payTreasury.slips.reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** State banner — the one sentence that tells the reviewer where this slip stands. */
function StatusBanner({
  slip: s,
  detail,
  canReprocess,
  onReprocess,
  reprocessing,
  onOpenSlip,
  lang,
}: {
  slip: PaymentSlipView;
  detail: PaymentSlipDetail | null;
  canReprocess: boolean;
  onReprocess: () => void;
  reprocessing: boolean;
  onOpenSlip: (id: string) => void;
  lang: 'lo' | 'en';
}) {
  const { t } = useTranslation();
  let tone: Tone;
  let Icon: LucideIcon;
  let title: string;
  let body: React.ReactNode = null;
  let action: React.ReactNode = null;

  if (s.ocrStatus === 'PENDING' || s.ocrStatus === 'PROCESSING') {
    tone = 'primary';
    Icon = ScanLine;
    title = t('payTreasury.slips.banner.reading');
    body = t('payTreasury.slips.processing');
  } else if (s.verdict === 'DUPLICATE') {
    tone = 'danger';
    Icon = Copy;
    title = t('payTreasury.slips.banner.duplicate');
    body = detail?.duplicateOf ? (
      <button
        type="button"
        onClick={() => onOpenSlip(detail.duplicateOf!.id)}
        className="text-left underline underline-offset-2"
      >
        {t('payTreasury.slips.banner.duplicateOf', {
          name: detail.duplicateOf.customerName ?? '—',
          ago: formatRelative(detail.duplicateOf.createdAt, lang),
          verdict: t(`payTreasury.verdict.${detail.duplicateOf.verdict}`),
        })}
      </button>
    ) : (
      t('payTreasury.slips.banner.duplicateBody')
    );
  } else if (s.verdict === 'APPROVED') {
    tone = 'success';
    Icon = BadgeCheck;
    title = t('payTreasury.slips.banner.approved', {
      amount: s.amount != null ? formatCurrency(s.amount, s.payment.currency as Currency) : '—',
    });
    body = s.reviewedByName
      ? t('payTreasury.slips.banner.approvedBy', {
          name: s.reviewedByName,
          at: s.reviewedAt ? formatDateTime(s.reviewedAt) : '',
        })
      : t('payTreasury.slips.timeline.autoApproved');
  } else if (s.verdict === 'REVERSED') {
    tone = 'danger';
    Icon = Undo2;
    title = t('payTreasury.slips.banner.reversed', {
      amount: s.amount != null ? formatCurrency(s.amount, s.payment.currency as Currency) : '—',
    });
    body = (
      <>
        “{s.reverseReason}” — {s.reversedByName ?? '—'}
        {s.reversedAt ? `, ${formatDateTime(s.reversedAt)}` : ''}
      </>
    );
  } else if (s.verdict === 'REJECTED') {
    tone = 'danger';
    Icon = X;
    title = s.rejectCode
      ? `${t('payTreasury.slips.banner.rejected')} · ${t(`payTreasury.slips.rejectCode.${s.rejectCode}`)}`
      : t('payTreasury.slips.banner.rejected');
    body = (
      <>
        “{s.rejectReason}” — {s.reviewedByName ?? '—'}
        {s.reviewedAt ? `, ${formatDateTime(s.reviewedAt)}` : ''}
      </>
    );
  } else if (s.ocrStatus === 'FAILED') {
    tone = 'warning';
    Icon = CircleAlert;
    title = t('payTreasury.slips.banner.ocrFailed');
    body = t('payTreasury.slips.ocrFailed');
  } else if (s.verdict === 'AUTO_MATCHED') {
    tone = 'info';
    Icon = Sparkles;
    title = t('payTreasury.slips.banner.ready');
    body = t('payTreasury.slips.banner.readyBody');
  } else {
    tone = 'warning';
    Icon = CircleAlert;
    title = t('payTreasury.slips.banner.needsReview', { count: s.mismatchFields.length });
    body = s.mismatchFields
      .map((f) => t(`payTreasury.slips.flag.${f === 'currency' ? 'amount' : f}`))
      .join(' · ');
  }

  if (
    canReprocess &&
    (s.ocrStatus === 'FAILED' || (s.verdict === 'NEEDS_REVIEW' && (s.ocrConfidence ?? 100) < 60))
  ) {
    action = (
      <Button
        size="sm"
        variant="secondary"
        className="h-7 shrink-0"
        onClick={onReprocess}
        disabled={reprocessing}
      >
        <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        {t('payTreasury.slips.reprocess')}
      </Button>
    );
  }

  return (
    <div
      className={cn('flex items-start gap-3 border-b border-border px-4 py-3', TONE[tone].soft)}
      role="status"
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          TONE[tone].chip,
        )}
      >
        <Icon
          className={cn('h-4 w-4', Icon === ScanLine && 'motion-safe:animate-pulse')}
          aria-hidden="true"
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-semibold', TONE[tone].text)}>{title}</p>
        {body ? <div className="mt-0.5 text-xs text-muted-foreground">{body}</div> : null}
      </div>
      {action}
    </div>
  );
}

function MetaCell({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-lg bg-muted/50 px-2.5 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('flex items-center gap-1 font-medium', tone && TONE[tone].text)}>
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{value}</span>
      </dd>
    </div>
  );
}

function Figure({
  label,
  amount,
  currency,
  strong,
  hint,
}: {
  label: string;
  amount: number;
  currency: Currency;
  strong?: boolean;
  hint?: string;
}) {
  return (
    <div className={cn('rounded-lg px-2.5 py-2', strong ? 'bg-primary/[0.07]' : 'bg-muted/50')}>
      <dt className="text-2xs text-muted-foreground">{label}</dt>
      <dd>
        <CurrencyText
          amount={amount}
          currency={currency}
          className={cn(
            'text-sm tabular-nums',
            strong ? 'font-semibold text-primary' : 'font-medium',
          )}
        />
        {hint ? <span className="block text-[10px] text-muted-foreground">{hint}</span> : null}
      </dd>
    </div>
  );
}

function SlipRefRow({
  r,
  lang,
  onOpen,
  currency,
}: {
  r: SlipRef;
  lang: 'lo' | 'en';
  onOpen: () => void;
  currency: Currency;
}) {
  const { t } = useTranslation();
  return (
    <li className="border-b border-border/70 last:border-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-4 py-2 text-left outline-none hover:bg-muted/40 focus-visible:bg-muted/60"
      >
        <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-xs">
          {r.txnRef ?? t('payTreasury.slips.noRef')} · {formatRelative(r.createdAt, lang)}
        </span>
        {r.amount != null ? (
          <CurrencyText
            amount={r.amount}
            currency={currency}
            className="text-xs font-medium tabular-nums"
          />
        ) : null}
        <SlipVerdictPill verdict={r.verdict} />
      </button>
    </li>
  );
}

function TimelineItem({
  icon: Icon,
  tone,
  title,
  at,
  meta,
  body,
  pending,
}: {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  at?: string;
  meta?: string;
  body?: string;
  pending?: boolean;
}) {
  return (
    <li className="relative">
      <span
        className={cn(
          'absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-card',
          TONE[tone].chip,
        )}
        aria-hidden="true"
      >
        <Icon className={cn('h-3 w-3', pending && 'motion-safe:animate-pulse')} />
      </span>
      <p className="text-xs font-medium">{title}</p>
      <p className="text-2xs text-muted-foreground">
        {[at ? formatDateTime(at) : null, meta].filter(Boolean).join(' · ')}
      </p>
      {body ? <p className="mt-1 rounded-md bg-muted/60 px-2 py-1 text-xs">{body}</p> : null}
    </li>
  );
}
