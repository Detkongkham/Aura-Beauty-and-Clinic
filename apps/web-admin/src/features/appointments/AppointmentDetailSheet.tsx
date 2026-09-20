import type { AppointmentStatus } from '@abcp/shared-types';
import {
  Building2,
  CalendarClock,
  CalendarX2,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
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
import { Link } from 'react-router-dom';

import { CurrencyText } from '@/components/shared/CurrencyText';
import { DateTimeText } from '@/components/shared/DateTimeText';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { StatusPill } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';

import { useAppointment } from './appointments.api';
import {
  DESTRUCTIVE_STATUS,
  NEXT_STATUS,
  balanceOf,
  formatDuration,
  isDead,
  minutesFromNow,
} from './appointments.lib';
import { ChannelChips, FlagChips, RatingStars } from './appointments.parts';

interface Props {
  id: string | null;
  onOpenChange: (open: boolean) => void;
  onStatus: (id: string, next: AppointmentStatus) => void;
  onReschedule: (id: string) => void;
  canManage: boolean;
  pending: boolean;
}

/**
 * Record detail as a right sheet rather than a route change.
 *
 * The old page navigated away from the list, which threw away the filters, the
 * page number and the scroll position — the desk's whole working context — just
 * to read eight fields. The sheet keeps all of that alive behind it, and the
 * full page stays one click away for the cases that need chat and history.
 */
export function AppointmentDetailSheet({ id, onOpenChange, onStatus, onReschedule, canManage, pending }: Props) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useAppointment(id ?? undefined);
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

  const mins = data ? minutesFromNow(data.startAt) : 0;
  const nextOptions = data ? NEXT_STATUS[data.status] : [];

  return (
    <Sheet open={id != null} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-[560px]" aria-describedby={undefined}>
        {isLoading || !data ? (
          <div className="space-y-4 p-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : isError ? (
          <div className="p-6">
            <p className="text-sm text-muted-foreground">{t('appointments.notFound')}</p>
          </div>
        ) : (
          <>
            <SheetHeader>
              <div className="flex items-start gap-3 pr-8">
                <PersonAvatar name={data.customerName} size={44} />
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate text-lg">{data.customerName}</SheetTitle>
                  <SheetDescription className="truncate text-xs">
                    {data.code} · {data.serviceName}
                  </SheetDescription>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <StatusPill status={data.status} label={t(`status.${data.status}`)} />
                <FlagChips item={data} />
                <ChannelChips item={data} />
              </div>
            </SheetHeader>

            <SheetBody className="space-y-4 py-4">
              {/* when — the single most important line on this record */}
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <CalendarClock className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold tabular-nums">
                      <DateTimeText value={data.startAt} mode="datetime" />
                      {' – '}
                      <DateTimeText value={data.endAt} mode="time" />
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-2xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Timer className="h-3 w-3" aria-hidden="true" />
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
                    </p>
                  </div>
                </div>
              </div>

              {/* clashes — the most actionable thing on this record when present */}
              {data.conflicts.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-destructive/40">
                  <p className="flex items-center gap-1.5 border-b border-destructive/30 bg-destructive-soft px-3 py-2 text-2xs font-semibold text-destructive">
                    <CalendarX2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('appointments.conflictsTitle', { count: data.conflicts.length })}
                  </p>
                  <ul className="divide-y divide-border">
                    {data.conflicts.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => onOpenChange(false)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium">{c.customerName}</span>
                            <span className="block truncate text-2xs text-muted-foreground">
                              {c.serviceName} · {c.staffName}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-2xs font-medium tabular-nums">
                              <DateTimeText value={c.startAt} mode="time" /> –{' '}
                              <DateTimeText value={c.endAt} mode="time" />
                            </span>
                            <span className="block text-2xs text-muted-foreground">
                              {t(`appointments.conflictReason_${c.reason}`)}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* money */}
              <div className="grid grid-cols-3 divide-x divide-border rounded-xl border border-border">
                <Money icon={Wallet} label={t('appointments.price')} value={data.price} strike={isDead(data.status)} />
                <Money icon={CreditCard} label={t('appointments.deposit')} value={data.depositPaid} />
                <Money
                  icon={Wallet}
                  label={t('appointments.balance')}
                  value={balanceOf(data)}
                  tone={balanceOf(data) > 0 ? 'warning' : 'success'}
                />
              </div>
              {data.paymentMethods.length > 0 || data.paidAt ? (
                <p className="text-2xs text-muted-foreground">
                  {data.paymentMethods.map((m) => t(`payment.${m}`, { defaultValue: m })).join(' · ')}
                  {data.paidAt ? (
                    <>
                      {data.paymentMethods.length ? ' · ' : ''}
                      <DateTimeText value={data.paidAt} mode="datetime" />
                    </>
                  ) : null}
                </p>
              ) : null}
              {data.depositRequired > 0 ? (
                <p className="text-2xs text-muted-foreground">
                  {t('appointments.depositPolicy', { amount: formatCurrency(data.depositRequired) })}
                </p>
              ) : null}

              {/* facts */}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
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
                <Fact icon={CalendarClock} label={t('appointments.bookedAt')}>
                  <DateTimeText value={data.createdAt} mode="datetime" />
                </Fact>
              </dl>

              {/* notes */}
              {data.customerNotes || data.staffNotes ? (
                <div className="space-y-2">
                  {data.customerNotes ? (
                    <Note icon={MessageSquareText} label={t('appointments.customerNotes')} text={data.customerNotes} />
                  ) : null}
                  {data.staffNotes ? (
                    <Note icon={MessageSquareText} label={t('appointments.staffNotes')} text={data.staffNotes} />
                  ) : null}
                </div>
              ) : null}

              {/* review */}
              {data.review ? (
                <div className="rounded-xl border border-border p-3">
                  <div className="flex items-center gap-2">
                    <RatingStars value={data.review.rating} size={14} />
                    <span className="text-2xs text-muted-foreground">{t('appointments.review')}</span>
                  </div>
                  {data.review.comment ? (
                    <p className="mt-1.5 text-xs leading-relaxed">{data.review.comment}</p>
                  ) : null}
                </div>
              ) : null}

              {/* timeline */}
              <div>
                <h3 className="mb-2 text-xs font-semibold">{t('appointments.timeline')}</h3>
                <ol className="space-y-2.5 border-l border-border pl-4">
                  {data.timeline.map((ev, i) => (
                    <li key={i} className="relative">
                      <span
                        className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-card"
                        aria-hidden="true"
                      />
                      <p className="text-xs font-medium">{t(`status.${ev.label}`, { defaultValue: ev.label })}</p>
                      <p className="text-2xs text-muted-foreground">
                        <DateTimeText value={ev.at} mode="datetime" /> · {ev.by}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            </SheetBody>

            <SheetFooter className="flex-wrap gap-2">
              <Button asChild variant="ghost" size="sm" className="mr-auto">
                <Link to={ROUTES.appointmentDetail(data.id)}>
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  {t('appointments.openFull')}
                </Link>
              </Button>
              {canManage && data.status !== 'COMPLETED' && data.status !== 'CANCELLED' ? (
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => onReschedule(data.id)}>
                  <CalendarClock className="h-4 w-4" aria-hidden="true" />
                  {t('appointments.reschedule')}
                </Button>
              ) : null}
              {canManage && nextOptions.length > 0
                ? nextOptions.map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={DESTRUCTIVE_STATUS.includes(s) ? 'ghost' : 'secondary'}
                      disabled={pending}
                      onClick={() => onStatus(data.id, s)}
                      className={cn(DESTRUCTIVE_STATUS.includes(s) && 'text-destructive hover:text-destructive')}
                    >
                      {t(`status.${s}`)}
                    </Button>
                  ))
                : null}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
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
    <div className="px-3 py-2.5">
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
    <div className={cn('min-w-0', full && 'col-span-2')}>
      <dt className="flex items-center gap-1 text-2xs text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="mt-0.5 truncate text-xs font-medium">{children}</dd>
    </div>
  );
}

function Note({ icon: Icon, label, text }: { icon: typeof MessageSquareText; label: string; text: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2.5">
      <p className="flex items-center gap-1 text-2xs font-medium text-muted-foreground">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed">{text}</p>
    </div>
  );
}
