import {
  BellRing,
  CalendarClock,
  Crown,
  ExternalLink,
  Hourglass,
  MapPin,
  Phone,
  Scissors,
  StickyNote,
  Timer,
  Undo2,
  UserRound,
  UserX,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { CurrencyText } from '@/components/shared/CurrencyText';
import { DateTimeText } from '@/components/shared/DateTimeText';
import { StatusPill } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { useStaffList } from '@/features/staff/staff.api';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';
import { NormalizedApiError } from '@/services/apiError';
import type { QueueTicket } from '@/types/models';

import type { TicketHandlers } from './TicketActionsMenu';
import { TicketTags } from './TicketTags';
import { useUpdateTicketDetails, type QueueStatus } from './queue.api';
import { ADVANCE_ICON, NEXT, completedWait, serviceMinutes, urgencyOf, type ActiveStatus } from './queue.lib';

interface Props {
  ticket: QueueTicket | null;
  onOpenChange: (open: boolean) => void;
  now: number;
  position: number | null;
  etaMin: number | null;
  canManage: boolean;
  pending: boolean;
  fmtWait: (minutes: number) => string;
  handlers: TicketHandlers;
}

const HERO: Record<string, string> = {
  WAITING: 'from-muted to-card',
  CALLED: 'from-primary/15 to-card',
  IN_SERVICE: 'from-success-soft to-card',
  COMPLETED: 'from-success-soft/70 to-card',
  CANCELLED: 'from-destructive-soft/70 to-card',
};
const NUM_TONE: Record<string, string> = {
  WAITING: 'text-foreground',
  CALLED: 'text-primary',
  IN_SERVICE: 'text-success',
  COMPLETED: 'text-success',
  CANCELLED: 'text-muted-foreground line-through',
};

function Metric({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </p>
      <p className={cn('mt-1 text-lg font-semibold tabular-nums', tone)}>{value}</p>
    </div>
  );
}

function Row({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-2xs text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-sm">{children}</div>
      </div>
    </div>
  );
}

export function TicketDetailSheet({
  ticket,
  onOpenChange,
  now,
  position,
  etaMin,
  canManage,
  pending,
  fmtWait,
  handlers,
}: Props) {
  const { t } = useTranslation();
  const update = useUpdateTicketDetails();
  const [note, setNote] = useState('');
  useEffect(() => setNote(ticket?.note ?? ''), [ticket?.id, ticket?.note]);

  const { data: staffPage } = useStaffList(
    { page: 1, pageSize: 100, branchId: ticket?.branchId },
    { enabled: !!ticket && canManage },
  );

  const save = (input: Parameters<typeof update.mutate>[0], okMsg: string) =>
    update.mutate(input, {
      onSuccess: () => toast.success(okMsg),
      onError: (err) =>
        toast.error(err instanceof NormalizedApiError ? err.message : t('services.saveError')),
    });

  const status = ticket?.status ?? 'WAITING';
  const isActive = status === 'WAITING' || status === 'CALLED' || status === 'IN_SERVICE';
  const next = NEXT[status as QueueStatus];
  const NextIcon = next ? ADVANCE_ICON[next] : null;
  const u = ticket && isActive ? urgencyOf(ticket, now) : null;
  const wait = ticket ? completedWait(ticket) : null;
  const svc = ticket ? serviceMinutes(ticket) : null;

  const steps = ticket
    ? [
        { key: 'issued', label: t('queue.step.issued'), at: ticket.issuedAt, done: true },
        {
          key: 'called',
          label: t('queue.step.called'),
          at: ticket.calledAt,
          done: !!ticket.calledAt,
          extra:
            (ticket.callCount ?? 0) > 1 && ticket.lastCalledAt ? (
              <>
                {t('queue.calledTimes', { n: ticket.callCount })} · {t('queue.lastCall')}{' '}
                <DateTimeText value={ticket.lastCalledAt} mode="time" />
              </>
            ) : null,
        },
        { key: 'started', label: t('queue.step.started'), at: ticket.startedAt ?? null, done: !!ticket.startedAt },
        status === 'CANCELLED'
          ? {
              key: 'cancelled',
              label: t('queue.step.cancelled'),
              at: ticket.cancelledAt ?? null,
              done: true,
              danger: true,
              extra: t(`queue.reason.${ticket.cancelReason ?? 'OTHER'}`),
            }
          : { key: 'completed', label: t('queue.step.completed'), at: ticket.completedAt ?? null, done: !!ticket.completedAt },
      ]
    : [];

  return (
    <Sheet open={ticket != null} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-[460px] gap-0 p-0">
        {ticket ? (
          <>
            {/* ── hero ─────────────────────────────────────────── */}
            <div className={cn('border-b border-border bg-gradient-to-b px-6 pb-5 pt-6', HERO[status])}>
              <SheetDescription className="text-2xs">{t('queue.detailTitle')}</SheetDescription>
              <div className="mt-2 flex items-end justify-between gap-3 pr-6">
                <SheetTitle className={cn('text-4xl font-bold leading-none tabular-nums', NUM_TONE[status])}>
                  {ticket.number}
                </SheetTitle>
                <StatusPill status={status} label={t(`status.${status}`)} />
              </div>
              <p className="mt-3 text-base font-semibold">{ticket.customerName}</p>
              <TicketTags ticket={ticket} className="mt-1" />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {ticket.customerPhone ? (
                  <Button asChild variant="secondary" size="sm" className="h-8">
                    <a href={`tel:${ticket.customerPhone}`}>
                      <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                      {ticket.customerPhone}
                    </a>
                  </Button>
                ) : null}
                {ticket.appointmentId ? (
                  <Button asChild variant="ghost" size="sm" className="h-8">
                    <Link to={ROUTES.appointmentDetail(ticket.appointmentId)}>
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('queue.openAppointment')}
                    </Link>
                  </Button>
                ) : null}
                {ticket.customerId ? (
                  <Button asChild variant="ghost" size="sm" className="h-8">
                    <Link to={ROUTES.customerDetail(ticket.customerId)}>
                      <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('queue.openCustomer')}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>

            <SheetBody className="space-y-5 py-5">
              {/* ── actions ────────────────────────────────────── */}
              {canManage && (isActive || status === 'CANCELLED') ? (
                <div className="flex flex-wrap gap-2">
                  {next && NextIcon ? (
                    <Button className="flex-1" disabled={pending} onClick={() => handlers.advance(ticket)}>
                      <NextIcon className="h-4 w-4" aria-hidden="true" />
                      {t(`queue.advanceTo.${next}`)}
                    </Button>
                  ) : null}
                  {status === 'CALLED' ? (
                    <>
                      <Button variant="secondary" disabled={pending} onClick={() => handlers.recall(ticket)}>
                        <BellRing className="h-4 w-4" aria-hidden="true" />
                        {t('queue.recall')}
                      </Button>
                      <Button variant="secondary" disabled={pending} onClick={() => handlers.sendBack(ticket)}>
                        <Undo2 className="h-4 w-4" aria-hidden="true" />
                        {t('queue.sendBack')}
                      </Button>
                    </>
                  ) : null}
                  {status === 'CANCELLED' && ticket.cancelReason !== 'EXPIRED' ? (
                    <Button variant="secondary" className="flex-1" disabled={pending} onClick={() => handlers.restore(ticket)}>
                      <Undo2 className="h-4 w-4" aria-hidden="true" />
                      {t('queue.restore')}
                    </Button>
                  ) : null}
                  {status === 'WAITING' || status === 'CALLED' ? (
                    <Button
                      variant="ghost"
                      className="text-destructive hover:bg-destructive-soft"
                      disabled={pending}
                      onClick={() => handlers.cancel(ticket, 'NO_SHOW')}
                    >
                      <UserX className="h-4 w-4" aria-hidden="true" />
                      {t('queue.markNoShow')}
                    </Button>
                  ) : null}
                  {isActive ? (
                    <Button
                      variant="ghost"
                      className="text-destructive hover:bg-destructive-soft"
                      disabled={pending}
                      onClick={() => handlers.cancel(ticket)}
                    >
                      <XCircle className="h-4 w-4" aria-hidden="true" />
                      {t('queue.cancelTicket')}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {/* ── metrics ────────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-2.5">
                {status === 'WAITING' ? (
                  <>
                    <Metric icon={Hourglass} label={t('queue.positionLabel')} value={position ? `#${position}` : '–'} />
                    <Metric
                      icon={Timer}
                      label={t('queue.estStart')}
                      value={etaMin == null ? '–' : etaMin === 0 ? t('queue.readyNow') : `~${fmtWait(etaMin)}`}
                    />
                  </>
                ) : (
                  <Metric icon={Hourglass} label={t('queue.waitTime')} value={wait != null ? fmtWait(wait) : '–'} />
                )}
                {u ? (
                  <Metric
                    icon={Timer}
                    label={t(`queue.elapsedIn.${status as ActiveStatus}`)}
                    value={fmtWait(u.elapsedMin)}
                    tone={u.level === 'late' ? 'text-destructive' : u.level === 'warn' ? 'text-warning' : undefined}
                  />
                ) : svc != null ? (
                  <Metric icon={Scissors} label={t('queue.serviceTime')} value={fmtWait(svc)} />
                ) : null}
              </div>

              {/* ── timeline ───────────────────────────────────── */}
              <section>
                <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{t('queue.timeline')}</h3>
                <ol className="relative space-y-3 pl-5 before:absolute before:bottom-1 before:left-[5px] before:top-1 before:w-px before:bg-border">
                  {steps.map((s) => (
                    <li key={s.key} className="relative">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'absolute -left-5 top-1 h-[11px] w-[11px] rounded-full border-2',
                          s.done
                            ? 'danger' in s && s.danger
                              ? 'border-destructive bg-destructive'
                              : 'border-primary bg-primary'
                            : 'border-border bg-card',
                        )}
                      />
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={cn('text-sm', s.done ? 'font-medium' : 'text-muted-foreground')}>{s.label}</span>
                        <span className="text-2xs tabular-nums text-muted-foreground">
                          {s.at ? <DateTimeText value={s.at} mode="time" /> : t('queue.notReached')}
                        </span>
                      </div>
                      {'extra' in s && s.extra ? <p className="text-2xs text-muted-foreground">{s.extra}</p> : null}
                    </li>
                  ))}
                </ol>
              </section>

              {/* ── details ────────────────────────────────────── */}
              <section className="divide-y divide-border rounded-xl border border-border px-4">
                <Row icon={Scissors} label={t('appointments.service')}>
                  <p className="font-medium">{ticket.serviceName}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-2xs text-muted-foreground">
                    {ticket.serviceDurationMin ? <span>{t('queue.estDuration', { n: ticket.serviceDurationMin })}</span> : null}
                    {ticket.servicePrice ? <CurrencyText amount={ticket.servicePrice} /> : null}
                  </p>
                </Row>
                <Row icon={UserRound} label={t('appointments.staff')}>
                  {canManage && isActive && ticket.appointmentId ? (
                    <select
                      aria-label={t('queue.reassignStaff')}
                      value={ticket.staffProfileId ?? ''}
                      disabled={update.isPending}
                      onChange={(e) =>
                        e.target.value &&
                        save({ id: ticket.id, staffProfileId: e.target.value }, t('queue.staffReassigned'))
                      }
                      className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
                    >
                      {!ticket.staffProfileId ? <option value="">{t('queue.anyStaff')}</option> : null}
                      {(staffPage?.items ?? [])
                        .filter((s) => s.isActive || s.id === ticket.staffProfileId)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <p className="font-medium">{ticket.staffName ?? t('queue.anyStaff')}</p>
                  )}
                </Row>
                {ticket.branchName ? (
                  <Row icon={MapPin} label={t('nav.branches')}>
                    {ticket.branchName}
                  </Row>
                ) : null}
                <Row icon={CalendarClock} label={t('queue.visitHistory')}>
                  {ticket.customerId
                    ? (ticket.visitCount ?? 0) === 0
                      ? t('queue.firstVisit')
                      : t('queue.visitsTitle', { n: ticket.visitCount })
                    : t('queue.guestCustomer')}
                </Row>
              </section>

              {/* ── priority + note ────────────────────────────── */}
              {canManage && (status === 'WAITING' || status === 'CALLED') ? (
                <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-4">
                  <span className="flex items-start gap-3">
                    <Crown className="mt-0.5 h-4 w-4 text-accent" aria-hidden="true" />
                    <span>
                      <span className="block text-sm font-medium">{t('queue.vipPriority')}</span>
                      <span className="block text-2xs text-muted-foreground">{t('queue.vipPriorityHint')}</span>
                    </span>
                  </span>
                  <Switch
                    checked={ticket.priority === 'VIP'}
                    disabled={update.isPending}
                    onCheckedChange={(on) =>
                      save({ id: ticket.id, priority: on ? 'VIP' : 'NORMAL' }, on ? t('queue.vipOn') : t('queue.vipOff'))
                    }
                  />
                </label>
              ) : null}

              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('queue.note')}
                </h3>
                {canManage ? (
                  <>
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder={t('queue.notePlaceholder')}
                      aria-label={t('queue.note')}
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-2xs tabular-nums text-muted-foreground">{note.length}/500</span>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={update.isPending || note === (ticket.note ?? '')}
                        onClick={() => save({ id: ticket.id, note: note.trim() || null }, t('queue.noteSaved'))}
                      >
                        {t('common.save')}
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">{ticket.note || '–'}</p>
                )}
              </section>
            </SheetBody>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
