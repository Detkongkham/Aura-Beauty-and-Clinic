import type { ExpenseStatus, ExpenseView } from '@abcp/shared-types';
import { CalendarClock, Check, Clock3, Coins, Paperclip, Repeat, Split, TriangleAlert, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { TONE } from '@/features/payroll/payroll.lib';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

import { EXPENSE_STATUS_TONE, ageDays, ageTone, categoryIcon, daysUntil, waitingSince } from './expenses.lib';
import { todayKey } from './treasury.lib';

/** Status pill — leading dot + word, never colour alone. */
export function ExpenseStatusPill({ status, className }: { status: ExpenseStatus; className?: string }) {
  const { t } = useTranslation();
  const tone = TONE[EXPENSE_STATUS_TONE[status]];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-medium',
        tone.chip,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone.bar)} aria-hidden="true" />
      {t(`payTreasury.exp.status.${status}`)}
    </span>
  );
}

/** Category glyph in a tinted square — the row's visual anchor in lists and cards. */
export function CategoryGlyph({
  code,
  color,
  size = 'md',
}: {
  code: string | undefined;
  /** CSS colour (chart token) — tints the square so a category reads the same across views. */
  color?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const Icon = categoryIcon(code);
  const box = size === 'lg' ? 'h-11 w-11 rounded-xl' : size === 'sm' ? 'h-7 w-7 rounded-md' : 'h-9 w-9 rounded-lg';
  const icon = size === 'lg' ? 'h-5 w-5' : size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <span
      className={cn('relative flex shrink-0 items-center justify-center overflow-hidden', box)}
      style={{ color: color ?? 'hsl(var(--primary))' }}
      aria-hidden="true"
    >
      <span className="absolute inset-0 bg-current opacity-[0.12]" />
      <Icon className={cn('relative', icon)} />
    </span>
  );
}

/**
 * "Waiting 4d" on anything sitting in the approval or payment queue. Colour escalates with age, and
 * the words carry the meaning on their own.
 */
export function WaitingChip({ expense, className }: { expense: Pick<ExpenseView, 'status' | 'submittedAt' | 'approvedAt' | 'createdAt'>; className?: string }) {
  const { t } = useTranslation();
  const since = waitingSince(expense);
  const days = ageDays(since);
  if (days == null) return null;
  const tone = TONE[ageTone(days)];
  return (
    <span
      className={cn('inline-flex items-center gap-1 whitespace-nowrap text-2xs', tone.text, className)}
      title={since ? formatDateTime(since) : undefined}
    >
      <Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />
      {days === 0 ? t('payTreasury.exp.waitingToday') : t('payTreasury.exp.waitingDays', { count: days })}
    </span>
  );
}

/** Small inline markers after a title: receipts count / missing receipt / from a recurring rule. */
export function ExpenseMarkers({ expense }: { expense: Pick<ExpenseView, 'attachments' | 'status' | 'recurringExpenseId' | 'allocations' | 'paidFromCashFund'> }) {
  const { t } = useTranslation();
  const n = expense.attachments.length;
  const needsReceipt = n === 0 && expense.status !== 'DRAFT' && expense.status !== 'REJECTED';
  return (
    <>
      {n > 0 ? (
        <span className="inline-flex shrink-0 items-center gap-0.5 text-muted-foreground" title={t('payTreasury.exp.receiptCount', { count: n })}>
          <Paperclip className="h-3 w-3" aria-hidden="true" />
          <span className="tabular-nums">{n}</span>
          <span className="sr-only">{t('payTreasury.exp.receiptCount', { count: n })}</span>
        </span>
      ) : needsReceipt ? (
        <span className="inline-flex shrink-0 items-center gap-0.5 text-warning" title={t('payTreasury.exp.flag.missingReceipt')}>
          <TriangleAlert className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">{t('payTreasury.exp.flag.missingReceipt')}</span>
        </span>
      ) : null}
      {expense.allocations.length > 0 ? (
        <span className="inline-flex shrink-0 items-center text-primary" title={t('payTreasury.exp.splitAcross', { count: expense.allocations.length })}>
          <Split className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">{t('payTreasury.exp.splitAcross', { count: expense.allocations.length })}</span>
        </span>
      ) : null}
      {expense.paidFromCashFund ? (
        <span className="inline-flex shrink-0 items-center text-muted-foreground" title={expense.paidFromCashFund.name}>
          <Coins className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">{expense.paidFromCashFund.name}</span>
        </span>
      ) : null}
      {expense.recurringExpenseId ? (
        <span className="inline-flex shrink-0 items-center text-info" title={t('payTreasury.exp.fromRecurring')}>
          <Repeat className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">{t('payTreasury.exp.fromRecurring')}</span>
        </span>
      ) : null}
    </>
  );
}

type StepState = 'done' | 'current' | 'rejected' | 'todo';

/**
 * Workflow stepper for the detail sheet: Created → Submitted → Approved → Paid. Each finished step
 * says who and when; a rejection replaces the approval step in red with the reason nearby.
 */
export function WorkflowStepper({ expense: e }: { expense: ExpenseView }) {
  const { t } = useTranslation();
  const order: ExpenseStatus[] = ['DRAFT', 'SUBMITTED', 'APPROVED', 'PAID'];
  const reached = e.status === 'REJECTED' ? 1 : order.indexOf(e.status);

  const steps: { key: string; label: string; state: StepState; when?: string | null; who?: string | null }[] = [
    { key: 'created', label: t('payTreasury.exp.step.created'), state: 'done', when: e.createdAt, who: e.createdBy.name },
    {
      key: 'submitted',
      label: t('payTreasury.exp.step.submitted'),
      state: reached >= 1 ? 'done' : 'current',
      when: reached >= 1 ? e.submittedAt : null,
    },
    e.status === 'REJECTED'
      ? {
          key: 'rejected',
          label: t('payTreasury.exp.step.rejected'),
          state: 'rejected',
          when: e.approvedAt,
          who: e.approvedBy?.name,
        }
      : {
          key: 'approved',
          label: t('payTreasury.exp.step.approved'),
          state: reached >= 2 ? 'done' : reached === 1 ? 'current' : 'todo',
          when: reached >= 2 ? e.approvedAt : null,
          who: reached >= 2 ? e.approvedBy?.name : null,
        },
    {
      key: 'paid',
      label: t('payTreasury.exp.step.paid'),
      state: reached >= 3 ? 'done' : reached === 2 ? 'current' : 'todo',
      when: e.paidAt,
      who: e.paidFromAccount ? `${e.paidFromAccount.bankCode} · ${e.paidFromAccount.accountName}` : e.status === 'PAID' ? t('payTreasury.exp.cash') : null,
    },
  ];

  return (
    <ol className="relative grid grid-cols-4 gap-1" aria-label={t('payTreasury.exp.workflow')}>
      {steps.map((s, i) => (
        <li key={s.key} className="relative min-w-0 text-center" aria-current={s.state === 'current' ? 'step' : undefined}>
          {i > 0 ? (
            <span
              aria-hidden="true"
              className={cn(
                'absolute right-1/2 top-3 h-0.5 w-full -translate-y-1/2',
                s.state === 'done' ? 'bg-success' : s.state === 'rejected' ? 'bg-destructive/60' : 'bg-border',
              )}
            />
          ) : null}
          <span
            className={cn(
              'relative z-10 mx-auto flex h-6 w-6 items-center justify-center rounded-full border-2 text-2xs font-semibold',
              s.state === 'done' && 'border-success bg-success text-success-foreground',
              s.state === 'current' && 'border-warning bg-card text-warning',
              s.state === 'rejected' && 'border-destructive bg-destructive text-destructive-foreground',
              s.state === 'todo' && 'border-border bg-card text-muted-foreground',
            )}
          >
            {s.state === 'done' ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : s.state === 'rejected' ? (
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              i + 1
            )}
          </span>
          <p
            className={cn(
              'mt-1 truncate text-2xs font-medium',
              s.state === 'todo' ? 'text-muted-foreground' : s.state === 'rejected' ? 'text-destructive' : 'text-foreground',
            )}
          >
            {s.label}
          </p>
          {s.when ? <p className="truncate text-2xs tabular-nums text-muted-foreground">{formatDateTime(s.when)}</p> : null}
          {s.who ? <p className="truncate text-2xs text-muted-foreground">{s.who}</p> : null}
        </li>
      ))}
    </ol>
  );
}

/** "Due in 3d" / "Overdue 2d" for anything still owed. Silent once paid, voided or without a due date. */
export function DueChip({ expense, className }: { expense: Pick<ExpenseView, 'status' | 'dueDate' | 'isOverdue'>; className?: string }) {
  const { t } = useTranslation();
  if (expense.status !== 'SUBMITTED' && expense.status !== 'APPROVED') return null;
  const d = daysUntil(expense.dueDate, todayKey());
  if (d == null || d > 7) return null;
  const tone = d < 0 ? TONE.danger : d <= 2 ? TONE.warning : TONE.neutral;
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap text-2xs font-medium', tone.text, className)}>
      <CalendarClock className="h-3 w-3 shrink-0" aria-hidden="true" />
      {d < 0 ? t('payTreasury.exp.overdueShort', { count: -d }) : d === 0 ? t('payTreasury.exp.dueToday') : t('payTreasury.exp.dueIn', { count: d })}
    </span>
  );
}
