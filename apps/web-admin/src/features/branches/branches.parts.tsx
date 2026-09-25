import { Info, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { TONE } from '@/features/payroll/payroll.lib';
import { formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

import { branchHue, type BranchIssue } from './branches.lib';


/** Branch code as a tinted tile — hue is stable per code so a branch keeps its colour everywhere. */
export function BranchMonogram({ code, name, size = 'md' }: { code: string; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const label = (code || name).replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || '·';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-xl font-bold tabular-nums ring-1 ring-inset',
        size === 'sm' && 'h-8 w-8 text-[10px]',
        size === 'md' && 'h-10 w-10 text-2xs',
        size === 'lg' && 'h-12 w-12 text-xs',
      )}
      style={{
        background: branchHue(code || name, 0.14),
        color: branchHue(code || name),
        ['--tw-ring-color' as string]: branchHue(code || name, 0.3),
      }}
    >
      {label}
    </span>
  );
}


/** Pulsing dot + "open until / opens at" — status is never colour alone. */
export function OpenPill({ isOpen, boundary, inactive, className }: { isOpen: boolean; boundary: string; inactive?: boolean; className?: string }) {
  const { t } = useTranslation();
  if (inactive) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground', className)}>
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" aria-hidden="true" />
        {t('branches.inactive')}
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-medium',
        isOpen ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning',
        className,
      )}
    >
      <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
        {isOpen ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
        ) : null}
        <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', isOpen ? 'bg-success' : 'bg-warning')} />
      </span>
      {isOpen ? t('branches.openUntil', { time: boundary }) : t('branches.opensAt', { time: boundary })}
    </span>
  );
}

/**
 * Utilisation meter — booked minutes over staffed capacity. Bands: <40% quiet (info),
 * 40–85% healthy (success), >85% stretched (warning). Figure printed beside the bar.
 */
export function UtilMeter({ value, className, showLabel = true }: { value: number | null; className?: string; showLabel?: boolean }) {
  const { t } = useTranslation();
  if (value == null) {
    return <span className={cn('text-2xs text-muted-foreground', className)}>{t('branches.util.noStaff')}</span>;
  }
  const pct = Math.round(value * 100);
  const tone = value > 0.85 ? 'warning' : value >= 0.4 ? 'success' : 'info';
  return (
    <span className={cn('flex min-w-0 items-center gap-2', className)} title={t(`branches.util.${tone}`)}>
      <span
        className="relative block h-1.5 min-w-10 flex-1 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(pct, 100)}
        aria-label={t('branches.util.label')}
      >
        <span
          className={cn('absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none', TONE[tone].bar)}
          style={{ width: `${Math.min(100, Math.max(pct, 2))}%` }}
        />
      </span>
      {showLabel ? <span className="shrink-0 text-2xs font-semibold tabular-nums">{pct}%</span> : null}
    </span>
  );
}

const ISSUE_ICON = { danger: OctagonAlert, warning: TriangleAlert, info: Info } as const;

/** One attention line — icon + sentence, tone-coded; optional trailing action. */
export function IssueLine({
  issue,
  action,
  compact,
  group,
}: {
  issue: BranchIssue;
  action?: ReactNode;
  compact?: boolean;
  /** When set, the line summarises the same issue across several branches (count text replaces per-branch values). */
  group?: string;
}) {
  const { t } = useTranslation();
  const Icon = ISSUE_ICON[issue.tone];
  const values = {
    ...issue.values,
    ...(issue.kind === 'unpaid' ? { amount: formatCurrency(Number(issue.values.amount ?? 0)) } : {}),
    ...(issue.kind === 'closureSoon' ? { date: formatDate(String(issue.values.date)) } : {}),
  };
  return (
    <p className={cn('flex items-start gap-2 text-xs', compact ? 'py-0.5' : 'rounded-md px-2.5 py-1.5', !compact && TONE[issue.tone].soft)}>
      <Icon className={cn('mt-px h-3.5 w-3.5 shrink-0', TONE[issue.tone].text)} aria-hidden="true" />
      <span className="min-w-0 flex-1 text-foreground">
        {group ? t(`branches.issueGroup.${issue.kind}`) : t(`branches.issue.${issue.kind}`, values)}
        {group ? <span className="ml-1 font-semibold">· {group}</span> : null}
      </span>
      {action}
    </p>
  );
}

export function Segmented({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn('flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-xs', className)}>
      {children}
    </div>
  );
}

export function SegButton({
  active,
  onClick,
  children,
  icon: Icon,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  icon?: LucideIcon;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-medium',
        'transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
        active ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {children}
      {count != null ? (
        <span
          className={cn(
            'rounded-full px-1.5 text-[10px] tabular-nums',
            active ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground',
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
