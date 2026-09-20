import type { ConversationListItem } from '@abcp/shared-types';
import {
  Building2,
  CalendarClock,
  Image as ImageIcon,
  Lock,
  Mail,
  MessageSquareText,
  Mic,
  Phone,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DateTimeText } from '@/components/shared/DateTimeText';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useStaffList } from '@/features/staff/staff.api';
import { cn } from '@/lib/utils';

import { ConversationAvatar } from './ConversationList';
import { useConversationMedia } from './messaging.api';
import type { ConversationRow, Participant } from './messagingModel';

const MEDIA_PREVIEW_LIMIT = 9;

/**
 * Right-hand context panel for the open thread: who's in it, what's been shared, and how active it
 * is. Staff details come from `GET /staff` matched by userId; admins with no StaffProfile just show
 * name + role. Media counts and photos come from `GET /conversations/:id/media`, so they cover the
 * whole thread, not just the loaded page of messages.
 */
export function ThreadDetailsPanel({
  row,
  onClose,
  onOpenMember,
}: {
  row: ConversationRow;
  onClose: () => void;
  onOpenMember: () => void;
}) {
  const { t, i18n } = useTranslation();
  const c: ConversationListItem = row.conversation;
  const mediaQuery = useConversationMedia(c.id);
  const staff = useStaffList({ page: 1, pageSize: 100 });
  const byUserId = useMemo(() => new Map(staff.data?.items.map((s) => [s.userId, s]) ?? []), [staff.data]);
  const [preview, setPreview] = useState<string | null>(null);
  const [showAllPhotos, setShowAllPhotos] = useState(false);

  const media = {
    photos: mediaQuery.data?.photos ?? [],
    photoCount: mediaQuery.data?.photoCount ?? 0,
    voiceCount: mediaQuery.data?.voiceCount ?? 0,
  };

  const single = !row.isGroup ? byUserId.get(row.others[0]?.id ?? '') : undefined;
  const branches = useMemo(
    () => Array.from(new Set(row.others.map((p) => byUserId.get(p.id)?.branchName).filter(Boolean))),
    [row.others, byUserId],
  );

  return (
    <aside className="flex h-full min-h-0 flex-col" aria-label={t('messaging.details')}>
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{t('messaging.details')}</h2>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 rounded-full text-muted-foreground"
          onClick={onClose}
          title={t('common.close')}
        >
          <X className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">{t('common.close')}</span>
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-6">
        {/* Identity */}
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-gradient-to-b from-primary/10 to-transparent px-3 pb-4 pt-5 text-center">
          <ConversationAvatar others={row.others} size={72} />
          <div className="min-w-0 space-y-0.5">
            <p className="line-clamp-2 text-base font-semibold leading-snug text-foreground">{row.fullNames}</p>
            <p className="text-xs text-muted-foreground">
              {row.isGroup
                ? t('messaging.memberCount', { count: row.others.length + 1 })
                : single
                  ? single.jobTitle
                  : t(`messaging.role.${row.others[0]?.role ?? 'STAFF'}`)}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {c.isLocked ? (
              <Chip className="bg-amber-500/15 text-amber-700 dark:text-amber-400">
                <Lock className="h-3 w-3" aria-hidden="true" />
                {t('messaging.locked')}
              </Chip>
            ) : (
              <Chip className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                {t('messaging.open')}
              </Chip>
            )}
            <Chip className="bg-muted text-muted-foreground">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              {t('messaging.internalOnly')}
            </Chip>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <Stat icon={MessageSquareText} value={c.messageCount} label={t('messaging.stat.messages')} />
          <Stat icon={ImageIcon} value={media.photoCount} label={t('messaging.stat.photos')} loading={mediaQuery.isLoading} />
          <Stat icon={Mic} value={media.voiceCount} label={t('messaging.stat.voice')} loading={mediaQuery.isLoading} />
        </div>

        {/* Contact (1:1 only) */}
        {!row.isGroup && single && (single.phone || single.email) ? (
          <Section title={t('messaging.contactSection')}>
            {single.phone ? (
              <InfoRow icon={Phone} label={single.phone} caption={t('messaging.phoneLabel')} href={`tel:${single.phone}`} />
            ) : null}
            {single.email ? (
              <InfoRow icon={Mail} label={single.email} caption={t('messaging.emailLabel')} href={`mailto:${single.email}`} />
            ) : null}
            <InfoRow icon={Building2} label={single.branchName} caption={t('messaging.branchLabel')} />
          </Section>
        ) : null}

        {/* Members */}
        <Section
          title={t('messaging.membersTitle', { count: row.others.length + 1 })}
          action={
            <button type="button" onClick={onOpenMember} className="text-xs font-medium text-primary hover:underline">
              {t('messaging.viewAll')}
            </button>
          }
        >
          {row.isGroup && branches.length > 0 ? (
            <p className="px-2 pb-1 text-[11px] text-muted-foreground">
              {t('messaging.acrossBranches', { count: branches.length })}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {row.others.map((p) => (
              <MemberRow key={p.id} participant={p} match={byUserId.get(p.id)} loading={staff.isLoading} onClick={onOpenMember} />
            ))}
          </ul>
        </Section>

        {/* Shared photos */}
        <Section title={media.photoCount > 0 ? `${t('messaging.sharedPhotos')} · ${media.photoCount}` : t('messaging.sharedPhotos')}>
          {mediaQuery.isLoading ? (
            <div className="grid grid-cols-3 gap-1.5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="aspect-square rounded-lg" />
              ))}
            </div>
          ) : media.photos.length === 0 ? (
            <p className="rounded-xl border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              {t('messaging.noSharedPhotos')}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {media.photos.slice(0, showAllPhotos ? undefined : MEDIA_PREVIEW_LIMIT).map((m, i) => {
                const overflow =
                  !showAllPhotos && i === MEDIA_PREVIEW_LIMIT - 1 && media.photos.length > MEDIA_PREVIEW_LIMIT;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => (overflow ? setShowAllPhotos(true) : setPreview(m.mediaUrl))}
                    className="group relative aspect-square overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={t('messaging.openPhoto')}
                  >
                    <img
                      src={m.mediaUrl!}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    {overflow ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-semibold text-white">
                        +{media.photos.length - MEDIA_PREVIEW_LIMIT + 1}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </Section>

        {/* Activity */}
        <Section title={t('messaging.activity')}>
          <InfoRow
            icon={CalendarClock}
            caption={t('messaging.startedOn')}
            label={<DateTimeText value={c.createdAt} mode="datetime" />}
          />
          {c.lastMessageAt ? (
            <InfoRow
              icon={MessageSquareText}
              caption={t('messaging.lastActivity')}
              label={<DateTimeText value={c.lastMessageAt} mode="relative" locale={i18n.language === 'en' ? 'en' : 'lo'} />}
            />
          ) : null}
        </Section>
      </div>

      <Dialog open={preview !== null} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-4xl border-none bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">{t('messaging.sharedPhotos')}</DialogTitle>
          {preview ? <img src={preview} alt="" className="max-h-[85vh] w-full rounded-xl object-contain" /> : null}
        </DialogContent>
      </Dialog>
    </aside>
  );
}

function MemberRow({
  participant,
  match,
  loading,
  onClick,
}: {
  participant: Participant;
  match: { jobTitle: string; branchName: string; isActive: boolean } | undefined;
  loading: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted/70"
      >
        <span className="relative shrink-0">
          <PersonAvatar name={participant.name} size={36} />
          {match ? (
            <span
              className={cn(
                'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-card',
                match.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/50',
              )}
              aria-hidden="true"
            />
          ) : null}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{participant.name}</p>
          {loading ? (
            <Skeleton className="mt-1 h-2.5 w-2/3" />
          ) : (
            <p className="truncate text-xs text-muted-foreground">
              {match
                ? `${match.jobTitle} · ${match.branchName}`
                : t(`messaging.role.${participant.role}`, { defaultValue: participant.role })}
            </p>
          )}
        </div>
      </button>
    </li>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Chip({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium', className)}>
      {children}
    </span>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
  loading = false,
}: {
  icon: LucideIcon;
  value: number;
  label: string;
  loading?: boolean;
}) {
  return (
    <div className="group flex flex-col items-center gap-1 rounded-xl border bg-card px-2 py-3 text-center transition-all duration-200 animate-in fade-in zoom-in-95 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm motion-reduce:animate-none motion-reduce:hover:translate-y-0">
      <Icon className="h-4 w-4 text-primary transition-transform duration-200 group-hover:scale-110" aria-hidden="true" />
      {loading ? (
        <Skeleton className="h-5 w-6" />
      ) : (
        <span className="text-lg font-semibold tabular-nums leading-none text-foreground">{value}</span>
      )}
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  caption,
  label,
  href,
}: {
  icon: LucideIcon;
  caption: string;
  label: React.ReactNode;
  href?: string;
}) {
  const inner = (
    <div className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">{caption}</p>
        <p className="truncate font-medium text-foreground">{label}</p>
      </div>
    </div>
  );
  return href ? (
    <a href={href} className="block rounded-xl transition-colors hover:bg-muted/70">
      {inner}
    </a>
  ) : (
    inner
  );
}
