import type { ExpenseCategoryView, ExpenseView } from '@abcp/shared-types';
import { Banknote, Check, Inbox, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CurrencyText } from '@/components/shared';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TONE } from '@/features/payroll/payroll.lib';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

import { CategoryGlyph, DueChip, ExpenseMarkers, ExpenseStatusPill, WaitingChip } from './expense.parts';
import { BOARD_LANES, categoryColor, categoryName } from './expenses.lib';

interface Props {
  rows: ExpenseView[];
  total: number;
  loading: boolean;
  categories: ExpenseCategoryView[];
  lang: 'lo' | 'en';
  currentUserId: string | undefined;
  isSuper: boolean;
  canManage: boolean;
  canApprove: boolean;
  busy: boolean;
  onOpen: (e: ExpenseView) => void;
  onSubmit: (ids: string[]) => void;
  onApprove: (ids: string[]) => void;
  onPay: (ids: string[]) => void;
}

/**
 * Board view — the approval pipeline as four lanes (with the author → awaiting approval → approved,
 * unpaid → paid). Each lane states its count and value, so a bottleneck is visible as a tall column
 * before any card is read, and every card carries the one action that moves it right.
 */
export function ExpenseBoard(p: Props) {
  const { t } = useTranslation();

  if (p.loading) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {BOARD_LANES.map((l) => (
          <Skeleton key={l.key} className="h-[420px] rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {p.total > p.rows.length ? (
        <p className="text-2xs text-muted-foreground">{t('payTreasury.exp.boardTruncated', { shown: p.rows.length, total: p.total })}</p>
      ) : null}
      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-4">
        {BOARD_LANES.map((lane, li) => {
          const cards = p.rows.filter((e) => lane.statuses.includes(e.status));
          const sum = cards.reduce((s, e) => s + e.amountBase, 0);
          const tone = TONE[lane.tone];
          return (
            <section
              key={lane.key}
              aria-labelledby={`lane-${lane.key}`}
              className="flex max-h-[calc(100vh-240px)] min-h-[240px] flex-col overflow-hidden rounded-xl border border-border bg-muted/30 animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 motion-reduce:animate-none"
              style={{ animationDelay: `${li * 50}ms` }}
            >
              <header className="border-b border-border bg-card/80 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 id={`lane-${lane.key}`} className="flex items-center gap-1.5 text-sm font-semibold">
                    <span className={cn('h-2 w-2 rounded-full', tone.bar)} aria-hidden="true" />
                    {t(`payTreasury.exp.lane.${lane.key}`)}
                  </h3>
                  <span className={cn('rounded-full px-2 py-0.5 text-2xs font-semibold tabular-nums', tone.chip)}>{cards.length}</span>
                </div>
                <p className="mt-0.5 text-2xs text-muted-foreground">
                  <CurrencyText amount={sum} className="font-medium text-foreground" />
                </p>
              </header>
              <ul className="flex-1 space-y-2 overflow-y-auto p-2">
                {cards.length === 0 ? (
                  <li className="flex flex-col items-center justify-center gap-1 py-10 text-center text-2xs text-muted-foreground">
                    <Inbox className="h-5 w-5 opacity-60" aria-hidden="true" />
                    {t('payTreasury.exp.laneEmpty')}
                  </li>
                ) : (
                  cards.map((e) => <BoardCard key={e.id} e={e} {...p} />)
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function BoardCard({ e, ...p }: { e: ExpenseView } & Props) {
  const { t } = useTranslation();
  const own = e.createdBy.id === p.currentUserId && !p.isSuper;
  const overLimit = e.needsOwnerApproval && !p.isSuper;
  const action =
    p.canManage && (e.status === 'DRAFT' || e.status === 'REJECTED')
      ? { icon: Send, label: t('payTreasury.exp.submit'), run: () => p.onSubmit([e.id]), disabled: false }
      : p.canApprove && e.status === 'SUBMITTED'
        ? {
            icon: Check,
            label: own ? t('payTreasury.exp.ownClaim') : overLimit ? t('payTreasury.exp.overLimitTitle') : t('payTreasury.exp.approve'),
            run: () => p.onApprove([e.id]),
            disabled: own || overLimit,
          }
        : p.canApprove && e.status === 'APPROVED'
          ? { icon: Banknote, label: t('payTreasury.exp.markPaid'), run: () => p.onPay([e.id]), disabled: false }
          : null;

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={() => p.onOpen(e)}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            p.onOpen(e);
          }
        }}
        className="group cursor-pointer rounded-lg border border-border bg-card p-2.5 shadow-xs transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <div className="flex items-start gap-2">
          <CategoryGlyph code={e.category.code} color={categoryColor(e.category.id, p.categories)} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-xs">
              <span className="truncate text-sm font-medium">{e.title}</span>
              <ExpenseMarkers expense={e} />
            </p>
            <p className="truncate text-2xs text-muted-foreground">
              {categoryName(e.category, p.lang)} · {formatDate(e.expenseDate)}
            </p>
          </div>
        </div>
        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <span className="flex items-center gap-1 text-2xs text-muted-foreground">
              <PersonAvatar name={e.createdBy.name} size={16} />
              <span className="truncate">{e.createdBy.name}</span>
              {p.isSuper ? <span className="truncate">· {e.branchName}</span> : null}
            </span>
            {e.status === 'REJECTED' ? <ExpenseStatusPill status="REJECTED" /> : <WaitingChip expense={e} />}
            <DueChip expense={e} />
          </div>
          <CurrencyText amount={e.amount} currency={e.currency as 'LAK'} className="shrink-0 text-sm font-semibold" />
        </div>
        {action ? (
          <Button
            size="sm"
            variant="secondary"
            className="mt-2 h-7 w-full text-2xs"
            disabled={p.busy || action.disabled}
            title={action.label}
            onClick={(ev) => {
              ev.stopPropagation();
              action.run();
            }}
          >
            <action.icon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            {action.label}
          </Button>
        ) : null}
      </div>
    </li>
  );
}
