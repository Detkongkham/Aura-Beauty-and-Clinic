import { type FormEvent, useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  Gem,
  Gift,
  History,
  Hourglass,
  Sparkles,
  SlidersHorizontal,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  LOYALTY_TIER_THRESHOLDS,
  tierForLifetimePoints,
  type LoyaltyAccountView,
  type LoyaltyTxType,
} from '@abcp/shared-types';

import { CurrencyText, DateTimeText, EmptyState } from '@/components/shared';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { useAdjustLoyalty, useMemberLedger } from './loyalty.api';
import { TIER_STYLE, tierProgress } from './tiers';

const LEDGER_PAGE = 20;
const QUICK_DELTAS = [50, 100, 500, -50, -100] as const;
const REASON_PRESETS = ['goodwill', 'birthday', 'correction', 'campaign'] as const;

type TxFilter = 'ALL' | LoyaltyTxType;
const FILTERS: TxFilter[] = ['ALL', 'EARN', 'REDEEM', 'ADJUST'];

const TX_STYLE: Record<LoyaltyTxType, { icon: LucideIcon; chip: string }> = {
  EARN: { icon: TrendingUp, chip: 'bg-success-soft text-success' },
  REDEEM: { icon: Gift, chip: 'bg-info-soft text-info' },
  ADJUST: { icon: SlidersHorizontal, chip: 'bg-accent-soft text-accent-foreground' },
  EXPIRE: { icon: Hourglass, chip: 'bg-muted text-muted-foreground' },
};

interface MemberLoyaltySheetProps {
  member: LoyaltyAccountView | null;
  onClose: () => void;
  canManage: boolean;
}

/**
 * Per-member loyalty console — the Referrals `PayoutsSheet` layout applied to points.
 * Top: a tier-tinted membership card (balance, its ₭ value, progress to the next tier).
 * Middle: the manual adjustment form with quick-delta chips, preset reasons and a live
 * "balance after / tier after" preview that blocks a negative result before the server
 * has to. Bottom: the full points ledger, filterable by movement type.
 */
export function MemberLoyaltySheet({ member, onClose, canManage }: MemberLoyaltySheetProps) {
  const { t } = useTranslation();
  const adjust = useAdjustLoyalty();

  const [delta, setDelta] = useState('');
  const [notes, setNotes] = useState('');
  const [filter, setFilter] = useState<TxFilter>('ALL');
  const [limit, setLimit] = useState(LEDGER_PAGE);

  const { data: ledger, isLoading, isFetching } = useMemberLedger(member?.userId ?? null, {
    type: filter === 'ALL' ? undefined : filter,
    pageSize: limit,
  });

  // Reset the draft whenever the sheet is pointed at a different member.
  useEffect(() => {
    setDelta('');
    setNotes('');
    setFilter('ALL');
    setLimit(LEDGER_PAGE);
  }, [member?.userId]);

  const tier = member?.tierLevel ?? 'SILVER';
  const style = TIER_STYLE[tier];
  const balance = member?.points ?? 0;
  const parsed = Number(delta);
  const deltaValid = delta.trim() !== '' && Number.isInteger(parsed) && parsed !== 0;
  const after = deltaValid ? balance + parsed : balance;
  const negative = deltaValid && after < 0;
  // Tier is driven by lifetime (positive) points only, so a deduction never demotes.
  const tierAfter = deltaValid && parsed > 0 && member ? tierForLifetimePoints(member.lifetimePoints + parsed) : tier;
  const progress = member ? tierProgress(member) : 0;
  const items = ledger?.items ?? [];
  const total = ledger?.total ?? 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!member) return;
    if (!deltaValid) {
      toast.error(t('loyalty.form.deltaInvalid'));
      return;
    }
    if (negative) {
      toast.error(t('loyalty.form.negative'));
      return;
    }
    if (!notes.trim()) {
      toast.error(t('loyalty.form.reasonRequired'));
      return;
    }
    adjust.mutate(
      { userId: member.userId, input: { points: parsed, notes: notes.trim() } },
      {
        onSuccess: () => {
          toast.success(t('loyalty.adjusted'));
          setDelta('');
          setNotes('');
        },
        onError: (err) => toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
      },
    );
  }

  return (
    <Sheet open={Boolean(member)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[560px]">
        <SheetHeader>
          <div className="flex items-center gap-3 pr-8">
            <PersonAvatar name={member?.userName ?? '—'} size={40} />
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-base">{member?.userName ?? '—'}</SheetTitle>
              <p className="truncate text-xs tabular-nums text-muted-foreground">{member?.userPhone}</p>
            </div>
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1',
                style.chip,
                style.ring,
              )}
            >
              <Gem className="h-3 w-3" aria-hidden="true" />
              {t(`loyalty.tier.${tier}`)}
            </span>
          </div>
        </SheetHeader>

        <SheetBody className="space-y-4 py-4">
          {/* Membership card */}
          <div
            className={cn(
              'relative overflow-hidden rounded-xl border border-border bg-card bg-gradient-to-br p-4 shadow-sm',
              style.gradient,
            )}
          >
            <Gem
              className={cn('pointer-events-none absolute -right-4 -top-4 h-24 w-24 opacity-10', style.text)}
              aria-hidden="true"
            />
            <p className="text-xs text-muted-foreground">{t('loyalty.sheet.balance')}</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
              {balance.toLocaleString()}{' '}
              <span className="text-sm font-medium text-muted-foreground">{t('loyalty.ptsUnit')}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {t('loyalty.sheet.worth')}{' '}
              <CurrencyText amount={balance * (member?.pointValueLak ?? 0)} className="font-medium text-foreground" />
            </p>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-2 text-2xs text-muted-foreground">
                <span>{t(`loyalty.tier.${tier}`)}</span>
                <span className="tabular-nums">
                  {member?.nextTier
                    ? t('loyalty.sheet.progress', {
                        lifetime: member.lifetimePoints.toLocaleString(),
                        target: LOYALTY_TIER_THRESHOLDS[member.nextTier].toLocaleString(),
                      })
                    : t('loyalty.topTier')}
                </span>
                <span>{member?.nextTier ? t(`loyalty.tier.${member.nextTier}`) : ''}</span>
              </div>
              <div
                className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
                aria-label={t('loyalty.col.progress')}
              >
                <div
                  className={cn('h-full rounded-full transition-[width] duration-700 ease-out', style.bar)}
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              {member?.nextTier ? (
                <p className="mt-1 text-2xs text-muted-foreground">
                  {t('loyalty.toNext', {
                    points: member.pointsToNextTier?.toLocaleString(),
                    tier: t(`loyalty.tier.${member.nextTier}`),
                  })}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <SummaryTile
              icon={TrendingUp}
              tone="success"
              label={t('loyalty.col.lifetime')}
              value={(member?.lifetimePoints ?? 0).toLocaleString()}
            />
            <SummaryTile
              icon={Gift}
              tone="info"
              label={t('loyalty.col.redeemed')}
              value={(member?.redeemedPoints ?? 0).toLocaleString()}
            />
            <SummaryTile
              icon={CalendarClock}
              tone="primary"
              label={t('loyalty.col.lastActivity')}
              value={
                member?.lastActivityAt ? (
                  <DateTimeText value={member.lastActivityAt} />
                ) : (
                  <span className="text-muted-foreground">{t('loyalty.never')}</span>
                )
              }
              hint={
                member ? (
                  <>
                    {t('loyalty.sheet.memberSince')} <DateTimeText value={member.memberSince} />
                  </>
                ) : undefined
              }
            />
          </div>

          {canManage ? (
            <form className="space-y-3 rounded-lg border border-border bg-muted/30 p-3" onSubmit={submit}>
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <p className="text-xs font-semibold text-foreground">{t('loyalty.adjustTitle')}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="loyalty-delta">{t('loyalty.pointsDelta')}</Label>
                <Input
                  id="loyalty-delta"
                  type="number"
                  step="1"
                  inputMode="numeric"
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                  placeholder={t('loyalty.pointsDeltaHint')}
                  aria-invalid={negative || undefined}
                  aria-describedby="loyalty-delta-hint"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  {QUICK_DELTAS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={d < 0 && balance + d < 0}
                      onClick={() => setDelta(String(d))}
                      className={cn(
                        'cursor-pointer rounded-full border border-border bg-card px-2 py-0.5 text-2xs font-medium tabular-nums transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
                        d > 0
                          ? 'text-success hover:border-success/40 hover:bg-success/5'
                          : 'text-destructive hover:border-destructive/40 hover:bg-destructive/5',
                      )}
                    >
                      {d > 0 ? `+${d}` : `−${Math.abs(d)}`}
                    </button>
                  ))}
                </div>
                <p
                  id="loyalty-delta-hint"
                  className={cn('text-2xs', negative ? 'text-destructive' : 'text-muted-foreground')}
                  role={negative ? 'alert' : undefined}
                >
                  {negative
                    ? t('loyalty.form.negative')
                    : t('loyalty.form.after', {
                        points: after.toLocaleString(),
                        tier: t(`loyalty.tier.${tierAfter}`),
                      })}
                  {!negative && tierAfter !== tier ? (
                    <span className={cn('ml-1 font-medium', TIER_STYLE[tierAfter].text)}>
                      {t('loyalty.form.tierUp')}
                    </span>
                  ) : null}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="loyalty-notes">{t('loyalty.reason')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {REASON_PRESETS.map((r) => {
                    const text = t(`loyalty.form.presets.${r}`);
                    const on = notes === text;
                    return (
                      <button
                        key={r}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setNotes(text)}
                        className={cn(
                          'cursor-pointer rounded-full px-2 py-0.5 text-2xs font-medium transition-colors duration-150',
                          on ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground ring-1 ring-border hover:text-foreground',
                        )}
                      >
                        {text}
                      </button>
                    );
                  })}
                </div>
                <Textarea
                  id="loyalty-notes"
                  rows={2}
                  maxLength={500}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('loyalty.form.reasonPlaceholder')}
                />
              </div>

              <Button
                type="submit"
                size="sm"
                className="w-full"
                disabled={adjust.isPending || !deltaValid || negative || !notes.trim()}
              >
                {t('loyalty.form.submit')}
              </Button>
            </form>
          ) : null}

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <p className="text-xs font-semibold text-foreground">{t('loyalty.sheet.history')}</p>
                <span className="text-2xs text-muted-foreground">({total.toLocaleString()})</span>
              </div>
              <div className="flex items-center gap-1">
                {FILTERS.map((f) => {
                  const isActive = filter === f;
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => {
                        setFilter(f);
                        setLimit(LEDGER_PAGE);
                      }}
                      aria-pressed={isActive}
                      className={cn(
                        'cursor-pointer rounded-full px-2 py-0.5 text-2xs font-medium transition-colors duration-150',
                        isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {f === 'ALL' ? t('loyalty.txType.ALL') : t(`loyalty.txType.${f}`)}
                    </button>
                  );
                })}
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-[56px] animate-pulse rounded-lg border border-border bg-muted/40" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <EmptyState icon={History} title={t('loyalty.sheet.noHistory')} className="py-8" />
            ) : (
              <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                {items.map((tx, i) => {
                  const s = TX_STYLE[tx.type];
                  const Icon = s.icon;
                  const positive = tx.points > 0;
                  return (
                    <li
                      key={tx.id}
                      className="flex items-center gap-2.5 px-3 py-2.5 animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 ease-out motion-reduce:animate-none"
                      style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                    >
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', s.chip)}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">
                          {tx.notes || t(`loyalty.txType.${tx.type}`)}
                        </p>
                        <p className="truncate text-2xs text-muted-foreground">
                          {tx.notes ? `${t(`loyalty.txType.${tx.type}`)} · ` : null}
                          <DateTimeText value={tx.createdAt} mode="datetime" />
                        </p>
                      </div>
                      <span
                        className={cn(
                          'inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold tabular-nums',
                          positive ? 'text-success' : 'text-destructive',
                        )}
                      >
                        {positive ? (
                          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {positive ? '+' : '−'}
                        {Math.abs(tx.points).toLocaleString()}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}

            {items.length < total ? (
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                disabled={isFetching}
                onClick={() => setLimit((l) => l + LEDGER_PAGE)}
              >
                {t('loyalty.sheet.loadMore', { shown: items.length, total })}
              </Button>
            ) : null}
          </div>
        </SheetBody>

        <SheetFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function SummaryTile({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  tone: 'success' | 'info' | 'primary';
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-2.5 shadow-sm">
      <span
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-md',
          tone === 'success' && 'bg-success-soft text-success',
          tone === 'info' && 'bg-info-soft text-info',
          tone === 'primary' && 'bg-primary/10 text-primary',
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <p className="mt-1.5 truncate text-2xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold tabular-nums text-foreground">{value}</p>
      {hint ? <p className="truncate text-2xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
