import type { ReconciliationView } from '@abcp/shared-types';
import { ArrowLeftRight, ChevronRight, Lightbulb, ReceiptText, Webhook } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { CurrencyText } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { formatDate, formatDateTime } from '@/lib/format';
import { NormalizedApiError } from '@/services/apiError';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';

import { useResolveBulk } from './reconciliation.api';
import type { TimingPair } from './reconciliation.lib';

const ISSUE_PREVIEW = 4;

/**
 * "Why the numbers may differ". Shows the two things in the system that
 * usually explain a gap before anyone phones the bank: slips still waiting
 * for review (money is in the bank, the bill is not settled yet) and webhook
 * events that were received but not booked. Hidden when there is nothing to show.
 */
export function ReconCausesPanel({
  view,
  canReviewSlips,
  timingPairs,
  canReconcile,
}: {
  view: ReconciliationView;
  canReviewSlips: boolean;
  /** G8 — adjacent −x / +x differences on one account (money crossed midnight). */
  timingPairs: TimingPair[];
  canReconcile: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const bulk = useResolveBulk();
  if (view.openSlips === 0 && view.issues.length === 0 && timingPairs.length === 0) return null;

  const issues = expanded ? view.issues : view.issues.slice(0, ISSUE_PREVIEW);
  const issueTotal = view.issues.reduce((n, i) => n + (i.amount ?? 0), 0);

  return (
    <section
      aria-labelledby="recon-causes"
      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none"
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Lightbulb className="h-4 w-4 text-accent" aria-hidden="true" />
        <h2 id="recon-causes" className="text-sm font-semibold">
          {t('payTreasury.recon.causes.title')}
        </h2>
        <span className="truncate text-xs text-muted-foreground">{t('payTreasury.recon.causes.hint')}</span>
      </header>

      {timingPairs.length > 0 ? (
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info">
              <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t('payTreasury.recon.causes.timingTitle', { count: timingPairs.length })}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('payTreasury.recon.causes.timingHint')}</p>
              <ul className="mt-1.5 divide-y divide-border/70 text-xs">
                {timingPairs.map((p) => (
                  <li key={`${p.a.statementId}-${p.b.statementId}`} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0">
                      <span className="font-medium">
                        {p.a.bankCode} {p.a.accountName}
                      </span>
                      <span className="text-muted-foreground">
                        {' '}
                        · {formatDate(p.a.date)} → {formatDate(p.b.date)} · <CurrencyText amount={p.amount} />
                      </span>
                    </span>
                    {canReconcile ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs"
                        disabled={bulk.isPending || p.a.locked || p.b.locked}
                        onClick={() =>
                          bulk.mutate(
                            {
                              statementIds: [p.a.statementId!, p.b.statementId!],
                              resolution: 'TIMING',
                              note: t('payTreasury.recon.causes.timingNote', { from: p.a.date, to: p.b.date }),
                            },
                            {
                              onSuccess: () => toast.success(t('payTreasury.recon.resolvedToast')),
                              onError: (e) => toast.error(e instanceof NormalizedApiError ? e.message : t('common.saveError')),
                            },
                          )
                        }
                      >
                        {t('payTreasury.recon.causes.markTiming')}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      <div className={cn('grid divide-y divide-border', view.openSlips > 0 && view.issues.length > 0 && 'lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:divide-x lg:divide-y-0')}>
        {view.openSlips > 0 ? (
          <div className="flex items-start gap-3 px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
              <ReceiptText className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t('payTreasury.recon.openSlips', { count: view.openSlips })}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('payTreasury.recon.openSlipsHint')}</p>
              {canReviewSlips ? (
                <Link
                  to={ROUTES.paymentsSlips}
                  className="mt-1.5 inline-flex items-center gap-0.5 text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  {t('payTreasury.recon.reviewSlips')}
                  <ChevronRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        {view.issues.length > 0 ? (
          <div className="px-4 py-3">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive-soft text-destructive">
                <Webhook className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
                  {t('payTreasury.recon.issues', { count: view.issues.length })}
                  {issueTotal > 0 ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      {t('payTreasury.recon.causes.issueTotal')} <CurrencyText amount={issueTotal} className="font-semibold text-foreground" />
                    </span>
                  ) : null}
                </p>
                <ul className="mt-1.5 divide-y divide-border/70 text-xs">
                  {issues.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="rounded bg-muted px-1.5 py-px font-mono text-2xs">{i.providerCode}</span>
                          <span className="truncate font-medium">
                            {i.result
                              ? t(`payTreasury.recon.issue.${i.result}`, { defaultValue: i.result })
                              : t('payTreasury.recon.issue.STUCK')}
                          </span>
                        </span>
                        {i.reference ? (
                          <span className="mt-0.5 block truncate font-mono text-2xs text-muted-foreground">{i.reference}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-right tabular-nums">
                        {i.amount != null ? <CurrencyText amount={i.amount} className="block font-semibold" /> : null}
                        <span className="text-2xs text-muted-foreground">{formatDateTime(i.createdAt)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                {view.issues.length > ISSUE_PREVIEW ? (
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="mt-1 text-2xs font-medium text-primary underline-offset-2 hover:underline"
                    aria-expanded={expanded}
                  >
                    {expanded
                      ? t('payTreasury.recon.causes.showLess')
                      : t('payTreasury.recon.causes.showAll', { count: view.issues.length })}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
