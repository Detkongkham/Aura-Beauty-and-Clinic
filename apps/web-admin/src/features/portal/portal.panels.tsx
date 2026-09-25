import type {
  AnnouncementSeverity,
  AnnouncementView,
  ChecklistSlot,
  ChecklistTask,
  ProbeState,
} from '@abcp/shared-types';
import {
  Activity,
  AlertTriangle,
  ArchiveRestore,
  CheckCircle2,
  ChevronDown,
  Circle,
  Cpu,
  Database,
  HardDrive,
  Info,
  ListChecks,
  Megaphone,
  Moon,
  Pencil,
  Pin,
  Plus,
  Radio,
  RefreshCw,
  Server,
  Sparkles,
  Sun,
  Sunrise,
  Trash2,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { DateField } from '@/components/shared/DateField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

import {
  useAnnouncements,
  useChecklist,
  useDeleteAnnouncement,
  useManageAnnouncements,
  useMarkAllAnnouncementsRead,
  useMarkAnnouncementRead,
  useSaveAnnouncement,
  useSystemStatus,
  useToggleChecklist,
} from './portal.api';

const ENTER =
  'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none';
const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function useLang(): 'lo' | 'en' {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage === 'en' ? 'en' : 'lo';
}

function PanelHeader({
  id,
  icon: Icon,
  title,
  subtitle,
  aside,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  aside?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id={id} className="text-base font-semibold">
            {title}
          </h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {aside}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Announcements                                                        */
/* ------------------------------------------------------------------ */

const SEVERITY_STYLE: Record<AnnouncementSeverity, { chip: string; icon: LucideIcon; bar: string }> = {
  INFO: { chip: 'bg-info-soft text-info', icon: Info, bar: 'bg-info' },
  SUCCESS: { chip: 'bg-success-soft text-success', icon: Sparkles, bar: 'bg-success' },
  WARNING: { chip: 'bg-warning-soft text-warning', icon: AlertTriangle, bar: 'bg-warning' },
  CRITICAL: { chip: 'bg-destructive-soft text-destructive', icon: XCircle, bar: 'bg-destructive' },
};

export function AnnouncementsPanel({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const { data = [], isLoading } = useAnnouncements();
  const markRead = useMarkAnnouncementRead();
  const markAll = useMarkAllAnnouncementsRead();
  const [open, setOpen] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const unread = data.filter((a) => !a.read).length;
  const rows = showAll ? data : data.slice(0, 4);

  const toggle = (a: AnnouncementView) => {
    setOpen((cur) => (cur === a.id ? null : a.id));
    if (!a.read) markRead.mutate(a.id);
  };

  return (
    <section
      id="announcements"
      aria-labelledby="portal-announcements"
      className={cn('flex scroll-mt-24 flex-col rounded-2xl border border-border bg-card shadow-sm', ENTER)}
    >
      <PanelHeader
        id="portal-announcements"
        icon={Megaphone}
        title={t('portal.news.title')}
        subtitle={t('portal.news.subtitle')}
        aside={
          <div className="flex items-center gap-1">
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                className={cn(
                  'h-8 cursor-pointer rounded-full px-3 text-xs font-medium text-primary transition-colors hover:bg-primary-subtle',
                  FOCUS,
                )}
              >
                {t('portal.news.markAll', { count: unread })}
              </button>
            ) : null}
            {canManage ? (
              <Button size="sm" variant="secondary" onClick={() => setManagerOpen(true)}>
                <Pencil aria-hidden="true" />
                {t('portal.news.manage')}
              </Button>
            ) : null}
          </div>
        }
      />
      {isLoading ? (
        <ul className="space-y-2 p-3" aria-hidden="true">
          {[0, 1].map((i) => (
            <li key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </ul>
      ) : data.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <Megaphone className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">{t('portal.news.empty')}</p>
          {canManage ? (
            <Button size="sm" onClick={() => setManagerOpen(true)}>
              <Plus aria-hidden="true" />
              {t('portal.news.new')}
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((a) => {
            const sev = SEVERITY_STYLE[a.severity];
            const Icon = a.kind === 'CHANGELOG' ? Zap : sev.icon;
            const expanded = open === a.id;
            return (
              <li key={a.id} className="relative">
                <span
                  aria-hidden="true"
                  className={cn('absolute inset-y-2 left-0 w-0.5 rounded-full', sev.bar, a.read && 'opacity-30')}
                />
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`ann-${a.id}`}
                  onClick={() => toggle(a)}
                  className={cn(
                    'flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50',
                    FOCUS,
                    'focus-visible:ring-inset focus-visible:ring-offset-0',
                  )}
                >
                  <span className={cn('mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', sev.chip)}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {!a.read ? (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label={t('portal.news.unread')} />
                      ) : null}
                      {a.pinned ? <Pin className="h-3.5 w-3.5 shrink-0 text-accent" aria-label={t('portal.news.pinned')} /> : null}
                      <span className={cn('truncate text-sm', a.read ? 'font-medium' : 'font-semibold')}>{a.title}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
                      {t(`portal.news.kind.${a.kind}`)} · {a.author?.name ?? '—'} · {formatRelative(a.publishedAt, lang)}
                      {a.branchName ? ` · ${a.branchName}` : ''}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn('mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', expanded && 'rotate-180')}
                    aria-hidden="true"
                  />
                </button>
                {expanded ? (
                  <div id={`ann-${a.id}`} className="px-4 pb-4 pl-[3.75rem] animate-in fade-in slide-in-from-top-1 duration-200">
                    <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                      {a.body || t('portal.news.noBody')}
                    </p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {data.length > 4 ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className={cn('border-t border-border py-2.5 text-xs font-medium text-primary hover:bg-muted/50', FOCUS)}
        >
          {showAll ? t('portal.news.showLess') : t('portal.news.showAll', { count: data.length })}
        </button>
      ) : null}
      {canManage ? <AnnouncementManager open={managerOpen} onOpenChange={setManagerOpen} /> : null}
    </section>
  );
}

interface Draft {
  id?: string;
  title: string;
  body: string;
  kind: 'ANNOUNCEMENT' | 'CHANGELOG';
  severity: AnnouncementSeverity;
  audience: 'all' | 'BRANCH_ADMIN' | 'STAFF';
  branchId: string;
  pinned: boolean;
  expires: string;
}

const EMPTY: Draft = {
  title: '',
  body: '',
  kind: 'ANNOUNCEMENT',
  severity: 'INFO',
  audience: 'all',
  branchId: '',
  pinned: false,
  expires: '',
};

function toDraft(a: AnnouncementView): Draft {
  const role = a.audienceRoles.length === 1 ? a.audienceRoles[0] : undefined;
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    kind: a.kind,
    severity: a.severity,
    audience: role === 'BRANCH_ADMIN' || role === 'STAFF' ? role : 'all',
    branchId: a.branchId ?? '',
    pinned: a.pinned,
    expires: a.expiresAt ? a.expiresAt.slice(0, 10) : '',
  };
}

function AnnouncementManager({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const { data = [], isLoading } = useManageAnnouncements(open);
  const { data: branches = [] } = useBranches();
  const isSuper = useAuth().role === 'SUPER_ADMIN';
  const save = useSaveAnnouncement();
  const del = useDeleteAnnouncement();
  const [draft, setDraft] = useState<Draft | null>(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const submit = () => {
    if (!draft || !draft.title.trim()) return;
    save.mutate(
      {
        id: draft.id,
        input: {
          title: draft.title.trim(),
          body: draft.body.trim(),
          kind: draft.kind,
          severity: draft.severity,
          audienceRoles: draft.audience === 'all' ? [] : [draft.audience],
          branchId: draft.branchId || null,
          pinned: draft.pinned,
          // End of the chosen Vientiane day.
          expiresAt: draft.expires ? new Date(`${draft.expires}T23:59:59+07:00`) : null,
        },
      },
      {
        onSuccess: () => {
          toast.success(draft.id ? t('portal.news.saved') : t('portal.news.published'));
          setDraft(null);
        },
        onError: () => toast.error(t('portal.news.saveFailed')),
      },
    );
  };

  const now = Date.now();
  const status = (a: AnnouncementView) =>
    a.expiresAt && Date.parse(a.expiresAt) < now
      ? 'expired'
      : Date.parse(a.publishedAt) > now
        ? 'scheduled'
        : 'live';

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : (setDraft(null), onOpenChange(false)))}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft ? (draft.id ? t('portal.news.edit') : t('portal.news.new')) : t('portal.news.manage')}</DialogTitle>
          <DialogDescription>{t('portal.news.manageHint')}</DialogDescription>
        </DialogHeader>

        {draft ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="space-y-1.5">
              <label htmlFor="ann-title" className="text-sm font-medium">
                {t('portal.news.fieldTitle')}
              </label>
              <input
                id="ann-title"
                required
                maxLength={140}
                value={draft.title}
                onChange={(e) => set('title', e.target.value)}
                className="h-10 w-full rounded-sm border border-input bg-card px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ann-body" className="text-sm font-medium">
                {t('portal.news.fieldBody')}
              </label>
              <textarea
                id="ann-body"
                rows={5}
                maxLength={4000}
                value={draft.body}
                onChange={(e) => set('body', e.target.value)}
                className="w-full rounded-sm border border-input bg-card px-3 py-2 text-sm leading-relaxed focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
              <p className="text-right text-2xs text-muted-foreground">{draft.body.length}/4000</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('portal.news.fieldKind')} htmlFor="ann-kind">
                <Select
                  id="ann-kind"
                  value={draft.kind}
                  onChange={(e) => set('kind', e.target.value as Draft['kind'])}
                  options={[
                    { value: 'ANNOUNCEMENT', label: t('portal.news.kind.ANNOUNCEMENT') },
                    { value: 'CHANGELOG', label: t('portal.news.kind.CHANGELOG') },
                  ]}
                />
              </Field>
              <Field label={t('portal.news.fieldSeverity')} htmlFor="ann-sev">
                <Select
                  id="ann-sev"
                  value={draft.severity}
                  onChange={(e) => set('severity', e.target.value as AnnouncementSeverity)}
                  options={(['INFO', 'SUCCESS', 'WARNING', 'CRITICAL'] as const).map((s) => ({
                    value: s,
                    label: t(`portal.news.severity.${s}`),
                  }))}
                />
              </Field>
              <Field label={t('portal.news.fieldAudience')} htmlFor="ann-aud">
                <Select
                  id="ann-aud"
                  value={draft.audience}
                  onChange={(e) => set('audience', e.target.value as Draft['audience'])}
                  options={[
                    { value: 'all', label: t('portal.news.audience.all') },
                    { value: 'BRANCH_ADMIN', label: t('messaging.role.BRANCH_ADMIN', { defaultValue: 'Branch admin' }) },
                    { value: 'STAFF', label: t('messaging.role.STAFF', { defaultValue: 'Staff' }) },
                  ]}
                />
              </Field>
{isSuper ? (
              <Field label={t('portal.news.fieldBranch')} htmlFor="ann-branch">
                <Select
                  id="ann-branch"
                  value={draft.branchId}
                  onChange={(e) => set('branchId', e.target.value)}
                  options={[
                    { value: '', label: t('branch.all') },
                    ...branches.map((b) => ({ value: b.id, label: b.name })),
                  ]}
                />
              </Field>
) : null}
              <Field label={t('portal.news.fieldExpires')}>
                <DateField
                  aria-label={t('portal.news.fieldExpires')}
                  value={draft.expires}
                  onChange={(v) => set('expires', v)}
                  onClear={() => set('expires', '')}
                  clearLabel={t('common.clear', { defaultValue: 'Clear' })}
                  className="w-full"
                />
              </Field>
              <div className="flex items-center justify-between gap-3 rounded-sm border border-border px-3 py-2">
                <span className="text-sm">
                  <span className="block font-medium">{t('portal.news.fieldPinned')}</span>
                  <span className="block text-2xs text-muted-foreground">{t('portal.news.fieldPinnedHint')}</span>
                </span>
                <Switch
                  checked={draft.pinned}
                  onCheckedChange={(v) => set('pinned', v)}
                  aria-label={t('portal.news.fieldPinned')}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </Button>
              <Button type="submit" disabled={save.isPending || !draft.title.trim()}>
                {draft.id ? t('portal.news.save') : t('portal.news.publish')}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-3">
            <Button size="sm" onClick={() => setDraft({ ...EMPTY })}>
              <Plus aria-hidden="true" />
              {t('portal.news.new')}
            </Button>
            {isLoading ? (
              <div className="h-24 animate-pulse rounded-lg bg-muted" />
            ) : data.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                {t('portal.news.empty')}
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {data.map((a) => {
                  const st = status(a);
                  return (
                    <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className={cn('h-2 w-2 shrink-0 rounded-full', SEVERITY_STYLE[a.severity].bar)} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{a.title}</span>
                        <span className="block truncate text-2xs text-muted-foreground">
                          {t(`portal.news.status.${st}`)} · {formatRelative(a.publishedAt, lang)} ·{' '}
                          {t('portal.news.readBy', { count: a.readCount ?? 0 })}
                        </span>
                      </span>
                      <Button size="icon" variant="ghost" aria-label={t('portal.news.edit')} onClick={() => setDraft(toDraft(a))}>
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t('portal.news.delete')}
                        onClick={() => {
                          if (window.confirm(t('portal.news.deleteConfirm', { title: a.title }))) {
                            del.mutate(a.id, { onSuccess: () => toast.success(t('portal.news.deleted')) });
                          }
                        }}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Daily checklist                                                      */
/* ------------------------------------------------------------------ */

const SLOTS: Array<{ id: ChecklistSlot; icon: LucideIcon }> = [
  { id: 'open', icon: Sunrise },
  { id: 'during', icon: Sun },
  { id: 'close', icon: Moon },
];

export function ChecklistPanel({ branchId }: { branchId: string }) {
  const { t } = useTranslation();
  const { data, isLoading } = useChecklist(branchId);
  const toggle = useToggleChecklist(branchId);
  const tasks = data?.tasks ?? [];
  const done = tasks.filter((x) => x.done).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <section
      aria-labelledby="portal-checklist"
      className={cn('flex flex-col rounded-2xl border border-border bg-card shadow-sm', ENTER)}
    >
      <PanelHeader
        id="portal-checklist"
        icon={ListChecks}
        title={t('portal.checklist.title')}
        subtitle={t('portal.checklist.subtitle')}
        aside={
          tasks.length ? (
            <span className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
              <span
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t('portal.checklist.progress', { done, total: tasks.length })}
                className="block h-1.5 w-20 overflow-hidden rounded-full bg-muted"
              >
                <span
                  className={cn('block h-full rounded-full transition-[width] duration-500', pct === 100 ? 'bg-success' : 'bg-primary')}
                  style={{ width: `${pct}%` }}
                />
              </span>
              {done}/{tasks.length}
            </span>
          ) : null
        }
      />
      {isLoading ? (
        <div className="space-y-2 p-3" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t('portal.checklist.empty')}</p>
      ) : (
        <div className="space-y-3 p-3">
          {SLOTS.map((slot) => {
            const list = tasks.filter((x) => x.slot === slot.id);
            if (!list.length) return null;
            const SlotIcon = slot.icon;
            return (
              <div key={slot.id}>
                <p className="mb-1 flex items-center gap-1.5 px-1 text-2xs font-medium text-muted-foreground">
                  <SlotIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  {t(`portal.checklist.slot.${slot.id}`)}
                </p>
                <ul className="space-y-1">
                  {list.map((task) => (
                    <ChecklistRow
                      key={task.key}
                      task={task}
                      onToggle={(v) => toggle.mutate({ key: task.key, done: v })}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ChecklistRow({ task, onToggle }: { task: ChecklistTask; onToggle: (done: boolean) => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const label = t(`portal.checklist.task.${task.key}`);
  const meta = task.autoDone
    ? t('portal.checklist.auto')
    : task.ticked && task.doneBy
      ? t('portal.checklist.tickedBy', { name: task.doneBy, time: task.doneAt ? formatRelative(task.doneAt, lang) : '' })
      : task.count != null && task.count > 0
        ? t('portal.checklist.pending', { count: task.count })
        : t(`portal.checklist.hint.${task.key}`);
  return (
    <li className="group flex items-center gap-2 rounded-xl px-1 py-1 transition-colors hover:bg-muted/50">
      <button
        type="button"
        role="checkbox"
        aria-checked={task.done}
        aria-label={label}
        disabled={task.autoDone}
        onClick={() => onToggle(!task.ticked)}
        className={cn(
          'inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors disabled:cursor-default',
          FOCUS,
          task.done ? 'text-success' : 'text-muted-foreground hover:text-primary',
        )}
      >
        {task.done ? (
          <CheckCircle2 className="h-5 w-5 animate-in zoom-in-50 duration-200 motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <Circle className="h-5 w-5" aria-hidden="true" />
        )}
      </button>
      <Link to={task.to} className={cn('min-w-0 flex-1 rounded-md py-1', FOCUS)}>
        <span className={cn('block truncate text-sm', task.done ? 'text-muted-foreground line-through decoration-muted-foreground/50' : 'font-medium')}>
          {label}
        </span>
        <span className="block truncate text-2xs text-muted-foreground">{meta}</span>
      </Link>
      {task.count != null && task.count > 0 && !task.done ? (
        <span className="rounded-full bg-warning-soft px-2 py-0.5 text-2xs font-semibold tabular-nums text-warning">{task.count}</span>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* System status (SUPER_ADMIN)                                          */
/* ------------------------------------------------------------------ */

const STATE_STYLE: Record<ProbeState, { dot: string; text: string }> = {
  ok: { dot: 'bg-success', text: 'text-success' },
  degraded: { dot: 'bg-warning', text: 'text-warning' },
  down: { dot: 'bg-destructive', text: 'text-destructive' },
  unknown: { dot: 'bg-muted-foreground/50', text: 'text-muted-foreground' },
};

function formatBytes(n: number | null) {
  if (n == null) return '–';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatUptime(sec: number) {
  const d = Math.floor(sec / 86_400);
  const h = Math.floor((sec % 86_400) / 3_600);
  const m = Math.floor((sec % 3_600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

export function SystemStatusCard() {
  const { t } = useTranslation();
  const lang = useLang();
  const { data, isLoading, isFetching, refetch, isError } = useSystemStatus(true);
  const [showQueues, setShowQueues] = useState(false);

  const probes: Array<{ icon: LucideIcon; label: string; state: ProbeState; value: string }> = data
    ? [
        { icon: Server, label: t('portal.status.api'), state: data.api.state, value: t('portal.status.uptime', { time: formatUptime(data.api.uptimeSec) }) },
        { icon: Database, label: t('portal.status.database'), state: data.database.state, value: data.database.latencyMs != null ? `${data.database.latencyMs} ms` : '–' },
        { icon: Zap, label: t('portal.status.redis'), state: data.redis.state, value: data.redis.latencyMs != null ? `${data.redis.latencyMs} ms` : '–' },
        { icon: Radio, label: t('portal.status.socket'), state: data.socket.state, value: t('portal.status.clients', { count: data.socket.clients }) },
        { icon: Cpu, label: t('portal.status.worker'), state: data.worker.state, value: t('portal.status.workers', { count: data.worker.workers }) },
        {
          icon: HardDrive,
          label: t('portal.status.backup'),
          state: data.backup.state,
          value: !data.backup.configured
            ? t('portal.status.backupNone')
            : data.backup.lastAt
              ? formatRelative(data.backup.lastAt, lang)
              : t('portal.status.backupMissing'),
        },
      ]
    : [];
  const overall: ProbeState = isError
    ? 'down'
    : !data
      ? 'unknown'
      : probes.some((p) => p.state === 'down')
        ? 'down'
        : probes.some((p) => p.state === 'degraded' || p.state === 'unknown')
          ? 'degraded'
          : 'ok';
  const failedJobs = data?.queues.reduce((n, q) => n + q.failed, 0) ?? 0;

  return (
    <section
      id="system-status"
      aria-labelledby="portal-status"
      className={cn('scroll-mt-24 rounded-2xl border border-border bg-card shadow-sm', ENTER)}
    >
      <PanelHeader
        id="portal-status"
        icon={Activity}
        title={t('portal.status.title')}
        subtitle={t('portal.status.subtitle')}
        aside={
          <div className="flex items-center gap-2">
            <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', STATE_STYLE[overall].text)}>
              <span className="relative flex h-2 w-2">
                {overall === 'ok' ? (
                  <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:animate-none', STATE_STYLE.ok.dot)} />
                ) : null}
                <span className={cn('relative inline-flex h-2 w-2 rounded-full', STATE_STYLE[overall].dot)} />
              </span>
              {t(`portal.status.overall.${overall}`)}
            </span>
            <Button size="icon" variant="ghost" aria-label={t('portal.refresh')} onClick={() => void refetch()}>
              <RefreshCw className={cn(isFetching && 'animate-spin motion-reduce:animate-none')} aria-hidden="true" />
            </Button>
          </div>
        }
      />
      {isLoading ? (
        <div className="grid gap-2 p-3 sm:grid-cols-3" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : isError ? (
        <p className="px-4 py-6 text-sm text-destructive">{t('portal.status.error')}</p>
      ) : (
        <div className="space-y-3 p-3">
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {probes.map((p) => {
              const Icon = p.icon;
              return (
                <li key={p.label} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{p.label}</span>
                    <span className="block truncate text-2xs tabular-nums text-muted-foreground">{p.value}</span>
                  </span>
                  <span className={cn('inline-flex items-center gap-1 text-2xs font-medium', STATE_STYLE[p.state].text)}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', STATE_STYLE[p.state].dot)} aria-hidden="true" />
                    {t(`portal.status.state.${p.state}`)}
                  </span>
                </li>
              );
            })}
          </ul>
          {data && !data.backup.configured ? (
            <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-2xs text-muted-foreground">
              <ArchiveRestore className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t('portal.status.backupHelp')}
            </p>
          ) : data?.backup.file ? (
            <p className="px-1 text-2xs text-muted-foreground">
              {t('portal.status.backupFile', { file: data.backup.file, size: formatBytes(data.backup.sizeBytes) })}
            </p>
          ) : null}
          {data ? (
            <div className="rounded-xl border border-border">
              <button
                type="button"
                aria-expanded={showQueues}
                onClick={() => setShowQueues((v) => !v)}
                className={cn('flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-medium', FOCUS)}
              >
                <span>
                  {t('portal.status.jobs', { count: data.queues.length })}
                  {failedJobs > 0 ? (
                    <span className="ml-2 rounded-full bg-destructive-soft px-1.5 py-0.5 text-2xs text-destructive">
                      {t('portal.status.failed', { count: failedJobs })}
                    </span>
                  ) : null}
                </span>
                <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', showQueues && 'rotate-180')} aria-hidden="true" />
              </button>
              {showQueues ? (
                <div className="overflow-x-auto border-t border-border">
                  <table className="w-full text-2xs">
                    <thead className="text-muted-foreground">
                      <tr className="text-left">
                        <th className="px-3 py-2 font-medium">{t('portal.status.col.queue')}</th>
                        <th className="px-2 py-2 text-right font-medium">{t('portal.status.col.waiting')}</th>
                        <th className="px-2 py-2 text-right font-medium">{t('portal.status.col.failed')}</th>
                        <th className="px-3 py-2 font-medium">{t('portal.status.col.lastRun')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.queues.map((q) => (
                        <tr key={q.name}>
                          <td className="px-3 py-1.5 font-mono">{q.name}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{q.waiting + q.delayed}</td>
                          <td className={cn('px-2 py-1.5 text-right tabular-nums', q.failed > 0 && 'font-semibold text-destructive')} title={q.lastFailedReason ?? undefined}>
                            {q.failed}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {q.lastCompletedAt ? formatRelative(q.lastCompletedAt, lang) : '–'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
          {data ? (
            <p className="px-1 text-2xs text-muted-foreground">
              {t('portal.status.meta', { node: data.api.node, mem: data.api.memoryMb, version: data.api.version })}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
