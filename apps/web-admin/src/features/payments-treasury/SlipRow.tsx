import { FileWarning, Hand, MessageCircleQuestion, ScanLine, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PaymentSlipView } from '@abcp/shared-types';

import { CurrencyText } from '@/components/shared';
import { Checkbox } from '@/components/ui/checkbox';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

import { BankProofDot } from './slip.evidence';
import { CheckDots, SlipVerdictPill, WaitChip } from './slip.parts';
import { blockingRisks, isOpen, slipChecks, slipHeadlineAmount, waitingMinutes } from './slipModel';

interface Props {
  slip: PaymentSlipView;
  active: boolean;
  onSelect: () => void;
  setRef?: (el: HTMLButtonElement | null) => void;
  slaMinutes: number;
  now: number;
  /** Bulk selection — only offered for slips that passed every check. */
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  meId?: string;
}

/**
 * One inbox row: thumbnail, who and how much, the four checks as glyph chips, how long it has
 * waited (against the SLA) and the verdict. Ready slips carry a checkbox for bulk confirm.
 */
export function SlipRow({
  meId,
  slip: s,
  active,
  onSelect,
  setRef,
  slaMinutes,
  now,
  selectable,
  selected,
  onToggle,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang: 'lo' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'lo';
  const processing = s.ocrStatus === 'PENDING' || s.ocrStatus === 'PROCESSING';
  const currency = (s.currency ?? s.payment.currency) as 'LAK' | 'THB' | 'USD';
  const waited = waitingMinutes(s, now);
  const name = s.customerName ?? s.uploadedByName;

  return (
    <div
      role="listitem"
      className={cn(
        'group relative flex items-stretch border-b border-border/70 transition-colors duration-150',
        active ? 'bg-primary/[0.06]' : 'hover:bg-muted/40',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-0 w-[3px] rounded-r-full transition-opacity',
          active ? 'bg-primary opacity-100' : 'opacity-0',
        )}
      />
      {selectable ? (
        <label className="flex shrink-0 cursor-pointer items-center pl-3">
          <Checkbox
            checked={Boolean(selected)}
            onChange={() => onToggle?.()}
            aria-label={t('payTreasury.slips.bulk.selectOne', { name })}
          />
        </label>
      ) : null}
      <button
        type="button"
        ref={setRef}
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-3 text-left outline-none',
          selectable ? 'pl-2.5' : 'pl-3.5',
          'focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        )}
      >
        <span className="relative h-14 w-11 shrink-0 overflow-hidden rounded-md border border-border bg-muted shadow-xs">
          <img
            src={s.imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover object-top"
          />
          {processing ? (
            <span className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-[1px]">
              <ScanLine
                className="h-4 w-4 text-primary motion-safe:animate-pulse"
                aria-hidden="true"
              />
            </span>
          ) : null}
        </span>

        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate text-sm font-semibold">{name}</span>
              {s.uploadedByRole !== 'CUSTOMER' ? (
                <UserRound
                  className="h-3 w-3 shrink-0 text-muted-foreground"
                  aria-label={t('payTreasury.slips.byStaff', { name: s.uploadedByName })}
                />
              ) : null}
            </span>
            <CurrencyText
              amount={slipHeadlineAmount(s)}
              currency={currency}
              className="shrink-0 text-sm font-semibold tabular-nums"
            />
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-2xs text-muted-foreground">
              {[s.bankCode, s.txnRef ?? t('payTreasury.slips.noRef'), s.branchName]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <span className="shrink-0 text-2xs text-muted-foreground">
              {formatRelative(s.createdAt, lang)}
            </span>
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1">
              <CheckDots checks={slipChecks(s)} />
              <BankProofDot proof={s.bankProof} />
              {blockingRisks(s).length > 0 ? (
                <span
                  role="img"
                  aria-label={t('payTreasury.slips.risk.rowLabel')}
                  title={t('payTreasury.slips.risk.rowLabel')}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-destructive-soft text-destructive"
                >
                  <FileWarning className="h-3 w-3" aria-hidden="true" />
                </span>
              ) : null}
              {s.infoRequestedAt && isOpen(s) ? (
                <span
                  role="img"
                  aria-label={t('payTreasury.slips.ask.rowLabel')}
                  title={t('payTreasury.slips.ask.rowLabel')}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-warning-soft text-warning"
                >
                  <MessageCircleQuestion className="h-3 w-3" aria-hidden="true" />
                </span>
              ) : null}
              {s.claimedBy && s.claimedBy.id !== meId ? (
                <span
                  className="inline-flex h-5 max-w-[88px] items-center gap-1 truncate rounded-md bg-info-soft px-1 text-[10px] font-medium text-info"
                  title={t('payTreasury.slips.claim.byOther', { name: s.claimedBy.name })}
                >
                  <Hand className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{s.claimedBy.name}</span>
                </span>
              ) : null}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {waited != null && waited >= slaMinutes / 2 ? (
                <WaitChip minutes={waited} slaMinutes={slaMinutes} />
              ) : null}
              <SlipVerdictPill verdict={s.verdict} />
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}
