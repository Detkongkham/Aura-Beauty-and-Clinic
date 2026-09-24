import type { PaymentSlipView, SlipBankProof, SlipRef, SlipRiskSignal } from '@abcp/shared-types';
import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Copy,
  FileWarning,
  Hand,
  Landmark,
  MessageCircleQuestion,
  QrCode,
  ScanSearch,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TONE, type Tone } from '@/features/payroll/payroll.lib';
import { formatCurrency, formatDate, formatDateTime, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { SlipVerdictPill } from './slip.parts';
import { useRequestSlipInfo, useReverseSlip } from './treasury.api';

type Lang = 'lo' | 'en';

// ── S1 bank proof ─────────────────────────────────────────────────────

const PROOF_TONE: Record<SlipBankProof['status'], Tone> = {
  MATCHED: 'success',
  FOUND: 'success',
  NOT_FOUND: 'danger',
  NO_STATEMENT: 'neutral',
};
const PROOF_ICON: Record<SlipBankProof['status'], LucideIcon> = {
  MATCHED: CircleCheck,
  FOUND: Landmark,
  NOT_FOUND: CircleAlert,
  NO_STATEMENT: CircleHelp,
};

/**
 * S1 — what the imported bank statement says about this transfer. The slip is only a picture; a credit
 * line on the statement is the proof. States are icon + words, never colour alone.
 */
export function BankProofCard({ proof, currency }: { proof: SlipBankProof; currency: string }) {
  const { t } = useTranslation();
  const tone = TONE[PROOF_TONE[proof.status]];
  const Icon = PROOF_ICON[proof.status];
  return (
    <section aria-labelledby="slip-proof-h" className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tone.chip)}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="slip-proof-h" className="text-sm font-semibold">
            {t('payTreasury.slips.proof.title')}
          </h3>
          <p className={cn('text-xs font-medium', tone.text)}>
            {t(`payTreasury.slips.proof.${proof.status}`)}
          </p>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            {t(`payTreasury.slips.proof.${proof.status}Hint`)}
          </p>
        </div>
      </div>
      {proof.line ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-3 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-2xs text-muted-foreground">{t('payTreasury.slips.proof.date')}</dt>
            <dd className="font-medium tabular-nums">
              {proof.line.postedAt
                ? formatDateTime(proof.line.postedAt)
                : formatDate(proof.line.statementDate)}
            </dd>
          </div>
          <div>
            <dt className="text-2xs text-muted-foreground">
              {t('payTreasury.slips.proof.amount')}
            </dt>
            <dd>
              <CurrencyText
                amount={proof.line.amount}
                currency={currency as 'LAK'}
                className="font-medium tabular-nums"
              />
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-2xs text-muted-foreground">
              {t('payTreasury.slips.proof.reference')}
            </dt>
            <dd className="flex items-center gap-1.5 break-all font-medium">
              {proof.line.reference ?? proof.line.description ?? '—'}
              <span
                className={cn(
                  'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                  proof.refMatched
                    ? 'bg-success-soft text-success'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {t(
                  proof.refMatched
                    ? 'payTreasury.slips.proof.refYes'
                    : 'payTreasury.slips.proof.refNo',
                )}
              </span>
            </dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}

/** Compact bank-proof glyph for queue rows. */
export function BankProofDot({ proof }: { proof: SlipBankProof }) {
  const { t } = useTranslation();
  if (proof.status === 'NO_STATEMENT') return null;
  const Icon = PROOF_ICON[proof.status];
  const label = t(`payTreasury.slips.proof.${proof.status}`);
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-0.5 rounded-md px-1',
        TONE[PROOF_TONE[proof.status]].chip,
      )}
      title={label}
      aria-label={label}
      role="img"
    >
      <Landmark className="h-3 w-3" aria-hidden="true" />
      <Icon className="h-2.5 w-2.5" aria-hidden="true" />
    </span>
  );
}

// ── S2/S3 risk signals ────────────────────────────────────────────────

const RISK_ICON: Record<SlipRiskSignal, LucideIcon> = {
  NEAR_DUPLICATE: Copy,
  EDITOR_SOFTWARE: FileWarning,
  QR_TEXT_MISMATCH: QrCode,
  LOW_CONFIDENCE: ScanSearch,
};

/**
 * S2/S3 — why the system won't pass this slip on its own. Each signal says what was seen and what to
 * check; the near-duplicate links to the other slip so both can be compared.
 */
export function RiskCard({
  slip,
  nearDuplicateOf,
  onOpenSlip,
  lang,
}: {
  slip: PaymentSlipView;
  nearDuplicateOf: SlipRef | null;
  onOpenSlip: (id: string) => void;
  lang: Lang;
}) {
  const { t } = useTranslation();
  if (slip.riskSignals.length === 0) return null;
  const onlyInfo = slip.riskSignals.every((x) => x === 'LOW_CONFIDENCE');
  return (
    <section
      aria-labelledby="slip-risk-h"
      className={cn(
        'rounded-xl border p-4',
        onlyInfo ? 'border-border bg-card' : 'border-destructive/40 bg-destructive-soft/40',
      )}
    >
      <h3 id="slip-risk-h" className="flex items-center gap-1.5 text-sm font-semibold">
        <FileWarning
          className={cn('h-4 w-4', onlyInfo ? 'text-muted-foreground' : 'text-destructive')}
          aria-hidden="true"
        />
        {t(onlyInfo ? 'payTreasury.slips.risk.titleInfo' : 'payTreasury.slips.risk.title')}
      </h3>
      <ul className="mt-2 space-y-2">
        {slip.riskSignals.map((r) => {
          const Icon = RISK_ICON[r];
          return (
            <li key={r} className="flex items-start gap-2.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 text-xs">
                <p className="font-medium">{t(`payTreasury.slips.risk.${r}`)}</p>
                <p className="text-muted-foreground">{t(`payTreasury.slips.risk.${r}Hint`)}</p>
                {r === 'NEAR_DUPLICATE' && nearDuplicateOf ? (
                  <button
                    type="button"
                    onClick={() => onOpenSlip(nearDuplicateOf.id)}
                    className="mt-1 inline-flex max-w-full items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="truncate">
                      {nearDuplicateOf.customerName ?? '—'} · {nearDuplicateOf.txnRef ?? '—'} ·{' '}
                      {formatRelative(nearDuplicateOf.createdAt, lang)}
                    </span>
                    <SlipVerdictPill verdict={nearDuplicateOf.verdict} />
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── S5 claim ─────────────────────────────────────────────────────────

/** S5 — a colleague is reviewing this slip; actions are held until you take over. */
export function ClaimBanner({
  name,
  since,
  onTakeOver,
  pending,
  lang,
}: {
  name: string;
  since: string;
  onTakeOver: () => void;
  pending: boolean;
  lang: Lang;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-center gap-3 border-b border-border bg-info-soft/60 px-4 py-2.5"
      role="status"
    >
      <Hand className="h-4 w-4 shrink-0 text-info" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-xs">
        <span className="font-semibold">{t('payTreasury.slips.claim.byOther', { name })}</span>{' '}
        <span className="text-muted-foreground">
          {t('payTreasury.slips.claim.since', { ago: formatRelative(since, lang) })}
        </span>
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="h-7 shrink-0"
        onClick={onTakeOver}
        disabled={pending}
      >
        {t('payTreasury.slips.claim.takeOver')}
      </Button>
    </div>
  );
}

// ── S6 ask the customer ───────────────────────────────────────────────

const ASK_PRESETS = ['clearer', 'fullSlip', 'amount', 'otherAccount'] as const;

/** S6 — ask the customer for a clearer slip / more detail without rejecting it. */
export function AskCustomerDialog({
  slip,
  open,
  onOpenChange,
}: {
  slip: PaymentSlipView;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const ask = useRequestSlipInfo();
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (open) setMessage('');
  }, [open, slip.id]);

  function send() {
    ask.mutate(
      { id: slip.id, message: message.trim() },
      {
        onSuccess: (r) => {
          toast.success(
            t(r.viaChat ? 'payTreasury.slips.ask.sentChat' : 'payTreasury.slips.ask.sent'),
          );
          onOpenChange(false);
        },
        onError: (err) =>
          toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('payTreasury.slips.ask.title')}</DialogTitle>
          <DialogDescription>{t('payTreasury.slips.ask.body')}</DialogDescription>
        </DialogHeader>
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label={t('payTreasury.slips.rejectQuick')}
        >
          {ASK_PRESETS.map((p) => {
            const text = t(`payTreasury.slips.ask.preset.${p}`, {
              amount: formatCurrency(
                slip.declaredAmount ?? slip.payment.balanceAmount,
                slip.payment.currency as 'LAK',
              ),
            });
            return (
              <button
                key={p}
                type="button"
                aria-pressed={message === text}
                onClick={() => setMessage(text)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-left text-2xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                  message === text
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:bg-muted',
                )}
              >
                {text}
              </button>
            );
          })}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sa-msg">{t('payTreasury.slips.ask.message')}</Label>
          <Textarea
            id="sa-msg"
            rows={3}
            maxLength={500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <p className="text-2xs text-muted-foreground">{t('payTreasury.slips.ask.hint')}</p>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button disabled={message.trim().length < 3 || ask.isPending} onClick={send}>
            <MessageCircleQuestion className="mr-1 h-4 w-4" aria-hidden="true" />
            {t('payTreasury.slips.ask.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── S7 reverse ────────────────────────────────────────────────────────

/** S7 — undo a confirmation (money turned out not to arrive). Always states the amount and bill effect. */
export function ReverseDialog({
  slip,
  open,
  onOpenChange,
}: {
  slip: PaymentSlipView;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const reverse = useReverseSlip();
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open, slip.id]);
  const amount = formatCurrency(slip.amount ?? 0, slip.payment.currency as 'LAK');

  function submit() {
    reverse.mutate(
      { id: slip.id, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(t('payTreasury.slips.reverse.done'));
          onOpenChange(false);
        },
        onError: (err) =>
          toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('payTreasury.slips.reverse.title', { amount })}</DialogTitle>
          <DialogDescription>{t('payTreasury.slips.reverse.body', { amount })}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="sv-reason">{t('payTreasury.slips.reverse.reason')}</Label>
          <Textarea
            id="sv-reason"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <p className="text-2xs text-muted-foreground">{t('payTreasury.slips.reverse.hint')}</p>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={reason.trim().length < 5 || reverse.isPending}
            onClick={submit}
          >
            <Undo2 className="mr-1 h-4 w-4" aria-hidden="true" />
            {t('payTreasury.slips.reverse.action')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
