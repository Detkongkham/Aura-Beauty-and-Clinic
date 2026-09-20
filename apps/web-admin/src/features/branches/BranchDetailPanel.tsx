import {
  Building2,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  MapPin,
  Navigation,
  Pencil,
  Phone,
  QrCode,
  Users,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { useAppointments } from '@/features/appointments/appointments.api';
import { useStaffList } from '@/features/staff/staff.api';
import { dayjs } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Branch } from '@/types/models';

import { BranchCheckInQrDialog } from './BranchCheckInQrDialog';
import { BranchLocatorMap } from './BranchLocatorMap';
import { PROVINCE_BY_ID, provinceName } from './lao-provinces';

interface BranchDetailPanelProps {
  branch: Branch | null;
  canManage: boolean;
  onEdit: (b: Branch) => void;
}

/** Open state + the next schedule boundary (close time if open, else open time). */
function openState(open: string, close: string, now: string): { isOpen: boolean; boundary: string } {
  if (!open || !close) return { isOpen: false, boundary: open || close };
  const isOpen =
    open === close ? true : open < close ? now >= open && now < close : now >= open || now < close;
  return { isOpen, boundary: isOpen ? close : open };
}

function hasCoords(b: Branch): boolean {
  return (
    Number.isFinite(b.latitude) && Number.isFinite(b.longitude) && (b.latitude !== 0 || b.longitude !== 0)
  );
}

/** Minutes a branch is open per week, from HH:mm strings (handles past-midnight). */
function weeklyHours(open: string, close: string): number {
  const toMin = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  let span = toMin(close) - toMin(open);
  if (span <= 0) span += 24 * 60;
  return Math.round((span / 60) * 7);
}

export function BranchDetailPanel({ branch, canManage, onEdit }: BranchDetailPanelProps) {
  const { t } = useTranslation();

  if (!branch) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <EmptyState icon={MapPin} title={t('branches.detail.hint')} className="border-0 py-12" />
      </div>
    );
  }

  return <BranchDetailContent branch={branch} canManage={canManage} onEdit={onEdit} />;
}

function BranchDetailContent({
  branch,
  canManage,
  onEdit,
}: {
  branch: Branch;
  canManage: boolean;
  onEdit: (b: Branch) => void;
}) {
  const { t, i18n } = useTranslation();
  const [qrOpen, setQrOpen] = useState(false);

  const staffQuery = useStaffList({ branchId: branch.id, page: 1, pageSize: 1 });
  const apptQuery = useAppointments({
    branchId: branch.id,
    from: dayjs().tz().toISOString(),
    to: dayjs().tz().add(7, 'day').toISOString(),
    page: 1,
    pageSize: 1,
  });

  const nowHhmm = dayjs().tz().format('HH:mm');
  const { isOpen, boundary } = openState(branch.openTime, branch.closeTime, nowHhmm);
  const coords = hasCoords(branch);
  const province = PROVINCE_BY_ID[branch.province];

  const copyAddress = () => {
    navigator.clipboard
      ?.writeText(branch.address)
      .then(() => toast.success(t('branches.addressCopied')))
      .catch(() => undefined);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none">
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Building2 className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-base font-semibold leading-tight text-foreground">
            {branch.name}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
              {branch.code}
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[11px] font-medium',
                branch.isActive ? 'text-success' : 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  branch.isActive ? 'bg-success' : 'bg-muted-foreground/50',
                )}
                aria-hidden="true"
              />
              {branch.isActive ? t('branches.summary.active') : t('branches.summary.inactive')}
            </span>
          </div>
        </div>
        {canManage ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => onEdit(branch)}
            aria-label={t('common.edit')}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      {/* Open-now strip */}
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-2 text-xs font-medium',
          isOpen ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground',
        )}
      >
        <span className="relative flex h-2 w-2" aria-hidden="true">
          {isOpen ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
          ) : null}
          <span
            className={cn(
              'relative inline-flex h-2 w-2 rounded-full',
              isOpen ? 'bg-success' : 'bg-muted-foreground/50',
            )}
          />
        </span>
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        {isOpen
          ? t('branches.openUntil', { time: boundary })
          : t('branches.opensAt', { time: boundary })}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
        <MiniStat
          icon={Users}
          label={t('branches.detail.staff')}
          value={staffQuery.isLoading ? '·' : (staffQuery.data?.total ?? 0)}
        />
        <MiniStat
          icon={Clock}
          label={t('branches.detail.appt7d')}
          value={apptQuery.isLoading ? '·' : (apptQuery.data?.total ?? 0)}
        />
        <MiniStat
          icon={Clock}
          label={t('branches.detail.hoursPerWeek')}
          value={weeklyHours(branch.openTime, branch.closeTime)}
        />
      </div>

      {/* Details */}
      <div className="space-y-3.5 p-4">
        <InfoRow icon={MapPin} label={t('branches.address')}>
          <p className="text-sm text-foreground">{branch.address || '–'}</p>
          <span className="mt-1 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            {provinceName(branch.province, i18n.language)}
          </span>
        </InfoRow>

        <div className="grid grid-cols-2 gap-3">
          <InfoRow icon={Clock} label={t('branches.hours')}>
            <p className="text-sm tabular-nums text-foreground">
              {branch.openTime}
              <span className="text-muted-foreground">–</span>
              {branch.closeTime}
            </p>
          </InfoRow>
          <InfoRow icon={Globe} label={t('branches.timezone')}>
            <p className="truncate text-sm text-foreground">{branch.timezone}</p>
          </InfoRow>
        </div>

        <button
          type="button"
          onClick={() => setQrOpen(true)}
          className="flex w-full items-center gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2.5 text-left transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <QrCode className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">{t('branches.checkInQr.title')}</span>
            <span className="block truncate text-xs text-muted-foreground">{t('branches.checkInQr.rowHint')}</span>
          </span>
        </button>

        <InfoRow icon={Phone} label={t('branches.phone')}>
          {branch.phone ? (
            <a
              href={`tel:${branch.phone}`}
              className="text-sm font-medium tabular-nums text-primary hover:underline"
            >
              {branch.phone}
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">–</p>
          )}
        </InfoRow>
      </div>

      {/* Mini locator map */}
      {province ? (
        <div className="px-4 pb-4">
          <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
            {t('branches.detail.locationInProvince')}
          </p>
          <div className="overflow-hidden rounded-lg border border-border bg-muted/30 p-2">
            <BranchLocatorMap provinceId={branch.province} />
          </div>
        </div>
      ) : null}

      {/* Coordinates + actions */}
      <div className="border-t border-border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <Navigation className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          {coords ? (
            <span className="truncate text-xs tabular-nums text-muted-foreground">
              {branch.latitude.toFixed(4)}, {branch.longitude.toFixed(4)}
            </span>
          ) : (
            <span className="truncate text-xs text-muted-foreground">
              {t('branches.noCoordinates')}
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {branch.phone ? (
            <ActionLink href={`tel:${branch.phone}`} icon={Phone} label={t('branches.call')} />
          ) : null}
          {coords ? (
            <ActionLink
              href={`https://www.google.com/maps/dir/?api=1&destination=${branch.latitude},${branch.longitude}`}
              icon={Navigation}
              label={t('branches.directions')}
              external
            />
          ) : null}
          {coords ? (
            <ActionLink
              href={`https://www.google.com/maps/search/?api=1&query=${branch.latitude},${branch.longitude}`}
              icon={ExternalLink}
              label={t('branches.viewOnGoogleMaps')}
              external
            />
          ) : null}
          {branch.address ? (
            <button
              type="button"
              onClick={copyAddress}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted motion-reduce:transition-none"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              {t('branches.copyAddress')}
            </button>
          ) : null}
        </div>
      </div>

      <BranchCheckInQrDialog branch={branch} open={qrOpen} onOpenChange={setQrOpen} />
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-2 py-2.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      <span className="text-base font-bold tabular-nums leading-none text-foreground">{value}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <div className="mt-0.5 break-words">{children}</div>
      </div>
    </div>
  );
}

function ActionLink({
  href,
  icon: Icon,
  label,
  external,
}: {
  href: string;
  icon: typeof Phone;
  label: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted motion-reduce:transition-none"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </a>
  );
}

