import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Clock3,
  CopyCheck,
  Mail,
  Percent,
  Phone,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/features/auth/useAuth';
import { useServices } from '@/features/services/services.api';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';
import type { WorkingHour } from '@/types/models';
import { UserSecurityDialog } from '@/features/users/UserSecurityDialog';

import { SegmentMeter, StaffMetricCard, WeekRibbon } from './StaffMetricCard';
import { useStaffMember, useUpdateStaff } from './staff.api';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
/** Monday-first display order; `dayOfWeek` 0–6 (Sun–Sat) stays the storage form. */
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const dayMinutes = (h: WorkingHour) =>
  h.isDayOff ? 0 : Math.max(0, toMinutes(h.endTime) - toMinutes(h.startTime));

export function StaffDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('staff:manage');
  const [securityOpen, setSecurityOpen] = useState(false);

  const { data, isLoading, isError } = useStaffMember(id);
  const update = useUpdateStaff(id ?? '');
  const { data: servicesPage } = useServices({ page: 1, pageSize: 100 });

  const [hours, setHours] = useState<WorkingHour[]>([]);
  const [commission, setCommission] = useState(0);

  useEffect(() => {
    if (data) {
      setHours(data.workingHours);
      setCommission(Math.round(data.commissionRate * 100));
    }
  }, [data]);

  const durationLabel = useMemo(() => {
    return (mins: number) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      const parts: string[] = [];
      if (h) parts.push(`${h}${t('staff.hoursUnit')}`);
      if (m) parts.push(`${m}${t('staff.minutesUnit')}`);
      return parts.length ? parts.join(' ') : `0${t('staff.hoursUnit')}`;
    };
  }, [t]);

  const weekMinutes = hours.reduce((sum, h) => sum + dayMinutes(h), 0);
  const workingDays = hours.filter((h) => !h.isDayOff).length;

  const byDay = DISPLAY_ORDER.map((dow) => hours.find((h) => h.dayOfWeek === dow));
  const dayLabels = DISPLAY_ORDER.map((dow) => t(`day.${DAY_KEYS[dow]}`));
  const workedByDay = byDay.map((h) => Boolean(h) && !h!.isDayOff);

  const isDirty = useMemo(() => {
    if (!data) return false;
    return (
      JSON.stringify(hours) !== JSON.stringify(data.workingHours) ||
      commission !== Math.round(data.commissionRate * 100)
    );
  }, [data, hours, commission]);

  if (isError) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link to={ROUTES.staff}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('nav.staff')}
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">{t('staff.notFound')}</p>
      </div>
    );
  }

  const setDay = (dayOfWeek: number, patch: Partial<WorkingHour>) =>
    setHours((prev) => prev.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, ...patch } : h)));

  const applyToAll = () => {
    const template = hours.find((h) => !h.isDayOff);
    if (!template) return;
    setHours((prev) =>
      prev.map((h) =>
        h.isDayOff ? h : { ...h, startTime: template.startTime, endTime: template.endTime },
      ),
    );
  };

  const save = () => {
    update.mutate(
      { workingHours: hours, commissionRate: commission / 100 },
      {
        onSuccess: () => toast.success(t('staff.saved')),
        onError: () => toast.error(t('services.saveError')),
      },
    );
  };

  const serviceNames = new Map((servicesPage?.items ?? []).map((s) => [s.id, s.name]));

  return (
    <div>
      {isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-16 w-72" />
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-80 w-full" />
        </div>
      ) : (
        <>
          <StickyPageHeader className="space-y-4 pb-5">
            <Button asChild variant="ghost" size="sm" className="-ml-2 h-8">
              <Link to={ROUTES.staff}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                {t('nav.staff')}
              </Link>
            </Button>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pt-1">
              <PersonAvatar name={data.name} size={56} className="border border-border" />

              <div className="min-w-0 flex-1">
                <h1 className="font-sans text-2xl font-semibold leading-tight">{data.name}</h1>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {data.jobTitle} · {data.branchName}
                </p>
              </div>

              <Badge variant={data.isActive ? 'success' : 'neutral'}>
                {data.isActive ? t('staff.active') : t('staff.inactive')}
              </Badge>

              {canManage ? (
                <Button variant="secondary" size="sm" onClick={() => setSecurityOpen(true)}>
                  <ShieldCheck aria-hidden="true" />
                  <span className="hidden sm:inline">{t('userSecurity.open')}</span>
                </Button>
              ) : null}

              {canManage ? (
                <div className="flex items-center gap-3">
                  <span
                    className={`hidden text-xs text-muted-foreground sm:inline ${
                      isDirty ? '' : 'invisible'
                    }`}
                    aria-live="polite"
                  >
                    {t('staff.unsaved')}
                  </span>
                  <Button onClick={save} disabled={!isDirty || update.isPending}>
                    {update.isPending ? t('common.loading') : t('common.save')}
                  </Button>
                </div>
              ) : null}
            </div>
          </StickyPageHeader>

          <UserSecurityDialog
            userId={data.userId}
            name={data.name}
            open={securityOpen}
            onClose={() => setSecurityOpen(false)}
          />

          <div className="mt-8 space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <StaffMetricCard
                index={0}
                icon={CalendarClock}
                label={t('staff.workingDays')}
                value={workingDays}
                unit="/ 7"
                footer={
                  <WeekRibbon
                    worked={workedByDay}
                    labels={dayLabels}
                    ariaLabel={t('staff.workingDays')}
                  />
                }
              />
              <StaffMetricCard
                index={1}
                icon={Clock3}
                label={t('staff.hoursPerWeek')}
                value={Math.floor(weekMinutes / 60)}
                unit={t('staff.hoursUnit')}
                footer={
                  <WeekRibbon
                    worked={workedByDay}
                    labels={dayLabels}
                    ariaLabel={t('staff.hoursPerWeek')}
                  />
                }
              />
              <StaffMetricCard
                index={2}
                icon={Percent}
                accent="gold"
                label={t('staff.commission')}
                value={commission}
                unit="%"
                footer={<SegmentMeter ratio={commission / 100} ariaLabel={t('staff.commission')} />}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                  <CardTitle>{t('staff.workingHours')}</CardTitle>
                  {canManage ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8"
                      onClick={applyToAll}
                      disabled={workingDays === 0}
                    >
                      <CopyCheck className="h-4 w-4" aria-hidden="true" />
                      {t('staff.applyToAll')}
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
                    {DISPLAY_ORDER.map((dow, i) => {
                      const h = hours.find((x) => x.dayOfWeek === dow);
                      if (!h) return null;
                      const rowId = `wh-${dow}`;
                      const off = h.isDayOff;
                      return (
                        <div
                          key={dow}
                          style={{ animationDelay: `${i * 35}ms` }}
                          className={cn(
                            'flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 text-sm transition-colors duration-150',
                            'animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
                            off ? 'bg-muted/30' : 'hover:bg-muted/40',
                          )}
                        >
                          <span className="flex w-16 shrink-0 items-center gap-2 font-medium">
                            <span
                              aria-hidden="true"
                              className={cn(
                                'h-1.5 w-1.5 rounded-full',
                                off ? 'bg-muted-foreground/40' : 'bg-primary',
                              )}
                            />
                            {t(`day.${DAY_KEYS[dow]}`)}
                          </span>

                          <DayToggle
                            on={!off}
                            disabled={!canManage}
                            onChange={(on) => setDay(dow, { isDayOff: !on })}
                            labelOn={t('staff.working')}
                            labelOff={t('staff.dayOff')}
                          />

                          {off ? (
                            <span className="text-xs text-muted-foreground">
                              {t('staff.restDay')}
                            </span>
                          ) : (
                            <>
                              <div className="flex items-center gap-1.5">
                                <label htmlFor={`${rowId}-start`} className="sr-only">
                                  {t('staff.startTime')}
                                </label>
                                <Input
                                  id={`${rowId}-start`}
                                  type="time"
                                  value={h.startTime}
                                  disabled={!canManage}
                                  onChange={(e) => setDay(dow, { startTime: e.target.value })}
                                  className="h-8 w-[6.75rem]"
                                />
                                <span className="text-muted-foreground" aria-hidden="true">
                                  –
                                </span>
                                <label htmlFor={`${rowId}-end`} className="sr-only">
                                  {t('staff.endTime')}
                                </label>
                                <Input
                                  id={`${rowId}-end`}
                                  type="time"
                                  value={h.endTime}
                                  disabled={!canManage}
                                  onChange={(e) => setDay(dow, { endTime: e.target.value })}
                                  className="h-8 w-[6.75rem]"
                                />
                              </div>
                              <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-2xs font-medium tabular-nums text-muted-foreground">
                                {durationLabel(dayMinutes(h))}
                              </span>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{t('staff.weekTotal')}</span>
                    <span className="font-semibold tabular-nums">{durationLabel(weekMinutes)}</span>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('staff.commission')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={commission}
                        disabled={!canManage}
                        onChange={(e) => setCommission(Number(e.target.value))}
                        className="h-9 w-24"
                        aria-label={t('staff.commission')}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{t('staff.commissionHint')}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                    <CardTitle>{t('staff.services')}</CardTitle>
                    <Badge variant="neutral">{data.serviceIds.length}</Badge>
                  </CardHeader>
                  <CardContent>
                    {data.serviceIds.length === 0 ? (
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                        {t('staff.noServices')}
                      </p>
                    ) : (
                      <ul className="flex flex-wrap gap-1.5">
                        {data.serviceIds.map((sid) => (
                          <li key={sid}>
                            <Badge variant="neutral">
                              {serviceNames.get(sid) ?? sid.slice(0, 8)}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('staff.contact')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="space-y-2.5 text-sm">
                      <InfoRow
                        icon={<Phone className="h-4 w-4" aria-hidden="true" />}
                        label={t('staff.phone')}
                        value={data.phone}
                      />
                      <InfoRow
                        icon={<Mail className="h-4 w-4" aria-hidden="true" />}
                        label={t('staff.email')}
                        value={data.email ?? t('staff.noEmail')}
                      />
                      <InfoRow
                        icon={<Building2 className="h-4 w-4" aria-hidden="true" />}
                        label={t('staff.branch')}
                        value={data.branchName}
                      />
                      <InfoRow
                        icon={<CalendarClock className="h-4 w-4" aria-hidden="true" />}
                        label={t('staff.hiredAt')}
                        value={formatDate(data.hiredAt)}
                      />
                    </dl>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DayToggle({
  on,
  disabled,
  onChange,
  labelOn,
  labelOff,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
  labelOn: string;
  labelOff: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? labelOn : labelOff}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
        on ? 'bg-primary' : 'bg-input',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-card shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none',
          on ? 'translate-x-[1.125rem]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-muted-foreground">{icon}</span>
      <dt className="w-16 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate font-medium">{value}</dd>
    </div>
  );
}
