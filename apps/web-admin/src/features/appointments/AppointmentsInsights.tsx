import type { AdminAppointmentSummary } from '@abcp/shared-types';
import { Building2, Clock4, Scissors, TrendingUp, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { EmptyState } from '@/components/shared/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CHART_AXIS_TICK,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
} from '@/features/dashboard/chartTheme';
import { dayjs, formatCompactNumber, formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

import { Panel, RankList } from './appointments.parts';

interface Props {
  summary: AdminAppointmentSummary | undefined;
  loading: boolean;
  onPickStaff: (id: string) => void;
  onPickService: (id: string) => void;
  onPickBranch: (id: string) => void;
  activeStaffId?: string;
  activeServiceId?: string;
  activeBranchId?: string;
}

/**
 * Analysis view for the current filter set. Every panel is a lens on the same
 * server summary, and the ranked lists double as filters — click a staff member
 * or a service and the whole page narrows to them.
 */
export function AppointmentsInsights({
  summary,
  loading,
  onPickStaff,
  onPickService,
  onPickBranch,
  activeStaffId,
  activeServiceId,
  activeBranchId,
}: Props) {
  const { t } = useTranslation();

  if (loading || !summary) {
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
    );
  }

  if (summary.total === 0) {
    return <EmptyState title={t('appointments.empty')} description={t('appointments.emptyHint')} />;
  }

  const trend = summary.byDay.map((d) => ({
    ...d,
    label: dayjs(d.date).format('DD/MM'),
  }));

  const peakHour = summary.byHour.reduce((best, h) => (h.count > best.count ? h : best), {
    hour: 0,
    count: 0,
  });
  const maxHour = peakHour.count || 1;

  return (
    <div className="space-y-3">
      <Panel
        icon={TrendingUp}
        title={t('appointments.bookingTrend')}
        meta={t('appointments.trendMeta', { days: trend.length })}
      >
        <div className="h-56 px-2 pb-2 pt-4">
          {trend.length < 2 ? (
            <p className="px-2 text-xs text-muted-foreground">{t('appointments.trendTooShort')}</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="apptTrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.24} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis
                  tick={CHART_AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                  formatter={(value: number, key) =>
                    key === 'revenue'
                      ? [formatCurrency(value), t('appointments.expectedRevenue')]
                      : [String(value), t('appointments.bookings')]
                  }
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  fill="url(#apptTrendFill)"
                  name="count"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Panel>

      <Panel
        icon={Clock4}
        title={t('appointments.byHour')}
        meta={
          peakHour.count
            ? t('appointments.peakHour', { hour: String(peakHour.hour).padStart(2, '0') })
            : undefined
        }
      >
        <div className="flex items-end gap-[3px] px-4 py-4" role="img" aria-label={t('appointments.byHour')}>
          {summary.byHour.map((h) => (
            <span key={h.hour} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span
                className={cn(
                  'w-full rounded-sm transition-[height] duration-500 ease-out motion-reduce:transition-none',
                  h.hour === peakHour.hour && h.count > 0 ? 'bg-primary' : 'bg-primary/30',
                )}
                style={{ height: `${Math.max(2, Math.round((h.count / maxHour) * 72))}px` }}
                title={`${String(h.hour).padStart(2, '0')}:00 · ${h.count}`}
              />
              <span className="text-[9px] tabular-nums text-muted-foreground">
                {h.hour % 3 === 0 ? String(h.hour).padStart(2, '0') : ''}
              </span>
            </span>
          ))}
        </div>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel
          icon={Users}
          title={t('appointments.byStaff')}
          meta={t('appointments.itemsCount', { count: summary.byStaff.length })}
        >
          <RankList
            data={summary.byStaff}
            emptyLabel={t('appointments.empty')}
            onPick={onPickStaff}
            activeId={activeStaffId}
          />
        </Panel>

        <Panel
          icon={Scissors}
          title={t('appointments.byService')}
          meta={t('appointments.itemsCount', { count: summary.byService.length })}
        >
          <RankList
            data={summary.byService}
            emptyLabel={t('appointments.empty')}
            onPick={onPickService}
            activeId={activeServiceId}
          />
        </Panel>

        <Panel
          icon={Building2}
          title={t('appointments.byBranch')}
          meta={t('appointments.itemsCount', { count: summary.byBranch.length })}
        >
          <RankList
            data={summary.byBranch}
            emptyLabel={t('appointments.empty')}
            onPick={onPickBranch}
            activeId={activeBranchId}
          />
        </Panel>
      </div>

      <Panel icon={TrendingUp} title={t('appointments.capacity')}>
        <dl className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4 sm:divide-y-0">
          <Figure label={t('appointments.bookedHours')} value={`${Math.round(summary.ops.bookedMinutes / 60)}h`} />
          <Figure label={t('appointments.avgDuration')} value={`${summary.ops.avgDurationMin}m`} />
          <Figure
            label={t('appointments.customersUnique')}
            value={formatCompactNumber(summary.ops.distinctCustomers)}
          />
          <Figure
            label={t('appointments.avgRating')}
            value={summary.ops.ratedCount ? `${summary.ops.avgRating}/5` : '–'}
          />
        </dl>
      </Panel>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <dt className="truncate text-2xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
