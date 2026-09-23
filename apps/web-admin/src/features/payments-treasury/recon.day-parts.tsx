import {
  VARIANCE_RESOLUTIONS,
  type ReconciliationLineView,
  type ReconciliationRow,
  type StatementHistoryEntry,
  type VarianceResolution,
} from '@abcp/shared-types';
import {
  BadgeCheck,
  ChevronDown,
  EyeOff,
  FileSpreadsheet,
  History,
  Link2,
  Link2Off,
  RotateCcw,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { CurrencyText } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { TONE } from '@/features/payroll/payroll.lib';
import { formatDate, formatDateTime, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import {
  useLineAction,
  useLineCandidates,
  useReopenStatement,
  useResolveStatement,
  useStatementHistory,
} from './reconciliation.api';
import { SignedAmount } from './recon.parts';

const errMsg = (e: unknown, fallback: string) => (e instanceof NormalizedApiError ? e.message : fallback);

// ── G3: explain / approve a difference ───────────────────────────────

/**
 * A difference is either fixed (enter the right figure) or explained here with a reason
 * and approved by someone other than the person who entered the statement. Explained
 * days count as done for month-end close; the reason stays on the row and in the CSV.
 */
export function ResolutionPanel({
  row,
  canReconcile,
  selfEntered,
}: {
  row: ReconciliationRow;
  canReconcile: boolean;
  /** The current user entered this statement (maker ≠ checker applies). */
  selfEntered: boolean;
}) {
  const { t } = useTranslation();
  const resolve = useResolveStatement();
  const reopen = useReopenStatement();
  const [reason, setReason] = useState<VarianceResolution | null>(null);
  const [note, setNote] = useState('');

  if (!row.statementId || (row.status !== 'VARIANCE' && row.status !== 'RESOLVED')) return null;

  if (row.status === 'RESOLVED') {
    return (
      <section className={cn('rounded-lg border px-3.5 py-3', 'border-info/30 bg-info-soft/40')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-xs">
            <p className="flex items-center gap-1.5 font-semibold text-info">
              <BadgeCheck className="h-4 w-4" aria-hidden="true" />
              {t('payTreasury.recon.resolvedAs', { reason: t(`payTreasury.recon.resolution.${row.resolution}`) })}
            </p>
            {row.resolutionNote ? <p className="mt-1 text-foreground">{row.resolutionNote}</p> : null}
            <p className="mt-1 text-2xs text-muted-foreground">
              {t('payTreasury.recon.resolvedBy', {
                name: row.resolvedByName ?? '—',
                at: row.resolvedAt ? formatDateTime(row.resolvedAt) : '—',
              })}
            </p>
          </div>
          {canReconcile && !row.locked ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs"
              disabled={reopen.isPending}
              onClick={() =>
                reopen.mutate(row.statementId!, {
                  onSuccess: () => toast.success(t('payTreasury.recon.reopened')),
                  onError: (e) => toast.error(errMsg(e, t('common.saveError'))),
                })
              }
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              {t('payTreasury.recon.reopen')}
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  if (!canReconcile || row.locked) return null;
  const blocked = selfEntered;
  const needNote = reason === 'OTHER' && !note.trim();

  return (
    <section className="rounded-lg border border-border px-3.5 py-3" aria-labelledby="recon-resolve">
      <h3 id="recon-resolve" className="text-xs font-semibold">
        {t('payTreasury.recon.resolveTitle')}
      </h3>
      <p className="mt-0.5 text-2xs text-muted-foreground">{t('payTreasury.recon.resolveHint')}</p>
      <div role="radiogroup" aria-label={t('payTreasury.recon.resolveTitle')} className="mt-2 flex flex-wrap gap-1.5">
        {VARIANCE_RESOLUTIONS.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={reason === r}
            onClick={() => setReason(r)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              reason === r ? cn(TONE.info.chip, 'border-transparent ring-1', TONE.info.ring) : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`payTreasury.recon.resolution.${r}`)}
          </button>
        ))}
      </div>
      <Textarea
        className="mt-2"
        rows={2}
        maxLength={300}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t('payTreasury.recon.resolveNotePlaceholder')}
        aria-label={t('payTreasury.recon.resolveNote')}
      />
      {blocked ? (
        <p className="mt-1.5 flex items-center gap-1 text-2xs text-warning">
          <ShieldAlert className="h-3 w-3" aria-hidden="true" />
          {t('payTreasury.recon.makerChecker')}
        </p>
      ) : null}
      <div className="mt-2 flex justify-end">
        <Button
          size="sm"
          disabled={!reason || needNote || blocked || resolve.isPending}
          onClick={() =>
            resolve.mutate(
              { id: row.statementId!, input: { resolution: reason!, note: note.trim() || undefined } },
              {
                onSuccess: () => {
                  toast.success(t('payTreasury.recon.resolvedToast'));
                  setReason(null);
                  setNote('');
                },
                onError: (e) => toast.error(errMsg(e, t('common.saveError'))),
              },
            )
          }
        >
          <BadgeCheck className="mr-1 h-4 w-4" aria-hidden="true" />
          {t('payTreasury.recon.approveExplanation')}
        </Button>
      </div>
    </section>
  );
}

// ── G1: statement lines + matching ───────────────────────────────────

export function StatementLinesSection({
  lines,
  currency,
  canReconcile,
  locked,
  describeMatch,
}: {
  lines: ReconciliationLineView[];
  currency: string;
  canReconcile: boolean;
  locked: boolean;
  /** Human label for the system record a line is matched to. */
  describeMatch: (kind: 'TX' | 'EXPENSE' | 'REFUND', id: string) => string | null;
}) {
  const { t } = useTranslation();
  const act = useLineAction();
  const [finding, setFinding] = useState<string | null>(null);
  if (!lines.length) return null;
  const unmatched = lines.filter((l) => l.matchStatus === 'UNMATCHED').length;
  const editable = canReconcile && !locked;
  const run = (a: Parameters<typeof act.mutate>[0], okMsg: string) =>
    act.mutate(a, {
      onSuccess: () => {
        toast.success(okMsg);
        setFinding(null);
      },
      onError: (e) => toast.error(errMsg(e, t('common.saveError'))),
    });

  return (
    <section className="rounded-lg border border-border px-3.5 py-2.5" aria-labelledby="recon-lines">
      <h3 id="recon-lines" className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
          {t('payTreasury.recon.linesTitle')}
          <span className="rounded-full bg-muted px-1.5 text-2xs font-medium tabular-nums">{lines.length}</span>
        </span>
        <span className={cn('text-2xs font-medium', unmatched ? 'text-warning' : 'text-success')}>
          {unmatched ? t('payTreasury.recon.unmatchedCount', { count: unmatched }) : t('payTreasury.recon.allLinesMatched')}
        </span>
      </h3>
      <ul className="mt-1 divide-y divide-border/70">
        {lines.map((l) => {
          const matchedLabel = l.matchedKind && l.matchedId ? describeMatch(l.matchedKind, l.matchedId) : null;
          return (
            <li key={l.id} className="py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{l.description ?? '—'}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-2xs text-muted-foreground">
                    {l.postedAt ? <span className="tabular-nums">{formatTime(l.postedAt)}</span> : null}
                    {l.reference ? <span className="truncate font-mono">{l.reference}</span> : null}
                    <LineStatus line={l} />
                    {matchedLabel ? <span className="truncate">→ {matchedLabel}</span> : null}
                  </p>
                </div>
                <span className={cn('shrink-0 text-sm font-semibold tabular-nums', l.direction === 'DEBIT' && 'text-foreground/80')}>
                  {l.direction === 'CREDIT' ? '+' : '−'}
                  <CurrencyText amount={l.amount} currency={currency as 'LAK'} />
                </span>
              </div>
              {editable ? (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {l.matchStatus === 'UNMATCHED' ? (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-6 px-2 text-2xs"
                        aria-expanded={finding === l.id}
                        onClick={() => setFinding(finding === l.id ? null : l.id)}
                      >
                        <Search className="mr-1 h-3 w-3" aria-hidden="true" />
                        {t('payTreasury.recon.findMatch')}
                        <ChevronDown className={cn('ml-0.5 h-3 w-3 transition-transform', finding === l.id && 'rotate-180')} aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-2xs"
                        disabled={act.isPending}
                        onClick={() => run({ lineId: l.id, action: 'ignore' }, t('payTreasury.recon.lineIgnored'))}
                        title={t('payTreasury.recon.ignoreHint')}
                      >
                        <EyeOff className="mr-1 h-3 w-3" aria-hidden="true" />
                        {t('payTreasury.recon.ignore')}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-2xs"
                      disabled={act.isPending}
                      onClick={() => run({ lineId: l.id, action: 'unmatch' }, t('payTreasury.recon.lineUnmatched'))}
                    >
                      <Link2Off className="mr-1 h-3 w-3" aria-hidden="true" />
                      {l.matchStatus === 'IGNORED' ? t('payTreasury.recon.restore') : t('payTreasury.recon.unmatch')}
                    </Button>
                  )}
                </div>
              ) : null}
              {finding === l.id ? (
                <Candidates
                  lineId={l.id}
                  currency={currency}
                  busy={act.isPending}
                  describe={describeMatch}
                  onPick={(kind, id) => run({ lineId: l.id, action: 'match', target: { kind, id } }, t('payTreasury.recon.lineMatched'))}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LineStatus({ line }: { line: ReconciliationLineView }) {
  const { t } = useTranslation();
  const tone = line.matchStatus === 'MATCHED' ? 'success' : line.matchStatus === 'IGNORED' ? 'neutral' : 'warning';
  const Icon = line.matchStatus === 'MATCHED' ? Link2 : line.matchStatus === 'IGNORED' ? EyeOff : Link2Off;
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded px-1.5 py-px font-medium', TONE[tone].chip)}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {line.matchStatus === 'MATCHED'
        ? line.autoMatched
          ? t('payTreasury.recon.lineAuto')
          : t('payTreasury.recon.lineManual')
        : t(`payTreasury.recon.lineStatus.${line.matchStatus}`)}
    </span>
  );
}

function Candidates({
  lineId,
  currency,
  busy,
  describe,
  onPick,
}: {
  lineId: string;
  currency: string;
  busy: boolean;
  describe: (kind: 'TX' | 'EXPENSE' | 'REFUND', id: string) => string | null;
  onPick: (kind: 'TX' | 'EXPENSE' | 'REFUND', id: string) => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useLineCandidates(lineId);
  if (isLoading) return <Skeleton className="mt-2 h-16 w-full" />;
  if (!data?.length) return <p className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-2xs text-muted-foreground">{t('payTreasury.recon.noCandidates')}</p>;
  return (
    <ul className="mt-2 space-y-1 rounded-md bg-muted/40 p-1.5" aria-label={t('payTreasury.recon.candidatesTitle')}>
      {data.map((c) => (
        <li key={`${c.kind}-${c.id}`} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-xs hover:bg-card">
          <span className="min-w-0">
            <span className="block truncate font-medium">{describe(c.kind, c.id) ?? t(`payTreasury.recon.kind.${c.kind}`)}</span>
            <span className="flex flex-wrap gap-x-2 text-2xs text-muted-foreground">
              <span className="tabular-nums">
                {formatDate(c.date)} {formatTime(c.at)}
              </span>
              {c.reference ? <span className="font-mono">{c.reference}</span> : null}
              {c.amountDiff > 0 ? (
                <span className="text-warning">
                  {t('payTreasury.recon.diffBy')} <CurrencyText amount={c.amountDiff} currency={currency as 'LAK'} />
                </span>
              ) : (
                <span className="text-success">{t('payTreasury.recon.exactAmount')}</span>
              )}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <CurrencyText amount={c.amount} currency={currency as 'LAK'} className="font-semibold tabular-nums" />
            <Button size="sm" className="h-6 px-2 text-2xs" disabled={busy} onClick={() => onPick(c.kind, c.id)}>
              {t('payTreasury.recon.match')}
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── G11: statement edit history ──────────────────────────────────────

const HISTORY_FIELDS = ['credit', 'debit', 'opening', 'closing', 'resolution', 'note'] as const;

export function HistorySection({ statementId }: { statementId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useStatementHistory(statementId, open);
  return (
    <section className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          <History className="h-3.5 w-3.5" aria-hidden="true" />
          {t('payTreasury.recon.historyTitle')}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open ? (
        <div className="border-t border-border px-3.5 py-2.5">
          {isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : !data?.length ? (
            <p className="text-2xs text-muted-foreground">{t('payTreasury.recon.historyEmpty')}</p>
          ) : (
            <ol className="relative space-y-3 border-l border-border pl-4">
              {data.map((h) => (
                <HistoryItem key={h.id} h={h} />
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </section>
  );
}

function HistoryItem({ h }: { h: StatementHistoryEntry }) {
  const { t } = useTranslation();
  const changes = HISTORY_FIELDS.filter((f) => h.newValue && f in h.newValue && (h.oldValue?.[f] ?? null) !== h.newValue[f]);
  return (
    <li className="text-2xs">
      <span className="absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" aria-hidden="true" />
      <p>
        <span className="font-semibold text-foreground">{t(`payTreasury.recon.historyAction.${h.action}`, { defaultValue: h.action })}</span>
        <span className="text-muted-foreground"> · {h.userName ?? '—'} · {formatDateTime(h.at)}</span>
      </p>
      {changes.length ? (
        <ul className="mt-0.5 space-y-0.5 text-muted-foreground">
          {changes.map((f) => (
            <li key={f} className="tabular-nums">
              {t(`payTreasury.recon.historyField.${f}`)}: {fmt(h.oldValue?.[f])} → <span className="text-foreground">{fmt(h.newValue?.[f])}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function fmt(v: unknown): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'number') return v.toLocaleString('en-US');
  return String(v);
}

// ── G4: balance checks ───────────────────────────────────────────────

/** Opening + in − out = closing, and today's opening = yesterday's closing. */
export function BalanceChecks({
  opening,
  closing,
  credit,
  debit,
  openingGap,
  currency,
}: {
  opening: number | null;
  closing: number | null;
  credit: number | null;
  debit: number | null;
  openingGap: number | null;
  currency: string;
}) {
  const { t } = useTranslation();
  const gap =
    opening != null && closing != null && credit != null && debit != null
      ? Math.round((closing - (opening + credit - debit)) * 100) / 100
      : null;
  if (gap == null && openingGap == null) return null;
  const ok = (v: number | null) => v == null || Math.abs(v) <= 0.01;
  return (
    <ul className="mt-2 space-y-1 text-2xs">
      {gap != null ? (
        <li className={cn('flex items-center justify-between gap-2 rounded px-2 py-1', ok(gap) ? TONE.success.chip : TONE.danger.chip)}>
          <span>{t('payTreasury.recon.balanceRoll')}</span>
          <span className="font-semibold tabular-nums">
            {ok(gap) ? t('payTreasury.recon.balanceOk') : <SignedAmount value={gap} currency={currency} className="text-inherit" />}
          </span>
        </li>
      ) : null}
      {openingGap != null ? (
        <li className={cn('flex items-center justify-between gap-2 rounded px-2 py-1', ok(openingGap) ? TONE.success.chip : TONE.danger.chip)}>
          <span>{t('payTreasury.recon.balanceContinuity')}</span>
          <span className="font-semibold tabular-nums">
            {ok(openingGap) ? t('payTreasury.recon.balanceOk') : <SignedAmount value={openingGap} currency={currency} className="text-inherit" />}
          </span>
        </li>
      ) : null}
    </ul>
  );
}
