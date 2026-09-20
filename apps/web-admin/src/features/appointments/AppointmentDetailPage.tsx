import type { AppointmentStatus } from '@abcp/shared-types';
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CalendarX2,
  Check,
  Copy,
  CreditCard,
  History,
  House,
  MapPin,
  MessageSquareText,
  Phone,
  Scissors,
  Timer,
  User,
  Wallet,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { DateTimeText } from '@/components/shared/DateTimeText';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { StatusPill } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/features/auth/useAuth';
import { ChatPanel } from '@/features/chat/ChatPanel';
import { useConfirm } from '@/hooks/useConfirm';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';

import { BookingSheet } from './BookingSheet';
import { useAppointment, useSetAppointmentStatus } from './appointments.api';
import {
  DESTRUCTIVE_STATUS,
  NEXT_STATUS,
  balanceOf,
  formatDuration,
  isDead,
  minutesFromNow,
} from './appointments.lib';
import { ChannelChips, FlagChips, Panel, RatingStars } from './appointments.parts';

/**
 * `/appointments/:id` — the full record.
 *
 * The sheet on the list page covers reading and moving a booking. This page is
 * for the cases the sheet deliberately does not carry: the conversation thread,
 * the full audit history, and a layout that survives being printed or linked to
 * from outside the console. It shares the list page's vocabulary (same flags,
 * same chips, same status rules) so the two never disagree.
 */
export function AppointmentDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const confirm = useConfirm();
  const canManage = hasPermission('appointments:manage');

  const { data, isLoading, isError } = useAppointment(id);
  const setStatus = useSetAppointmentStatus();
  const [rescheduling, setRescheduling] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyPhone = async (phone: string) => {
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('appointments.copyFailed'));
    }
  };

  const changeStatus = async (next: AppointmentStatus) => {
    if (!data) return;
    if (DESTRUCTIVE_STATUS.includes(next)) {
      const okToGo = await confirm({
        title: t('appointments.confirmStatusTitle', { status: t(`status.${next}`) }),
        description: t('appointments.confirmStatusBody', {
          name: data.customerName,
          status: t(`status.${next}`),
        }),
        confirmLabel: t(`status.${next}`),
        destructive: true,
      });
      if (!okToGo) return;
    }
    setStatus.mutate(
      { id: data.id, status: next },
      {
        onSuccess: () => toast.success(t('appointments.statusUpdated')),
        onError: () => toast.error(t('services.saveError')),
      },
    );
  };

  if (isError) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(ROUTES.appointments)}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('nav.appointments')}
        </Button>
        <p className="text-sm text-muted-foreground">{t('appointments.notFound')}</p>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 rounded-xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  const mins = minutesFromNow(data.startAt);
  const nextOptions = NEXT_STATUS[data.status];
  const canMove = data.status !== 'COMPLETED' && data.status !== 'CANCELLED';

  return (
    <div className="space-y-4 pb-4">
      <StickyPageHeader>
        <div className="flex flex-col gap-3 pt-4">
          <Button asChild variant="ghost" size="sm" className="-ml-2 self-start">
            <Link to={ROUTES.appointments}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t('nav.appointments')}
            </Link>
          </Button>

          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div className="flex min-w-0 items-center gap-3">
              <PersonAvatar name={data.customerName} size={44} />
              <div className="min-w-0">
                <h1 className="truncate font-serif text-2xl font-semibold leading-tight">
                  {data.customerName}
                </h1>
                <p className="truncate text-xs text-muted-foreground">
                  {data.code} · {data.serviceName} · {data.branchName}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {canManage && canMove ? (
                <Button variant="secondary" size="sm" onClick={() => setRescheduling(true)}>
                  <CalendarClock className="h-4 w-4" aria-hidden="true" />
                  {t('appointments.reschedule')}
                </Button>
              ) : null}
              {canManage
                ? nextOptions.map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={DESTRUCTIVE_STATUS.includes(s) ? 'ghost' : 'secondary'}
                      disabled={setStatus.isPending}
                      onClick={() => void changeStatus(s)}
                      className={cn(
                        DESTRUCTIVE_STATUS.includes(s) && 'text-destructive hover:text-destructive',
                      )}
                    >
                      {t(`status.${s}`)}
                    </Button>
                  ))
                : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill status={data.status} label={t(`status.${data.status}`)} />
            <FlagChips item={data} />
            <ChannelChips item={data} />
          </div>
        </div>
      </StickyPageHeader>

      {/* when + money, the two things read first */}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm lg:col-span-2">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CalendarClock className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold tabular-nums">
                <DateTimeText value={data.startAt} mode="datetime" />
                {' – '}
                <DateTimeText value={data.endAt} mode="time" />
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Timer className="h-3.5 w-3.5" aria-hidden="true" />
                  {formatDuration(data.durationMin)}
                </span>
                <span
                  className={cn(
                    'font-medium',
                    mins < 0 && !isDead(data.status) ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {mins >= 0
                    ? t('appointments.startsIn', { value: formatDuration(mins) })
                    : t('appointments.startedAgo', { value: formatDuration(-mins) })}
                </span>
                <span className="inline-flex items-center gap-1">
                  <History className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('appointments.bookedAt')} <DateTimeText value={data.createdAt} mode="datetime" />
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-card shadow-sm">
          <Money icon={Wallet} label={t('appointments.price')} value={data.price} strike={isDead(data.status)} />
          <Money icon={CreditCard} label={t('appointments.deposit')} value={data.depositPaid} />
          <Money
            icon={Wallet}
            label={t('appointments.balance')}
            value={balanceOf(data)}
            tone={balanceOf(data) > 0 ? 'warning' : 'success'}
          />
        </div>
      </div>

      {data.conflicts.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-destructive/40 shadow-sm">
          <p className="flex items-center gap-1.5 border-b border-destructive/30 bg-destructive-soft px-4 py-2.5 text-xs font-semibold text-destructive">
            <CalendarX2 className="h-4 w-4" aria-hidden="true" />
            {t('appointments.conflictsTitle', { count: data.conflicts.length })}
          </p>
          <ul className="divide-y divide-border bg-card">
            {data.conflicts.map((c) => (
              <li key={c.id}>
                <Link
                  to={ROUTES.appointmentDetail(c.id)}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
                >
                  <PersonAvatar name={c.customerName} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.customerName}</span>
                    <span className="block truncate text-2xs text-muted-foreground">
                      {c.code} · {c.serviceName} · {c.staffName}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs font-medium tabular-nums">
                      <DateTimeText value={c.startAt} mode="time" /> –{' '}
                      <DateTimeText value={c.endAt} mode="time" />
                    </span>
                    <span className="block text-2xs text-muted-foreground">
                      {t(`appointments.conflictReason_${c.reason}`)}
                    </span>
                  </span>
                  <StatusPill status={c.status} label={t(`status.${c.status}`)} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel icon={User} title={t('appointments.details')}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 sm:grid-cols-3">
              <Fact icon={Phone} label={t('auth.phone')}>
                <span className="flex items-center gap-1.5">
                  <span className="truncate tabular-nums">{data.customerPhone}</span>
                  <button
                    type="button"
                    onClick={() => void copyPhone(data.customerPhone)}
                    aria-label={t('appointments.copyPhone')}
                    className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-success" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3 w-3" aria-hidden="true" />
                    )}
                  </button>
                </span>
              </Fact>
              <Fact icon={User} label={t('appointments.staff')}>
                {data.staffName}
              </Fact>
              <Fact icon={Scissors} label={t('appointments.service')}>
                {data.serviceName}
              </Fact>
              <Fact icon={Building2} label={t('branch.title')}>
                {data.branchName}
                {data.roomName ? ` · ${data.roomName}` : ''}
              </Fact>
              <Fact icon={CreditCard} label={t('appointments.payment')}>
                {data.paymentStatus
                  ? t(`paymentStatus.${data.paymentStatus}`, { defaultValue: data.paymentStatus })
                  : '–'}
              </Fact>
              <Fact icon={Wallet} label={t('appointments.depositPolicyShort')}>
                {data.depositRequired > 0 ? formatCurrency(data.depositRequired) : '–'}
              </Fact>
              {data.deliveryType === 'HOME_SERVICE' ? (
                <Fact icon={House} label={t('appointments.homeService')} full>
                  <span className="inline-flex items-start gap-1">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                    {data.homeAddress ?? '–'}
                    {data.travelFee > 0 ? (
                      <span className="text-muted-foreground">
                        {' '}
                        · {t('appointments.travelFee')} {formatCurrency(data.travelFee)}
                      </span>
                    ) : null}
                  </span>
                </Fact>
              ) : null}
            </dl>

            {data.customerNotes || data.staffNotes ? (
              <div className="space-y-2 border-t border-border p-4">
                {data.customerNotes ? (
                  <Note label={t('appointments.customerNotes')} text={data.customerNotes} />
                ) : null}
                {data.staffNotes ? (
                  <Note label={t('appointments.staffNotes')} text={data.staffNotes} />
                ) : null}
              </div>
            ) : null}

            {data.review ? (
              <div className="border-t border-border p-4">
                <div className="flex items-center gap-2">
                  <RatingStars value={data.review.rating} size={14} />
                  <span className="text-2xs text-muted-foreground">{t('appointments.review')}</span>
                </div>
                {data.review.comment ? (
                  <p className="mt-1.5 text-xs leading-relaxed">{data.review.comment}</p>
                ) : null}
              </div>
            ) : null}
          </Panel>

          <ChatPanel appointmentId={data.id} />
        </div>

        <Panel
          icon={History}
          title={t('appointments.timeline')}
          meta={t('appointments.itemsCount', { count: data.timeline.length })}
        >
          <ol className="space-y-3 border-l border-border p-4 pl-7">
            {data.timeline.map((ev, i) => (
              <li key={`${ev.at}-${i}`} className="relative">
                <span
                  className={cn(
                    'absolute -left-[21px] top-1 h-2 w-2 rounded-full ring-2 ring-card',
                    ev.audited === false ? 'bg-muted-foreground' : 'bg-primary',
                  )}
                  aria-hidden="true"
                />
                <p className="text-xs font-medium">
                  {t(`status.${ev.label}`, { defaultValue: ev.label })}
                </p>
                <p className="text-2xs text-muted-foreground">
                  <DateTimeText value={ev.at} mode="datetime" /> · {ev.by}
                </p>
                {ev.audited === false ? (
                  <p className="text-2xs text-muted-foreground/70">{t('appointments.derivedEntry')}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <BookingSheet
        open={rescheduling}
        onOpenChange={setRescheduling}
        appointment={data}
        defaultBranchId={data.branchId}
      />
    </div>
  );
}

function Money({
  icon: Icon,
  label,
  value,
  strike,
  tone,
}: {
  icon: typeof Wallet;
  label: string;
  value: number;
  strike?: boolean;
  tone?: 'warning' | 'success';
}) {
  return (
    <div className="px-3 py-3">
      <p className="flex items-center gap-1 text-2xs text-muted-foreground">
        <Icon className="h-3 w-3" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </p>
      <p
        className={cn(
          'mt-0.5 text-sm font-semibold tabular-nums',
          strike && 'text-muted-foreground line-through',
          tone === 'warning' && 'text-warning',
          tone === 'success' && 'text-success',
        )}
      >
        <CurrencyText amount={value} />
      </p>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
  full,
}: {
  icon: typeof User;
  label: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <div className={cn('min-w-0', full && 'col-span-2 sm:col-span-3')}>
      <dt className="flex items-center gap-1 text-2xs text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{children}</dd>
    </div>
  );
}

function Note({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2.5">
      <p className="flex items-center gap-1 text-2xs font-medium text-muted-foreground">
        <MessageSquareText className="h-3 w-3" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed">{text}</p>
    </div>
  );
}
