import type { BranchInsight } from '@abcp/shared-types';
import { Archive, CalendarDays, History, Images, Target, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { DateTimeText } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/features/auth/useAuth';
import { useConfirm } from '@/hooks/useConfirm';
import { formatCompactNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';
import type { Branch } from '@/types/models';

import { useArchiveBranch, useArchivedBranches, useBranchHistory } from './branches.api';

/** Wave 11 — detail-panel pieces for the branch fields added in this wave. */

function Block({ icon: Icon, title, aside, children }: { icon: LucideIcon; title: string; aside?: ReactNode; children: ReactNode }) {
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

export function BranchCover({ b }: { b: Branch }) {
  if (!b.coverImageUrl) return null;
  return <img src={b.coverImageUrl} alt="" className="h-32 w-full object-cover" loading="lazy" />;
}

/** Sun → Sat strip; today highlighted. Only when per-day hours are set. */
export function BranchWeekStrip({ b }: { b: Branch }) {
  const { t } = useTranslation();
  if (!b.weeklyHours?.length) return null;
  const names = t('branches.extras.dayNames', { returnObjects: true }) as string[];
  const today = new Date(Date.now() + 7 * 3_600_000).getUTCDay();
  return (
    <Block icon={CalendarDays} title={t('branches.extras.weeklyTitle')}>
      <ul className="grid grid-cols-7 gap-1 text-center text-2xs">
        {Array.from({ length: 7 }, (_, day) => {
          const d = b.weeklyHours!.find((x) => x.day === day);
          const closed = d?.closed;
          return (
            <li key={day} className={cn('rounded-md border border-border px-0.5 py-1', day === today && 'border-primary bg-primary/5')}>
              <div className="font-medium">{names[day]?.slice(0, 3)}</div>
              {closed ? (
                <div className="text-destructive">{t('branches.extras.closed')}</div>
              ) : (
                <div className="tabular-nums text-muted-foreground">
                  {d?.open ?? b.openTime}
                  <br />
                  {d?.close ?? b.closeTime}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Block>
  );
}

function Meter({ label, value, target, pace }: { label: string; value: number; target: number; pace: number }) {
  const pct = target > 0 ? value / target : 0;
  const behind = pct < pace - 0.05;
  return (
    <div>
      <div className="flex justify-between text-2xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium">
          {formatCompactNumber(value)} / {formatCompactNumber(target)} · {Math.round(pct * 100)}%
        </span>
      </div>
      <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span className={cn('absolute inset-y-0 left-0 rounded-full', behind ? 'bg-warning' : 'bg-success')} style={{ width: `${Math.min(100, pct * 100)}%` }} />
        <span className="absolute inset-y-0 w-px bg-foreground/50" style={{ left: `${Math.min(100, pace * 100)}%` }} />
      </div>
    </div>
  );
}

/** Month-to-date vs target, with a pace marker (share of the month elapsed). */
export function BranchTargets({ i }: { i: BranchInsight | undefined }) {
  const { t } = useTranslation();
  const m = i?.month;
  if (!m || (m.revenueTarget == null && m.bookingTarget == null)) return null;
  const pace = m.dayOfMonth / m.daysInMonth;
  return (
    <Block icon={Target} title={t('branches.extras.targetsTitle')} aside={<span className="text-2xs text-muted-foreground">{t('branches.extras.pace', { day: m.dayOfMonth, days: m.daysInMonth })}</span>}>
      <div className="space-y-2.5">
        {m.revenueTarget != null ? <Meter label={t('branches.extras.revenueTarget')} value={m.revenue} target={m.revenueTarget} pace={pace} /> : null}
        {m.bookingTarget != null ? <Meter label={t('branches.extras.bookingTarget')} value={m.completed} target={m.bookingTarget} pace={pace} /> : null}
      </div>
    </Block>
  );
}

export function BranchPhotos({ b }: { b: Branch }) {
  const { t } = useTranslation();
  if (!b.photoUrls?.length) return null;
  return (
    <Block icon={Images} title={t('branches.extras.photosTitle')} aside={<span className="text-2xs text-muted-foreground">{b.photoUrls.length}</span>}>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {b.photoUrls.map((u) => (
          <a key={u} href={u} target="_blank" rel="noreferrer" className="shrink-0">
            <img src={u} alt="" className="h-20 w-28 rounded-lg object-cover" loading="lazy" />
          </a>
        ))}
      </div>
    </Block>
  );
}

const fmtVal = (v: unknown): string =>
  v == null || v === '' ? '—' : Array.isArray(v) ? `${v.length}` : typeof v === 'object' ? '…' : String(v);

/** Change history from the audit log — collapsed until asked for. */
export function BranchHistory({ b }: { b: Branch }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const q = useBranchHistory(open ? b.id : null);
  return (
    <Block
      icon={History}
      title={t('branches.extras.historyTitle')}
      aside={
        <Button variant="ghost" size="sm" className="h-7 text-2xs" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? t('branches.extras.hide') : t('branches.extras.show')}
        </Button>
      }
    >
      {open ? (
        q.isLoading ? (
          <p className="text-2xs text-muted-foreground">…</p>
        ) : !q.data?.length ? (
          <p className="text-2xs text-muted-foreground">{t('branches.extras.historyEmpty')}</p>
        ) : (
          <ol className="space-y-2">
            {q.data.map((h) => (
              <li key={h.id} className="rounded-lg border border-border/70 p-2 text-2xs">
                <div className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
                  <span className="font-medium text-foreground">{t(`branches.extras.action.${h.action.replace('branch.', '')}`, { defaultValue: h.action })}</span>
                  <DateTimeText value={h.at} mode="datetime" />
                  {h.userName ? <span>· {h.userName}</span> : null}
                </div>
                {h.changes ? (
                  <ul className="mt-1 space-y-0.5">
                    {Object.entries(h.changes)
                      .slice(0, 8)
                      .map(([k, v]) => (
                        <li key={k} className="truncate">
                          <span className="font-mono text-muted-foreground">{k}</span>: {fmtVal(v.from)} → <span className="font-medium">{fmtVal(v.to)}</span>
                        </li>
                      ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        )
      ) : null}
    </Block>
  );
}

/** SUPER_ADMIN only — move a branch to the archive (soft delete, restorable). */
export function BranchArchiveAction({ b, upcoming }: { b: Branch; upcoming: number }) {
  const { t } = useTranslation();
  const { role } = useAuth();
  const confirm = useConfirm();
  const archive = useArchiveBranch();
  if (role !== 'SUPER_ADMIN') return null;
  const run = async () => {
    const ok = await confirm({
      title: t('branches.extras.archiveTitle', { name: b.name }),
      description: upcoming > 0 ? t('branches.extras.archiveUpcoming', { count: upcoming }) : t('branches.extras.archiveBody'),
      confirmLabel: t('branches.extras.archive'),
      destructive: true,
    });
    if (!ok) return;
    archive.mutate(
      { id: b.id, force: upcoming > 0 },
      {
        onSuccess: () => toast.success(t('branches.extras.archived')),
        onError: (e) => toast.error(e instanceof NormalizedApiError ? e.message : t('common.saveError')),
      },
    );
  };
  return (
    <div className="border-t border-border px-4 py-3">
      <Button variant="ghost" size="sm" className="text-destructive" onClick={run} disabled={archive.isPending}>
        <Archive className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        {t('branches.extras.archive')}
      </Button>
    </div>
  );
}

/** SUPER_ADMIN — archived branches with a restore button (bottom of /branches). */
export function ArchivedBranchesList() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const [open, setOpen] = useState(false);
  const q = useArchivedBranches(role === 'SUPER_ADMIN');
  const restore = useArchiveBranch();
  if (role !== 'SUPER_ADMIN' || !q.data?.length) return null;
  return (
    <section className="rounded-xl border border-border bg-card">
      <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="flex items-center gap-2">
          <Archive className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('branches.extras.archivedTitle', { count: q.data.length })}
        </span>
        <span className="text-xs text-muted-foreground">{open ? t('branches.extras.hide') : t('branches.extras.show')}</span>
      </button>
      {open ? (
        <ul className="divide-y divide-border border-t border-border">
          {q.data.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{b.name}</span>
                <span className="text-2xs text-muted-foreground">
                  {b.code} · {t('branches.extras.archivedAt')} <DateTimeText value={b.archivedAt!} />
                </span>
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={restore.isPending}
                onClick={() =>
                  restore.mutate(
                    { id: b.id, restore: true },
                    {
                      onSuccess: () => toast.success(t('branches.extras.restored')),
                      onError: (e) => toast.error(e instanceof NormalizedApiError ? e.message : t('common.saveError')),
                    },
                  )
                }
              >
                {t('branches.extras.restore')}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
