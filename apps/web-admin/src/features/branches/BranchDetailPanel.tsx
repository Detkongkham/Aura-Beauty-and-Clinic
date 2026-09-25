import type { BranchInsight } from '@abcp/shared-types';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CalendarOff,
  Check,
  Circle,
  ClipboardList,
  Copy,
  ExternalLink,
  Mail,
  MapPin,
  Minus,
  Navigation,
  Package,
  Pencil,
  Phone,
  QrCode,
  Sparkles,
  Star,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { toast } from '@/components/ui/sonner';
import { DailyBars, Figure, TonePill } from '@/features/payments-treasury/banks.parts';
import { dayjs, formatCompactNumber, formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';
import { useUiStore } from '@/store/ui.store';
import type { Branch } from '@/types/models';

import { BranchCheckInQrDialog } from './BranchCheckInQrDialog';
import { BranchArchiveAction, BranchCover, BranchHistory, BranchPhotos, BranchTargets, BranchWeekStrip } from './BranchDetailExtras';
import { BranchLocatorMap } from './BranchLocatorMap';
import { BranchMonogram, IssueLine, OpenPill, UtilMeter } from './branches.parts';
import {
  AMENITY_ICON,
  AMENITY_IDS,
  HEALTH_TONE,
  dayProgress,
  deltaPct,
  hasCoords,
  healthOf,
  lossRate,
  openState,
  setupChecks,
  weeklyHours,
  fmtDelta,
  type BranchIssue,
} from './branches.lib';
import { PROVINCE_BY_ID, provinceName } from './lao-provinces';

interface DetailProps {
  branch: Branch;
  insight: BranchInsight | undefined;
  issues: BranchIssue[];
  days: number;
  fromKey?: string;
  canManage: boolean;
  onEdit: (b: Branch) => void;
}

/** Inline right-hand panel used by the map view. */
export function BranchDetailPanel(props: Omit<DetailProps, 'branch'> & { branch: Branch | null }) {
  const { t } = useTranslation();
  if (!props.branch) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <EmptyState icon={MapPin} title={t('branches.detail.hint')} className="border-0 py-12" />
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none">
      <BranchDetailBody {...props} branch={props.branch} />
    </div>
  );
}

/** Right-side drawer used by the cards and compare views. */
export function BranchDetailSheet({
  onClose,
  ...props
}: Omit<DetailProps, 'branch'> & { branch: Branch | null; onClose: () => void }) {
  return (
    <Sheet open={Boolean(props.branch)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-[560px]">
        {props.branch ? <BranchDetailBody {...props} branch={props.branch} inSheet /> : null}
      </SheetContent>
    </Sheet>
  );
}

function BranchDetailBody({
  branch: b,
  insight: i,
  issues,
  days,
  fromKey,
  canManage,
  onEdit,
  inSheet,
}: DetailProps & { inSheet?: boolean }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const setActiveBranch = useUiStore((s) => s.setActiveBranch);
  const [qrOpen, setQrOpen] = useState(false);

  const nowHhmm = dayjs().tz().format('HH:mm');
  const { isOpen, boundary } = openState(b.openTime, b.closeTime, nowHhmm);
  const progress = b.isActive ? dayProgress(b.openTime, b.closeTime, nowHhmm) : null;
  const coords = hasCoords(b);
  const province = PROVINCE_BY_ID[b.province];
  const health = healthOf(issues);
  const checks = setupChecks(b, i);
  const passed = checks.filter((c) => c.ok).length;
  const delta = i ? deltaPct(i.period.revenue, i.period.revenuePrev) : null;
  const DeltaIcon = delta == null || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  const loss = i ? lossRate(i) : null;

  const TitleTag = inSheet ? SheetTitle : 'h2';
  const DescTag = inSheet ? SheetDescription : 'p';

  const jump = (to: string) => {
    setActiveBranch(b.id);
    navigate(to);
  };

  const copyAddress = () => {
    navigator.clipboard
      ?.writeText(b.address)
      .then(() => toast.success(t('branches.addressCopied')))
      .catch(() => undefined);
  };

  return (
    <>
      <BranchCover b={b} />
      {/* Header */}
      <div className={cn('flex items-start gap-3 p-4', inSheet && 'pr-12 pt-5')}>
        <BranchMonogram code={b.code} name={b.name} size="lg" />
        <div className="min-w-0 flex-1">
          <TitleTag className="line-clamp-2 text-base font-semibold leading-tight text-foreground">{b.name}</TitleTag>
          <DescTag className="mt-0.5 truncate text-2xs text-muted-foreground">
            {b.code ? <span className="font-mono">{b.code} · </span> : null}
            {provinceName(b.province, i18n.language)} · {b.timezone}
          </DescTag>
          {b.managerName ? (
            <p className="mt-0.5 truncate text-2xs text-muted-foreground">{t('branches.extras.managedBy', { name: b.managerName })}</p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap gap-1">
            <OpenPill isOpen={isOpen} boundary={boundary} inactive={!b.isActive} />
            {i ? <TonePill tone={HEALTH_TONE[health]}>{t(`branches.health.${health}`)}</TonePill> : null}
          </div>
        </div>
        {canManage ? (
          <Button variant="secondary" size="sm" className="h-8 shrink-0 gap-1.5" onClick={() => onEdit(b)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            {t('common.edit')}
          </Button>
        ) : null}
      </div>

      {/* Opening window with a "now" marker */}
      <div className="px-4 pb-3">
        <div className="flex justify-between text-2xs tabular-nums text-muted-foreground">
          <span>{b.openTime}</span>
          <span>{t('branches.detail.weekly', { count: weeklyHours(b.openTime, b.closeTime) })}</span>
          <span>{b.closeTime}</span>
        </div>
        <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          {progress != null ? (
            <span className="absolute inset-y-0 left-0 rounded-full bg-success/70" style={{ width: `${progress * 100}%` }} />
          ) : null}
        </div>
      </div>

      <BranchWeekStrip b={b} />
      <BranchTargets i={i} />

      {i ? (
        <>
          {/* Today — live */}
          <Section icon={CalendarClock} title={t('branches.detail.today')}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Figure label={t('branches.detail.apptToday')} value={i.today.appointments} hint={t('branches.detail.done', { count: i.today.completed })} />
              <Figure label={t('branches.detail.inService')} value={i.today.inProgress} />
              <Figure label={t('branches.detail.upcoming')} value={i.today.upcoming} />
              <Figure label={t('branches.detail.queue')} value={i.today.queueWaiting} tone={i.today.queueWaiting >= 5 ? 'warning' : undefined} />
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <span className="w-28 shrink-0 text-2xs text-muted-foreground">{t('branches.detail.utilToday')}</span>
              <UtilMeter value={i.today.utilization} className="flex-1" />
            </div>
          </Section>

          {/* Period performance */}
          <Section
            icon={Sparkles}
            title={t('branches.detail.period', { days })}
            aside={
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 text-2xs font-semibold tabular-nums',
                  delta == null || delta === 0 ? 'text-muted-foreground' : delta > 0 ? 'text-success' : 'text-destructive',
                )}
                title={t('branches.hero.prev', { amount: formatCurrency(i.period.revenuePrev) })}
              >
                <DeltaIcon className="h-3 w-3" aria-hidden="true" />
                {delta == null ? t('branches.card.new') : fmtDelta(delta)}
              </span>
            }
          >
            <p className="text-2xl font-semibold leading-none tabular-nums">{formatCurrency(i.period.revenue)}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Figure label={t('branches.col.bookings')} value={i.period.bookings} hint={t('branches.card.customers', { count: i.period.customers })} />
              <Figure label={t('branches.col.avgTicket')} value={formatCompactNumber(i.period.avgTicket)} />
              <Figure
                label={t('branches.col.loss')}
                value={loss == null ? '—' : `${Math.round(loss * 100)}%`}
                tone={loss != null && loss >= 0.2 ? 'danger' : undefined}
                hint={t('branches.detail.lossSplit', { cancelled: i.period.cancelled, noShow: i.period.noShow })}
              />
              <Figure
                label={t('branches.col.rating')}
                value={
                  i.rating.avg != null ? (
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3 w-3 fill-warning text-warning" aria-hidden="true" />
                      {i.rating.avg.toFixed(1)}
                    </span>
                  ) : (
                    '—'
                  )
                }
                hint={t('branches.card.reviews', { count: i.rating.count })}
              />
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <span className="w-28 shrink-0 text-2xs text-muted-foreground">{t('branches.util.label')}</span>
              <UtilMeter value={i.period.utilization} className="flex-1" />
            </div>
            {fromKey ? (
              <div className="mt-3">
                <DailyBars values={i.period.daily} fromKey={fromKey} height={56} />
              </div>
            ) : null}
          </Section>

          {/* Attention */}
          {issues.length > 0 ? (
            <Section icon={ClipboardList} title={t('branches.attention.title')} aside={<span className="text-2xs text-muted-foreground">{issues.length}</span>}>
              <div className="space-y-1.5">
                {issues.map((x) => (
                  <IssueLine key={x.kind} issue={x} />
                ))}
              </div>
            </Section>
          ) : null}

          {/* Resources */}
          <Section icon={Users} title={t('branches.detail.resources')}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Figure label={t('branches.res.staff')} value={i.staffCount} />
              <Figure label={t('branches.res.rooms')} value={`${i.roomsAvailable}/${i.roomCount}`} hint={t('branches.detail.roomsAvail')} />
              <Figure label={t('branches.res.equipment')} value={i.equipmentCount} />
              <Figure label={t('branches.res.services')} value={i.serviceCount} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Figure
                label={t('branches.detail.lowStock')}
                value={i.lowStock}
                tone={i.lowStock > 0 ? 'warning' : undefined}
              />
              <Figure
                label={t('branches.detail.unpaid')}
                value={i.outstandingBills > 0 ? `${i.outstandingBills} · ${formatCompactNumber(i.outstandingAmount)}` : 0}
                tone={i.outstandingBills > 0 ? 'warning' : undefined}
              />
            </div>
          </Section>
        </>
      ) : null}

      {/* Quick jumps — scope the whole console to this branch, then go */}
      <Section icon={Navigation} title={t('branches.detail.jump')}>
        <div className="grid grid-cols-2 gap-2">
          <JumpButton icon={CalendarClock} label={t('branches.jump.appointments')} onClick={() => jump(ROUTES.appointments)} />
          <JumpButton icon={ClipboardList} label={t('branches.jump.queue')} onClick={() => jump(ROUTES.queue)} />
          <JumpButton icon={Package} label={t('branches.jump.inventory')} onClick={() => jump(ROUTES.inventory)} />
          <JumpButton icon={Users} label={t('branches.jump.staff')} onClick={() => jump(ROUTES.staff)} />
        </div>
      </Section>

      {/* Setup completeness */}
      <Section
        icon={Check}
        title={t('branches.setup.title')}
        aside={<span className="text-2xs font-semibold tabular-nums text-muted-foreground">{passed}/{checks.length}</span>}
      >
        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <span
            className={cn('block h-full rounded-full', passed === checks.length ? 'bg-success' : 'bg-primary')}
            style={{ width: `${(passed / checks.length) * 100}%` }}
          />
        </div>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
          {checks.map((c) => (
            <li key={c.key} className="flex items-center gap-1.5 text-xs">
              {c.ok ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
              ) : (
                <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
              )}
              <span className={c.ok ? 'text-foreground' : 'text-muted-foreground'}>
                {t(`branches.setup.${c.key}`)}
                <span className="sr-only"> — {c.ok ? t('branches.setup.done') : t('branches.setup.missing')}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Amenities */}
      <Section icon={Sparkles} title={t('branches.amenities.title')}>
        {b.amenities && b.amenities.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {AMENITY_IDS.filter((a) => b.amenities?.includes(a)).map((a) => {
              const Icon = AMENITY_ICON[a];
              return (
                <li key={a} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs">
                  <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  {t(`branches.amenities.${a}`)}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">{t('branches.amenities.none')}</p>
        )}
      </Section>

      {/* Closures */}
      {i ? (
        <Section
          icon={CalendarOff}
          title={t('branches.detail.closures')}
          aside={
            <Link to={ROUTES.branchClosures} className="text-2xs font-medium text-primary hover:underline">
              {t('branches.detail.manageClosures')}
            </Link>
          }
        >
          {i.closures.length ? (
            <ul className="space-y-1">
              {i.closures.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate">
                    <span className="font-medium tabular-nums">{formatDate(c.date)}</span> · {c.reason}
                  </span>
                  {c.companyWide ? (
                    <span className="shrink-0 rounded bg-muted px-1.5 text-[10px] text-muted-foreground">{t('branches.detail.companyWide')}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{t('branches.detail.noClosures')}</p>
          )}
        </Section>
      ) : null}

      <BranchPhotos b={b} />
      {canManage ? <BranchHistory b={b} /> : null}

      {/* Contact */}
      <Section icon={MapPin} title={t('branches.detail.contact')}>
        <div className="space-y-2.5">
          <InfoRow icon={MapPin} label={t('branches.address')}>
            <p className="text-sm text-foreground">{b.address || '–'}</p>
          </InfoRow>
          <div className="grid grid-cols-2 gap-3">
            <InfoRow icon={Phone} label={t('branches.phone')}>
              {b.phone ? (
                <a href={`tel:${b.phone}`} className="text-sm font-medium tabular-nums text-primary hover:underline">
                  {b.phone}
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">–</p>
              )}
            </InfoRow>
            <InfoRow icon={Mail} label={t('branches.email')}>
              {b.email ? (
                <a href={`mailto:${b.email}`} className="block truncate text-sm font-medium text-primary hover:underline">
                  {b.email}
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">–</p>
              )}
            </InfoRow>
          </div>
          <InfoRow icon={Navigation} label={t('branches.coordinates')}>
            <p className="text-xs tabular-nums text-muted-foreground">
              {coords ? `${b.latitude.toFixed(5)}, ${b.longitude.toFixed(5)}` : t('branches.noCoordinates')}
            </p>
          </InfoRow>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {b.phone ? <ActionLink href={`tel:${b.phone}`} icon={Phone} label={t('branches.call')} /> : null}
          {coords ? (
            <ActionLink
              href={`https://www.google.com/maps/dir/?api=1&destination=${b.latitude},${b.longitude}`}
              icon={Navigation}
              label={t('branches.directions')}
              external
            />
          ) : null}
          {coords ? (
            <ActionLink
              href={`https://www.google.com/maps/search/?api=1&query=${b.latitude},${b.longitude}`}
              icon={ExternalLink}
              label={t('branches.viewOnGoogleMaps')}
              external
            />
          ) : null}
          {b.address ? (
            <button type="button" onClick={copyAddress} className={ACTION_CLS}>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              {t('branches.copyAddress')}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setQrOpen(true)}
          className="mt-3 flex w-full items-center gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2.5 text-left transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <QrCode className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">{t('branches.checkInQr.title')}</span>
            <span className="block truncate text-xs text-muted-foreground">{t('branches.checkInQr.rowHint')}</span>
          </span>
        </button>
      </Section>

      {province ? (
        <div className="border-t border-border px-4 py-4">
          <p className="mb-1.5 text-2xs font-medium text-muted-foreground">{t('branches.detail.locationInProvince')}</p>
          <div className="overflow-hidden rounded-lg border border-border bg-muted/30 p-2">
            <BranchLocatorMap provinceId={b.province} />
          </div>
        </div>
      ) : null}

      <BranchCheckInQrDialog branch={b} open={qrOpen} onOpenChange={setQrOpen} />
      {canManage ? <BranchArchiveAction b={b} upcoming={i?.upcomingAppointments ?? 0} /> : null}
    </>
  );
}

function Section({ icon: Icon, title, aside, children }: { icon: LucideIcon; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-border px-4 py-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function InfoRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-2xs font-medium text-muted-foreground">{label}</p>
        <div className="mt-0.5 break-words">{children}</div>
      </div>
    </div>
  );
}

function JumpButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-xs font-medium transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
    >
      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

const ACTION_CLS =
  'inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none';

function ActionLink({ href, icon: Icon, label, external }: { href: string; icon: LucideIcon; label: string; external?: boolean }) {
  return (
    <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})} className={ACTION_CLS}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </a>
  );
}
