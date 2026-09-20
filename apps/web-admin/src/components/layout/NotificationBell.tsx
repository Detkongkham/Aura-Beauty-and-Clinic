import { Bell, CheckCheck, Inbox, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useMarkAllNotificationsRead,
  useNotificationAction,
  useNotificationList,
  useUnreadNotificationCount,
  type AppNotification,
} from '@/features/notifications/notifications.api';
import { relatedLink, SEVERITY_META, SEVERITY_RANK } from '@/features/notifications/notificationModel';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';

const PREVIEW_COUNT = 5;

/** Unread first, then critical-before-info, then newest — the triage order of the full inbox. */
function previewOrder(items: AppNotification[]): AppNotification[] {
  return [...items]
    .sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1;
      const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (rank !== 0) return rank;
      return b.createdAt.localeCompare(a.createdAt);
    })
    .slice(0, PREVIEW_COUNT);
}

function PreviewRow({ n, onGo }: { n: AppNotification; onGo: (n: AppNotification) => void }) {
  const { i18n } = useTranslation();
  const locale = i18n.language.startsWith('en') ? 'en' : 'lo';
  const meta = SEVERITY_META[n.severity];
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={() => onGo(n)}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-sm px-2 py-2 text-left transition-colors duration-150',
        'hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
        !n.read && 'bg-primary-subtle/40',
      )}
    >
      <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', meta.tile)}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className={cn('min-w-0 flex-1 truncate text-sm', n.read ? 'font-medium' : 'font-semibold')}>
            {n.title}
          </span>
          <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
            {formatRelative(n.createdAt, locale)}
          </span>
        </span>
        <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted-foreground">{n.body}</span>
      </span>
      {!n.read && (
        <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      )}
    </button>
  );
}

/** Panel body — its own component so the list query only runs while the popover is open. */
function BellPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading } = useNotificationList();
  const markRead = useNotificationAction();
  const markAll = useMarkAllNotificationsRead();

  const items = data?.items ?? [];
  const preview = previewOrder(items);
  const unread = data?.summary.unread ?? 0;

  const go = (n: AppNotification) => {
    if (!n.read) markRead.mutate({ id: n.id, action: 'read' });
    const link = relatedLink(n);
    navigate(link ? link.to : ROUTES.notifications);
    onClose();
  };

  return (
    <>
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <h2 className="flex-1 text-sm font-semibold text-foreground">{t('nav.notifications')}</h2>
        {unread > 0 && (
          <span className="rounded-full bg-primary-subtle px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-primary">
            {t('notifications.unreadAria', { count: unread })}
          </span>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={unread === 0 || markAll.isPending}
              onClick={() => markAll.mutate()}
              aria-label={t('notifications.markAllRead')}
            >
              <CheckCheck className="h-4 w-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('notifications.markAllRead')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                navigate(ROUTES.settingsNotifications);
                onClose();
              }}
              aria-label={t('notifications.settings')}
            >
              <Settings2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('notifications.settings')}</TooltipContent>
        </Tooltip>
      </header>

      <div className="max-h-[22rem] overflow-y-auto p-1">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-2.5">
                <Skeleton className="h-7 w-7 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : preview.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
            <Inbox className="h-7 w-7 text-muted-foreground/60" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">{t('notifications.empty')}</p>
            <p className="text-xs text-muted-foreground">{t('notifications.emptyHint')}</p>
          </div>
        ) : (
          preview.map((n) => <PreviewRow key={n.id} n={n} onGo={go} />)
        )}
      </div>

      <footer className="border-t border-border p-1">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center text-primary"
          onClick={() => {
            navigate(ROUTES.notifications);
            onClose();
          }}
        >
          {t('notifications.viewAll')}
        </Button>
      </footer>
    </>
  );
}

/**
 * Bell + live unread badge. Clicking now opens a triage preview instead of
 * jumping straight to /notifications: most alerts only need a glance, and the
 * round-trip through a full page (losing whatever the operator was doing) was
 * the reason the badge got ignored. The full inbox is one click further.
 */
export function NotificationBell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data } = useUnreadNotificationCount();
  const unread = data?.unread ?? 0;
  const critical = (data?.critical ?? 0) > 0;
  const label =
    unread > 0 ? t('notifications.bellAriaUnread', { count: unread }) : t('notifications.bellAria');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={label}
              data-testid="topbar-bell"
              className="relative h-9 w-9 data-[state=open]:bg-muted"
            >
              <Bell
                className={cn('h-4 w-4', critical && unread > 0 && 'motion-safe:animate-[swing_1.2s_ease-in-out_2]')}
                aria-hidden="true"
              />
              {unread > 0 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1',
                    'text-[10px] font-semibold leading-none tabular-nums ring-2 ring-card',
                    critical
                      ? 'bg-destructive text-destructive-foreground motion-safe:animate-pulse'
                      : 'bg-primary text-primary-foreground',
                  )}
                >
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <BellPanel onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
