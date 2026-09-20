import {
  ArrowLeft,
  Cake,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  Footprints,
  Mail,
  MapPin,
  Phone,
  Receipt,
  Repeat,
  Sparkles,
  StickyNote,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { DateTimeText } from '@/components/shared/DateTimeText';
import { EmptyState } from '@/components/shared/EmptyState';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { StatusPill } from '@/components/shared/StatusPill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/features/auth/useAuth';
import { dayjs, EN_DASH, formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';

import { CustomerStatCard } from './CustomerStatCard';
import { useCustomer, useSaveCustomer } from './customers.api';

const TIER_VARIANT: Record<string, 'neutral' | 'accent' | 'info'> = {
  SILVER: 'neutral',
  GOLD: 'accent',
  PLATINUM: 'info',
};

const STATUS_DOT: Record<string, string> = {
  COMPLETED: 'bg-success',
  CONFIRMED: 'bg-info',
  IN_PROGRESS: 'bg-primary',
  PENDING: 'bg-warning',
  NO_SHOW: 'bg-destructive',
  CANCELLED: 'bg-muted-foreground/60',
};

const NOTES_MAX = 500;

/** Most frequent non-empty string + its count. */
function mode(values: string[]): { name: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let name = '';
  let count = 0;
  for (const [k, n] of counts) if (n > count) [name, count] = [k, n];
  return count ? { name, count } : null;
}

export function CustomerDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('customers:manage');

  const { data, isLoading, isError } = useCustomer(id);
  const save = useSaveCustomer(id);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (data) setNotes(data.notes ?? '');
  }, [data]);

  const isDirty = Boolean(data) && notes !== (data?.notes ?? '');

  const handleSaveNotes = () =>
    save.mutate(
      { notes },
      {
        onSuccess: () => toast.success(t('customers.saved')),
        onError: () => toast.error(t('services.saveError')),
      },
    );

  const insights = useMemo(() => {
    const h = data?.history ?? [];
    const completed = h.filter((x) => x.status === 'COMPLETED');
    const prices = h.map((x) => x.price).filter((p) => p > 0);
    const durations = h
      .map((x) => dayjs(x.endAt).diff(dayjs(x.startAt), 'minute'))
      .filter((d) => d > 0);
    const times = h.map((x) => dayjs(x.startAt).valueOf()).sort((a, b) => a - b);
    let cadence: number | null = null;
    if (times.length >= 2) {
      const gaps = times.slice(1).map((tm, i) => tm - times[i]!);
      cadence = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length / 86_400_000);
    }
    const trend = Array.from({ length: 8 }, (_, i) => {
      const m = dayjs().startOf('month').subtract(7 - i, 'month');
      return { key: m.format('MM/YY'), count: h.filter((x) => dayjs(x.startAt).isSame(m, 'month')).length };
    });
    const outcome = {
      COMPLETED: completed.length,
      CANCELLED: h.filter((x) => x.status === 'CANCELLED').length,
      NO_SHOW: h.filter((x) => x.status === 'NO_SHOW').length,
    };
    return {
      favoriteService: mode(h.map((x) => x.serviceName)),
      regularStaff: mode(h.map((x) => x.staffName)),
      regularBranch: mode(h.map((x) => x.branchName)),
      realisedSpend: completed.reduce((s, x) => s + x.price, 0),
      priceMin: prices.length ? Math.min(...prices) : 0,
      priceMax: prices.length ? Math.max(...prices) : 0,
      avgDuration: durations.length
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0,
      cadence,
      trend,
      trendMax: Math.max(1, ...trend.map((x) => x.count)),
      outcome,
      outcomeTotal: outcome.COMPLETED + outcome.CANCELLED + outcome.NO_SHOW,
    };
  }, [data?.history]);

  const genderLabel = useMemo(() => {
    const g = data?.gender;
    return t(
      g === 'MALE'
        ? 'customers.genderMale'
        : g === 'FEMALE'
          ? 'customers.genderFemale'
          : g === 'OTHER'
            ? 'customers.genderOther'
            : 'customers.genderUnknown',
    );
  }, [data?.gender, t]);

  if (isError) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2 h-8">
          <Link to={ROUTES.customers}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('nav.customers')}
          </Link>
        </Button>
        <EmptyState icon={User} title={t('customers.notFound')} className="mt-10" />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 w-full rounded-2xl" />
          <Skeleton className="h-80 w-full rounded-2xl lg:col-span-2" />
        </div>
      </div>
    );
  }

  const tenure = (() => {
    const months = dayjs().diff(dayjs(data.createdAt), 'month');
    if (months < 1) return t('customers.durNew');
    const y = Math.floor(months / 12);
    const m = months % 12;
    return y > 0 ? t('customers.durYm', { y, m }) : t('customers.durM', { m });
  })();
  const avgTicket = data.totalVisits > 0 ? Math.round(data.totalSpent / data.totalVisits) : 0;
  const age = data.birthDate ? dayjs().diff(dayjs(data.birthDate), 'year') : null;
  const tierVariant = data.loyaltyTier ? TIER_VARIANT[data.loyaltyTier] : 'neutral';
  const history = data.history;

  let lastMonthKey = '';

  return (
    <div>
      <StickyPageHeader className="space-y-4 pb-5">
        <Button asChild variant="ghost" size="sm" className="-ml-2 h-8">
          <Link to={ROUTES.customers}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('nav.customers')}
          </Link>
        </Button>

        <div className="flex flex-wrap items-start gap-x-4 gap-y-3 pt-1">
          <PersonAvatar
            name={data.name}
            size={64}
            className={cn(
              'ring-2 ring-inset',
              tierVariant === 'info'
                ? 'ring-info/40'
                : tierVariant === 'accent'
                  ? 'ring-accent/50'
                  : 'ring-primary/20',
            )}
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold leading-tight text-foreground">{data.name}</h1>
              <Badge variant={tierVariant} className="h-6 px-2.5">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                {data.loyaltyTier ? t(`customers.${data.loyaltyTier}`) : t('customers.noTier')}
              </Badge>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                {data.phone}
              </span>
              {data.email ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                    {data.email}
                  </span>
                </>
              ) : null}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <HeaderChip icon={CalendarDays}>
                {t('customers.memberFor', { value: tenure })}
              </HeaderChip>
              {data.lastVisitAt ? (
                <HeaderChip icon={Clock3}>
                  <DateTimeText value={data.lastVisitAt} mode="relative" />
                </HeaderChip>
              ) : null}
              {insights.regularBranch ? (
                <HeaderChip icon={MapPin}>{insights.regularBranch.name}</HeaderChip>
              ) : null}
            </div>
          </div>
        </div>
      </StickyPageHeader>

      <div className="mt-6 space-y-5">
        {/* Metric row */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CustomerStatCard
            icon={Users}
            tone="primary"
            label={t('customers.visits')}
            value={data.totalVisits}
            index={0}
            footer={
              history.length > 0 ? (
                <Sparkline data={insights.trend} max={insights.trendMax} />
              ) : undefined
            }
          />
          <CustomerStatCard
            icon={CircleDollarSign}
            tone="success"
            label={t('customers.spent')}
            value={<CurrencyText amount={data.totalSpent} />}
            index={1}
            footer={
              insights.realisedSpend > 0 ? (
                <span className="text-2xs tabular-nums text-muted-foreground">
                  {t('customers.realised', { value: formatCurrency(insights.realisedSpend) })}
                </span>
              ) : undefined
            }
          />
          <CustomerStatCard
            icon={Receipt}
            tone="neutral"
            label={t('customers.avgTicket')}
            value={<CurrencyText amount={avgTicket} />}
            index={2}
            footer={
              insights.priceMax > 0 ? (
                <span className="text-2xs tabular-nums text-muted-foreground">
                  {formatCurrency(insights.priceMin)} – {formatCurrency(insights.priceMax)}
                </span>
              ) : undefined
            }
          />
          <CustomerStatCard
            icon={Sparkles}
            tone="info"
            label={t('customers.points')}
            value={data.loyaltyPoints}
            index={3}
            footer={
              insights.avgDuration > 0 ? (
                <span className="text-2xs tabular-nums text-muted-foreground">
                  ~{t('customers.minShort', { count: insights.avgDuration })}
                </span>
              ) : undefined
            }
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Left column: profile + habits */}
          <div className="space-y-4 lg:col-span-1">
            <Card className="rounded-2xl border-primary/15 bg-gradient-to-br from-primary-subtle/40 to-card">
              <CardHeader>
                <CardTitle className="text-[15px]">{t('customers.profile')}</CardTitle>
              </CardHeader>
              <CardContent className="pt-1">
                <dl className="divide-y divide-border/60">
                  <InfoRow icon={Phone} label={t('customers.phone')} value={data.phone} mono />
                  <InfoRow icon={Mail} label={t('customers.email')} value={data.email ?? EN_DASH} />
                  <InfoRow icon={User} label={t('customers.gender')} value={genderLabel} />
                  <InfoRow
                    icon={Cake}
                    label={t('customers.birthday')}
                    value={
                      data.birthDate
                        ? `${formatDate(data.birthDate)}${age != null ? ` · ${t('customers.age', { count: age })}` : ''}`
                        : EN_DASH
                    }
                  />
                  <InfoRow
                    icon={CalendarDays}
                    label={t('customers.since')}
                    value={formatDate(data.createdAt)}
                  />
                  <InfoRow
                    icon={Clock3}
                    label={t('customers.lastVisit')}
                    value={
                      data.lastVisitAt ? (
                        <DateTimeText value={data.lastVisitAt} mode="relative" />
                      ) : (
                        t('customers.noHistory')
                      )
                    }
                  />
                </dl>
              </CardContent>
            </Card>

            {history.length > 0 ? (
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-[15px]">{t('customers.habits')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-1">
                  {insights.favoriteService ? (
                    <FactRow
                      icon={Sparkles}
                      label={t('customers.favoriteService')}
                      value={insights.favoriteService.name}
                      badge={t('customers.timesShort', { count: insights.favoriteService.count })}
                    />
                  ) : null}
                  {insights.regularStaff ? (
                    <FactRow
                      icon={User}
                      label={t('customers.regularStaff')}
                      value={insights.regularStaff.name}
                      badge={t('customers.timesShort', { count: insights.regularStaff.count })}
                    />
                  ) : null}
                  {insights.cadence != null ? (
                    <FactRow
                      icon={Repeat}
                      label={t('customers.cadence')}
                      value={t('customers.daysShort', { count: insights.cadence })}
                    />
                  ) : null}

                  {insights.outcomeTotal > 0 ? (
                    <div className="pt-1">
                      <p className="mb-1.5 text-xs text-muted-foreground">
                        {t('customers.outcomes')}
                      </p>
                      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                        <OutcomeSeg n={insights.outcome.COMPLETED} total={insights.outcomeTotal} className="bg-success" />
                        <OutcomeSeg n={insights.outcome.CANCELLED} total={insights.outcomeTotal} className="bg-muted-foreground/40" />
                        <OutcomeSeg n={insights.outcome.NO_SHOW} total={insights.outcomeTotal} className="bg-destructive/70" />
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-muted-foreground">
                        <OutcomeLegend dot="bg-success" label={t('status.COMPLETED')} n={insights.outcome.COMPLETED} />
                        <OutcomeLegend dot="bg-muted-foreground/40" label={t('status.CANCELLED')} n={insights.outcome.CANCELLED} />
                        <OutcomeLegend dot="bg-destructive/70" label={t('status.NO_SHOW')} n={insights.outcome.NO_SHOW} />
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </div>

          {/* Visit history timeline */}
          <Card className="rounded-2xl lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-[15px]">{t('customers.history')}</CardTitle>
              {history.length > 0 ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                  {history.length}
                </span>
              ) : null}
            </CardHeader>
            <CardContent className="pt-1">
              {history.length === 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  title={t('customers.noHistory')}
                  className="border-0 py-10"
                />
              ) : (
                <ul className="space-y-0.5">
                  {history.map((h, i) => {
                    const monthKey = dayjs(h.startAt).format('MM/YYYY');
                    const showMonth = monthKey !== lastMonthKey;
                    lastMonthKey = monthKey;
                    const duration = dayjs(h.endAt).diff(dayjs(h.startAt), 'minute');
                    const balance = h.price - h.depositPaid;
                    return (
                      <li key={h.id}>
                        {showMonth ? (
                          <p className="px-1 pb-1 pt-3 text-2xs font-medium tabular-nums text-muted-foreground first:pt-0">
                            {monthKey}
                          </p>
                        ) : null}
                        <div className="relative pl-6">
                          {i !== history.length - 1 ? (
                            <span
                              className="absolute bottom-0 left-[5px] top-6 w-px bg-border"
                              aria-hidden="true"
                            />
                          ) : null}
                          <span
                            className={cn(
                              'absolute left-0 top-[9px] h-3 w-3 rounded-full ring-4 ring-card',
                              STATUS_DOT[h.status] ?? 'bg-muted-foreground/60',
                            )}
                            aria-hidden="true"
                          />
                          <div className="-ml-1 flex flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-lg px-3 py-2 transition-colors hover:bg-muted/40">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <p className="truncate text-[13px] font-semibold text-foreground">
                                  {h.serviceName}
                                </p>
                                <code className="rounded bg-muted px-1 py-px font-mono text-[10px] text-muted-foreground">
                                  {h.code}
                                </code>
                                {h.isWalkIn ? (
                                  <Badge variant="neutral" className="gap-1 px-1.5 py-0 text-[10px]">
                                    <Footprints className="h-2.5 w-2.5" aria-hidden="true" />
                                    {t('appointments.walkIn')}
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                {h.staffName} · {h.branchName}
                              </p>
                              <p className="text-[11px] tabular-nums text-muted-foreground">
                                <DateTimeText value={h.startAt} mode="relative" />
                                {duration > 0
                                  ? ` · ${t('customers.minShort', { count: duration })}`
                                  : ''}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <CurrencyText amount={h.price} className="text-[13px] font-medium" />
                              <StatusPill status={h.status} label={t(`status.${h.status}`)} />
                              {balance > 0 && h.status !== 'CANCELLED' && h.status !== 'NO_SHOW' ? (
                                <span className="text-[10px] tabular-nums text-warning">
                                  {t('customers.balanceDue', { value: formatCurrency(balance) })}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Notes */}
        <Card
          className={cn(
            'overflow-hidden rounded-2xl transition-colors',
            canManage && isDirty && 'border-primary/40',
          )}
        >
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-0.5">
              <CardTitle className="flex items-center gap-2 text-[15px]">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-warning-soft text-warning">
                  <StickyNote className="h-4 w-4" aria-hidden="true" />
                </span>
                {t('customers.notes')}
              </CardTitle>
              <CardDescription className="text-xs">{t('customers.notesHint')}</CardDescription>
            </div>
            {canManage && isDirty ? (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                aria-live="polite"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                {t('customers.unsaved')}
              </span>
            ) : null}
          </CardHeader>
          <CardContent className="pt-1">
            {canManage ? (
              <>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && isDirty) {
                      e.preventDefault();
                      handleSaveNotes();
                    }
                  }}
                  placeholder={t('customers.notesPlaceholder')}
                  rows={4}
                  maxLength={NOTES_MAX}
                  className="resize-none rounded-xl bg-muted/30 leading-relaxed focus:bg-card"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span
                    className={cn(
                      'text-2xs tabular-nums',
                      notes.length > NOTES_MAX - 40 ? 'text-warning' : 'text-muted-foreground',
                    )}
                  >
                    {notes.length}/{NOTES_MAX}
                  </span>
                  <div className="flex items-center gap-2">
                    {isDirty ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9"
                        onClick={() => setNotes(data.notes ?? '')}
                        disabled={save.isPending}
                      >
                        {t('common.cancel')}
                      </Button>
                    ) : null}
                    <Button onClick={handleSaveNotes} disabled={!isDirty || save.isPending}>
                      {save.isPending ? t('common.loading') : t('common.save')}
                    </Button>
                  </div>
                </div>
              </>
            ) : data.notes?.trim() ? (
              <blockquote className="rounded-xl border border-border bg-muted/30 px-3.5 py-3 text-sm">
                <p className="whitespace-pre-wrap leading-relaxed text-foreground">
                  {data.notes.trim()}
                </p>
              </blockquote>
            ) : (
              <p className="rounded-xl border border-dashed border-border px-3.5 py-6 text-center text-sm text-muted-foreground">
                {t('customers.notesEmpty')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function HeaderChip({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {children}
    </span>
  );
}

interface InfoRowProps {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  mono?: boolean;
}

function InfoRow({ icon: Icon, label, value, mono }: InfoRowProps) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          'ml-auto min-w-0 truncate text-right text-[13px] text-foreground',
          mono && 'tabular-nums',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function FactRow({
  icon: Icon,
  label,
  value,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-2xs text-muted-foreground">{label}</p>
        <p className="truncate text-[13px] font-medium text-foreground">{value}</p>
      </div>
      {badge ? (
        <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-2xs font-medium tabular-nums text-primary">
          {badge}
        </span>
      ) : null}
    </div>
  );
}

function Sparkline({ data, max }: { data: { key: string; count: number }[]; max: number }) {
  return (
    <span className="flex h-5 items-end gap-0.5" aria-hidden="true">
      {data.map((d) => (
        <span
          key={d.key}
          className={cn('w-1 rounded-sm', d.count > 0 ? 'bg-primary/60' : 'bg-muted')}
          style={{ height: `${d.count > 0 ? Math.max((d.count / max) * 100, 20) : 12}%` }}
        />
      ))}
    </span>
  );
}

function OutcomeSeg({ n, total, className }: { n: number; total: number; className: string }) {
  if (n === 0) return null;
  return <span className={className} style={{ width: `${(n / total) * 100}%` }} />;
}

function OutcomeLegend({ dot, label, n }: { dot: string; label: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} aria-hidden="true" />
      {label} <span className="tabular-nums">{n}</span>
    </span>
  );
}
