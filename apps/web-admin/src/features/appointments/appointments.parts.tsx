import type { AppointmentStatus } from '@abcp/shared-types';
import {
  AlarmClock,
  CalendarX2,
  CircleAlert,
  Clock3,
  Footprints,
  Globe,
  House,
  MessageSquareText,
  Star,
  TriangleAlert,
  UserCog,
  type LucideIcon,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AppointmentListItem } from '@/types/models';

import {
  RANK_COLORS,
  STATUS_COLOR,
  TONE,
  flagsOf,
  payState,
  type RowFlags,
  type Tone,
} from './appointments.lib';

/**
 * Compact KPI tile — tone bar on the left edge, icon chip, label + figure.
 * Clickable tiles act as filters and expose `aria-pressed`.
 *
 * Motion follows the house count-card convention (MASTER §6): fade + rise on
 * mount staggered by `index`, lift on hover, dip on press, all suppressed under
 * `prefers-reduced-motion`.
 */
export function StatTile({
  icon: Icon,
  tone,
  label,
  value,
  hint,
  delta,
  index = 0,
  onClick,
  active = false,
  title,
}: {
  icon: LucideIcon;
  tone: Tone;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  delta?: { label: string; good: boolean | null } | null;
  index?: number;
  onClick?: () => void;
  active?: boolean;
  title?: string;
}) {
  const c = TONE[tone];
  const className = cn(
    'group relative flex min-w-0 items-center gap-2.5 overflow-hidden rounded-lg border bg-card py-2.5 pl-3.5 pr-2.5 text-left shadow-sm',
    'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
    onClick &&
      'cursor-pointer transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm motion-reduce:transition-none motion-reduce:hover:translate-y-0',
    active ? cn('ring-1', c.ring) : 'border-border',
  );
  const style: CSSProperties | undefined =
    index > 0 ? { animationDelay: `${Math.min(index, 12) * 45}ms` } : undefined;

  const body = (
    <>
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', c.bar)} />
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', c.chip)}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="flex items-baseline gap-1.5">
          <span className="truncate text-lg font-semibold leading-tight tabular-nums">{value}</span>
          {delta ? (
            <span
              className={cn(
                'shrink-0 text-2xs font-semibold tabular-nums',
                delta.good == null
                  ? 'text-muted-foreground'
                  : delta.good
                    ? 'text-success'
                    : 'text-destructive',
              )}
            >
              {delta.label}
            </span>
          ) : null}
        </p>
        {hint ? <p className="truncate text-2xs text-muted-foreground">{hint}</p> : null}
      </div>
    </>
  );

  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={active} title={title} className={className} style={style}>
      {body}
    </button>
  ) : (
    <div className={className} style={style} title={title}>
      {body}
    </div>
  );
}

const FLAG_META: Record<
  Exclude<keyof RowFlags, 'unrated'>,
  { icon: LucideIcon; tone: Tone; key: string }
> = {
  conflict: { icon: CalendarX2, tone: 'danger', key: 'appointments.flagConflict' },
  overdue: { icon: CircleAlert, tone: 'danger', key: 'appointments.flagOverdue' },
  needsDeposit: { icon: TriangleAlert, tone: 'warning', key: 'appointments.flagNeedsDeposit' },
  unconfirmed: { icon: AlarmClock, tone: 'warning', key: 'appointments.flagUnconfirmed' },
  soon: { icon: Clock3, tone: 'info', key: 'appointments.flagSoon' },
};

/** Icon + label chips for whichever attention flags a row carries. */
export function FlagChips({
  item,
  now,
  compact = false,
}: {
  item: AppointmentListItem;
  now?: number;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const flags = flagsOf(item, now);
  const shown = (Object.keys(FLAG_META) as (keyof typeof FLAG_META)[]).filter((k) => flags[k]);
  if (shown.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shown.map((k) => {
        const meta = FLAG_META[k];
        const Icon = meta.icon;
        return (
          <span
            key={k}
            title={t(meta.key)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-medium',
              TONE[meta.tone].chip,
            )}
          >
            <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
            {compact ? <span className="sr-only">{t(meta.key)}</span> : t(meta.key)}
          </span>
        );
      })}
    </span>
  );
}

const SOURCE_META: Record<string, { icon: LucideIcon; key: string }> = {
  ONLINE: { icon: Globe, key: 'appointments.sourceOnline' },
  WALK_IN: { icon: Footprints, key: 'appointments.walkIn' },
  ADMIN: { icon: UserCog, key: 'appointments.sourceAdmin' },
};

/** Channel + delivery + notes markers — the "how did this booking arrive" column. */
export function ChannelChips({ item }: { item: AppointmentListItem }) {
  const { t } = useTranslation();
  const src = SOURCE_META[item.source] ?? SOURCE_META.ONLINE!;
  const SrcIcon = src.icon;
  const chip =
    'inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-2xs font-medium text-muted-foreground';
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={chip} title={t(src.key)}>
        <SrcIcon className="h-3 w-3" aria-hidden="true" />
        {t(src.key)}
      </span>
      {item.deliveryType === 'HOME_SERVICE' ? (
        <span className={chip} title={t('appointments.homeService')}>
          <House className="h-3 w-3" aria-hidden="true" />
          {t('appointments.homeService')}
        </span>
      ) : null}
      {item.hasCustomerNotes || item.hasStaffNotes ? (
        <span className={chip} title={t('appointments.hasNotes')}>
          <MessageSquareText className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">{t('appointments.hasNotes')}</span>
        </span>
      ) : null}
    </span>
  );
}

/** Paid / partial / unpaid pill plus the deposit · balance detail line. */
export function PaymentCell({ item, align = 'right' }: { item: AppointmentListItem; align?: 'right' | 'left' }) {
  const { t } = useTranslation();
  const st = payState(item);
  const balance = Math.max(0, item.price - item.depositPaid);
  const needsDeposit = flagsOf(item).needsDeposit;
  const pill: { variant: BadgeProps['variant']; label: string } =
    st === 'paid'
      ? { variant: 'success', label: t('appointments.payPaid') }
      : st === 'partial'
        ? { variant: 'info', label: t('appointments.payPartial') }
        : { variant: 'warning', label: t('appointments.payUnpaid') };

  const parts: string[] = [];
  if (item.depositPaid > 0) parts.push(`${t('appointments.deposit')} ${formatCurrency(item.depositPaid)}`);
  if (balance > 0) parts.push(`${t('appointments.balance')} ${formatCurrency(balance)}`);

  return (
    <div className={cn('flex flex-col gap-0.5', align === 'right' ? 'items-end' : 'items-start')}>
      <span className="flex items-center gap-1">
        {needsDeposit ? (
          <TriangleAlert className="h-3 w-3 shrink-0 text-warning" aria-label={t('appointments.needsDeposit')} />
        ) : null}
        <Badge variant={pill.variant}>{pill.label}</Badge>
      </span>
      {parts.length > 0 ? (
        <span className="text-2xs tabular-nums text-muted-foreground">{parts.join(' · ')}</span>
      ) : null}
    </div>
  );
}

/** Filled/empty star row — a review is never conveyed by colour alone. */
export function RatingStars({ value, size = 12 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={cn(i <= value ? 'fill-accent text-accent' : 'text-border')}
          aria-hidden="true"
        />
      ))}
      <span className="sr-only">{value}/5</span>
    </span>
  );
}

/** Section frame shared by the insight panels — title row + framed body. */
export function Panel({
  icon: Icon,
  title,
  meta,
  action,
  children,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-card shadow-sm',
        'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
        <h3 className="truncate text-xs font-semibold">{title}</h3>
        {meta ? <span className="truncate text-2xs text-muted-foreground">{meta}</span> : null}
        {action ? <span className="ml-auto shrink-0">{action}</span> : null}
      </div>
      {children}
    </section>
  );
}

/** Ranked bar list with per-row colour, share % and a leading rank chip. */
export function RankList({
  data,
  emptyLabel,
  limit = 6,
  onPick,
  activeId,
  valueFormatter,
}: {
  data: { id: string; name: string; count: number; revenue: number }[];
  emptyLabel: string;
  limit?: number;
  onPick?: (id: string) => void;
  activeId?: string;
  valueFormatter?: (row: { count: number; revenue: number }) => string;
}) {
  if (data.length === 0) {
    return <p className="px-4 py-3 text-xs text-muted-foreground">{emptyLabel}</p>;
  }
  const top = data.slice(0, limit);
  const max = top[0]!.count || 1;
  const total = data.reduce((s, d) => s + d.count, 0) || 1;

  return (
    <ul className="divide-y divide-border">
      {top.map((d, i) => {
        const active = activeId === d.id;
        const inner = (
          <>
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-2xs font-bold tabular-nums text-white"
              style={{ backgroundColor: RANK_COLORS[i % RANK_COLORS.length] }}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs font-medium" title={d.name}>
                  {d.name}
                </span>
                <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                  {valueFormatter ? valueFormatter(d) : `${d.count} · ${formatCurrency(d.revenue)}`}
                </span>
              </span>
              <span className="mt-1 flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
                    style={{
                      width: `${Math.round((d.count / max) * 100)}%`,
                      backgroundColor: RANK_COLORS[i % RANK_COLORS.length],
                    }}
                  />
                </span>
                <span className="w-9 shrink-0 text-right text-2xs tabular-nums text-muted-foreground">
                  {Math.round((d.count / total) * 100)}%
                </span>
              </span>
            </span>
          </>
        );
        return (
          <li key={d.id}>
            {onPick ? (
              <button
                type="button"
                onClick={() => onPick(d.id)}
                aria-pressed={active}
                className={cn(
                  'flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors duration-150 hover:bg-muted/50 motion-reduce:transition-none',
                  active && 'bg-muted/60',
                )}
              >
                {inner}
              </button>
            ) : (
              <div className="flex items-center gap-2.5 px-4 py-2">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Status distribution bar — one segment per status, never colour-only (title + legend). */
export function DistributionBar({
  byStatus,
  statusValues,
  labelOf,
  ariaLabel,
}: {
  byStatus: Record<AppointmentStatus, number>;
  statusValues: AppointmentStatus[];
  labelOf: (s: AppointmentStatus) => string;
  ariaLabel: string;
}) {
  const total = statusValues.reduce((sum, k) => sum + byStatus[k], 0);
  if (total === 0) return <div className="h-1.5 rounded-full bg-muted" />;
  return (
    <div className="flex h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={ariaLabel}>
      {statusValues
        .filter((s) => byStatus[s] > 0)
        .map((s) => (
          <span
            key={s}
            className="h-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{
              width: `${(byStatus[s] / total) * 100}%`,
              backgroundColor: STATUS_COLOR[s],
            }}
            title={`${labelOf(s)} · ${Math.round((byStatus[s] / total) * 100)}%`}
          />
        ))}
    </div>
  );
}
