import { Building2, DoorClosed, DoorOpen, MapPinned } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { LAO_PROVINCES } from './lao-provinces';

export type BranchStatusFilter = 'all' | 'active' | 'inactive';

interface BranchStatsRowProps {
  total: number;
  provinces: number;
  active: number;
  inactive: number;
  statusFilter: BranchStatusFilter;
  onStatusFilterChange: (f: BranchStatusFilter) => void;
}

const TONES = {
  primary: { chip: 'bg-primary/10 text-primary', bar: 'bg-primary', ring: 'ring-primary/70' },
  info: { chip: 'bg-info-soft text-info', bar: 'bg-info', ring: 'ring-info/70' },
  success: { chip: 'bg-success-soft text-success', bar: 'bg-success', ring: 'ring-success/70' },
  warning: { chip: 'bg-warning-soft text-warning', bar: 'bg-warning', ring: 'ring-warning/70' },
} as const;
type Tone = keyof typeof TONES;

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

export function BranchStatsRow({
  total,
  provinces,
  active,
  inactive,
  statusFilter,
  onStatusFilterChange,
}: BranchStatsRowProps) {
  const { t } = useTranslation();
  const totalProvinces = LAO_PROVINCES.length;
  const toggle = (f: BranchStatusFilter) => () =>
    onStatusFilterChange(statusFilter === f ? 'all' : f);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        index={0}
        tone="primary"
        icon={<Building2 className="h-4 w-4" aria-hidden="true" />}
        label={t('branches.summary.total')}
        value={total}
        sub={t('branches.summary.openClosed', { open: active, closed: inactive })}
        segments={[
          { value: active, className: 'bg-success' },
          { value: inactive, className: 'bg-warning/70' },
        ]}
        active={statusFilter === 'all'}
        onClick={() => onStatusFilterChange('all')}
      />

      <StatCard
        index={1}
        tone="info"
        icon={<MapPinned className="h-4 w-4" aria-hidden="true" />}
        label={t('branches.summary.provinces')}
        value={provinces}
        valueSuffix={<span className="text-sm font-medium text-muted-foreground">/{totalProvinces}</span>}
        sub={t('branches.summary.coverage', { pct: pct(provinces, totalProvinces) })}
        progress={pct(provinces, totalProvinces)}
      />

      <StatCard
        index={2}
        tone="success"
        icon={<DoorOpen className="h-4 w-4" aria-hidden="true" />}
        label={t('branches.summary.active')}
        value={active}
        sub={t('branches.summary.ofTotal', { pct: pct(active, total) })}
        progress={pct(active, total)}
        active={statusFilter === 'active'}
        onClick={toggle('active')}
      />

      <StatCard
        index={3}
        tone="warning"
        icon={<DoorClosed className="h-4 w-4" aria-hidden="true" />}
        label={t('branches.summary.inactive')}
        value={inactive}
        sub={
          inactive === 0
            ? t('branches.summary.allOpen')
            : t('branches.summary.ofTotal', { pct: pct(inactive, total) })
        }
        progress={pct(inactive, total)}
        active={statusFilter === 'inactive'}
        onClick={toggle('inactive')}
      />
    </div>
  );
}

interface StatCardProps {
  index: number;
  tone: Tone;
  icon: ReactNode;
  label: string;
  value: ReactNode;
  valueSuffix?: ReactNode;
  sub: string;
  /** Single-colour fill 0–100. */
  progress?: number;
  /** Multi-segment bar (values are absolute counts, drawn proportionally). */
  segments?: { value: number; className: string }[];
  active?: boolean;
  onClick?: () => void;
}

/**
 * Compact branch KPI card — icon chip · label · figure · context line · progress
 * bar. Entrance + interaction motion are baked in (see CardCount convention);
 * both are suppressed under `prefers-reduced-motion`.
 */
function StatCard({
  index,
  tone,
  icon,
  label,
  value,
  valueSuffix,
  sub,
  progress,
  segments,
  active,
  onClick,
}: StatCardProps) {
  const tk = TONES[tone];
  const interactive = Boolean(onClick);
  const style: CSSProperties = { animationDelay: `${Math.min(index, 12) * 45}ms` };

  const className = cn(
    'group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card p-2.5 text-left shadow-sm',
    'animate-in fade-in zoom-in-95 slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
    interactive &&
      'cursor-pointer transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm motion-reduce:transition-none motion-reduce:hover:translate-y-0',
    active && cn('border-transparent ring-2', tk.ring),
  );

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[11px] font-medium text-muted-foreground">{label}</p>
        <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-md', tk.chip)}>
          {icon}
        </span>
      </div>

      <p className="mt-0.5 flex items-baseline gap-1 text-xl font-bold leading-none tabular-nums text-foreground">
        {value}
        {valueSuffix}
      </p>

      <p className="mt-1 truncate text-[10px] text-muted-foreground">{sub}</p>

      {segments ? (
        <SegmentBar segments={segments} />
      ) : progress != null ? (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none', tk.bar)}
            style={{ width: `${Math.max(progress, 2)}%` }}
          />
        </div>
      ) : null}
    </>
  );

  return interactive ? (
    <button type="button" onClick={onClick} aria-pressed={active} className={className} style={style}>
      {body}
    </button>
  ) : (
    <div className={className} style={style}>
      {body}
    </div>
  );
}

function SegmentBar({ segments }: { segments: { value: number; className: string }[] }) {
  const sum = segments.reduce((n, s) => n + s.value, 0) || 1;
  return (
    <div className="mt-1.5 flex h-1 gap-0.5 overflow-hidden rounded-full bg-muted">
      {segments.map((s, i) =>
        s.value > 0 ? (
          <span
            key={i}
            className={cn('h-full first:rounded-l-full last:rounded-r-full', s.className)}
            style={{ width: `${(s.value / sum) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}
