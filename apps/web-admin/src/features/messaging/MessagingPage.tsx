import { ArrowLeft, Keyboard, Lock, MessageSquareText, PanelRight, Plus, Search, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/useAuth';
import { useStaffList } from '@/features/staff/staff.api';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';

import { ConversationAvatar, ConversationList } from './ConversationList';
import { useConversations } from './messaging.api';
import {
  matchesFilter,
  matchesQuery,
  toConversationRow,
  type InboxFilter,
} from './messagingModel';
import { NewConversationDialog } from './NewConversationDialog';
import { ThreadDetailsPanel } from './ThreadDetailsPanel';
import { ThreadInfoDialog } from './ThreadInfoDialog';
import { ThreadView } from './ThreadView';

const DETAILS_PREF_KEY = 'abcp.messaging.detailsOpen';

function readDetailsPref(): boolean {
  try {
    return window.localStorage.getItem(DETAILS_PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/**
 * /messaging — Module 38 STAFF_INTERNAL inbox. Three panes: conversation list (search, unread/direct/
 * group filters, recency sections), the open thread, and a details panel (xl+) with members, shared
 * photos and activity. The open thread lives in `?c=` so it survives reloads and can be linked.
 * Below md only one pane shows at a time, with a back button.
 */
export function MessagingPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const conversations = useConversations('STAFF_INTERNAL');
  const [params, setParams] = useSearchParams();
  const activeId = params.get('c') ?? undefined;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [threadSearchOpen, setThreadSearchOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(readDetailsPref);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [rawQuery, setRawQuery] = useState('');
  const [filter, setFilter] = useState<InboxFilter>('all');
  const query = useDebounce(rawQuery, 150).trim().toLowerCase();
  const listSearchRef = useRef<HTMLInputElement | null>(null);

  // Warm the staff directory once so the header subtitle and details panel don't each flash a skeleton.
  const staff = useStaffList({ page: 1, pageSize: 100 });

  const selectConversation = (id: string | undefined) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('c', id);
        else next.delete('c');
        return next;
      },
      { replace: true },
    );
    setInfoOpen(false);
    setThreadSearchOpen(false);
  };

  const toggleDetails = () => {
    setDetailsOpen((open) => {
      try {
        window.localStorage.setItem(DETAILS_PREF_KEY, open ? '0' : '1');
      } catch {
        /* per-viewer convenience only */
      }
      return !open;
    });
  };

  const rows = useMemo(
    () => (conversations.data ?? []).map((c) => toConversationRow(c, user?.id, t('messaging.untitled'))),
    [conversations.data, user?.id, t],
  );
  const visibleRows = useMemo(
    () => rows.filter((r) => matchesFilter(r, filter) && matchesQuery(r, query)),
    [rows, filter, query],
  );
  const active = rows.find((r) => r.conversation.id === activeId);
  const totalUnread = rows.reduce((sum, r) => sum + r.conversation.unreadCount, 0);
  const groupCount = rows.filter((r) => r.isGroup).length;

  // Keyboard: "/" focuses search, Alt+↑/↓ switches conversation, Esc closes the thread search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !isTypingTarget(e.target) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        listSearchRef.current?.focus();
        return;
      }
      if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && visibleRows.length > 0) {
        e.preventDefault();
        const idx = visibleRows.findIndex((r) => r.conversation.id === activeId);
        const nextIdx =
          e.key === 'ArrowDown' ? Math.min(idx + 1, visibleRows.length - 1) : Math.max(idx - 1, 0);
        selectConversation(visibleRows[nextIdx]?.conversation.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectConversation only touches setters
  }, [visibleRows, activeId]);

  const activeSubtitle = (() => {
    if (!active) return '';
    if (active.isGroup) return t('messaging.memberCount', { count: active.others.length + 1 });
    const match = staff.data?.items.find((s) => s.userId === active.others[0]?.id);
    return match
      ? `${match.jobTitle} · ${match.branchName}`
      : t(`messaging.role.${active.others[0]?.role ?? 'STAFF'}`, { defaultValue: t('messaging.staffChat') });
  })();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <StickyPageHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm">
              <MessageSquareText className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold">{t('nav.messaging')}</h1>
              <p className="truncate text-sm text-muted-foreground">{t('messaging.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 lg:flex">
              <HeaderStat label={t('messaging.stat.conversations')} value={rows.length} />
              <HeaderStat label={t('messaging.stat.groups')} value={groupCount} />
              <HeaderStat label={t('messaging.stat.unread')} value={totalUnread} highlight={totalUnread > 0} />
            </div>
            <div className="relative hidden md:block">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground"
                onClick={() => setShortcutsOpen((o) => !o)}
                aria-expanded={shortcutsOpen}
                title={t('messaging.shortcuts.title')}
              >
                <Keyboard className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{t('messaging.shortcuts.title')}</span>
              </Button>
              {shortcutsOpen ? (
                <div
                  className="absolute right-0 top-11 z-30 w-64 rounded-xl border bg-popover p-3 text-sm shadow-lg animate-in fade-in zoom-in-95 duration-150"
                  onMouseLeave={() => setShortcutsOpen(false)}
                >
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">{t('messaging.shortcuts.title')}</p>
                  <Shortcut keys={['/']} label={t('messaging.shortcuts.search')} />
                  <Shortcut keys={['Alt', '↑ ↓']} label={t('messaging.shortcuts.switch')} />
                  <Shortcut keys={['Enter']} label={t('messaging.shortcuts.send')} />
                  <Shortcut keys={['Shift', 'Enter']} label={t('messaging.shortcuts.newline')} />
                  <Shortcut keys={['Esc']} label={t('messaging.shortcuts.close')} />
                </div>
              ) : null}
            </div>
            <Button onClick={() => setPickerOpen(true)} className="shadow-sm">
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('messaging.newConversation')}
            </Button>
          </div>
        </div>
      </StickyPageHeader>

      <div className="flex min-h-[520px] flex-1 overflow-hidden rounded-2xl border bg-card shadow-sm">
        {/* Inbox */}
        <div
          className={cn(
            'min-h-0 w-full shrink-0 flex-col border-r md:flex md:w-[320px] lg:w-[340px]',
            active ? 'hidden' : 'flex',
          )}
        >
          <ConversationList
            ref={listSearchRef}
            rows={rows}
            visibleRows={visibleRows}
            isLoading={conversations.isLoading}
            activeId={activeId}
            onSelect={selectConversation}
            onNew={() => setPickerOpen(true)}
            query={rawQuery}
            onQueryChange={setRawQuery}
            filter={filter}
            onFilterChange={setFilter}
            userId={user?.id}
          />
        </div>

        {/* Thread */}
        <div className={cn('min-h-0 min-w-0 flex-1 flex-col', active ? 'flex' : 'hidden md:flex')}>
          {active ? (
            <>
              <div className="flex shrink-0 items-center gap-2 border-b bg-card px-3 py-2.5 sm:px-4">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 md:hidden"
                  onClick={() => selectConversation(undefined)}
                  title={t('common.back')}
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">{t('common.back')}</span>
                </Button>
                <button
                  type="button"
                  onClick={() => setInfoOpen(true)}
                  title={t('messaging.viewInfo')}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1.5 py-1 text-left transition-colors hover:bg-muted/70"
                >
                  <ConversationAvatar others={active.others} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
                      <span className="truncate" title={active.fullNames}>
                        {active.fullNames}
                      </span>
                      {active.conversation.isLocked ? (
                        <Lock className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label={t('messaging.locked')} />
                      ) : null}
                    </p>
                    <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                      {active.isGroup ? <Users className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
                      <span className="truncate">{activeSubtitle}</span>
                    </p>
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-0.5">
                  <HeaderAction
                    icon={Search}
                    label={t('messaging.searchInThread')}
                    pressed={threadSearchOpen}
                    onClick={() => setThreadSearchOpen((o) => !o)}
                  />
                  <HeaderAction
                    icon={PanelRight}
                    label={t('messaging.toggleDetails')}
                    pressed={detailsOpen}
                    onClick={toggleDetails}
                    className="hidden xl:inline-flex"
                  />
                </div>
              </div>
              <div className="min-h-0 flex-1">
                <ThreadView
                  threadId={active.conversation.id}
                  participants={active.others}
                  isLocked={active.conversation.isLocked}
                  searchOpen={threadSearchOpen}
                  onSearchClose={() => setThreadSearchOpen(false)}
                />
              </div>
              <ThreadInfoDialog open={infoOpen} onOpenChange={setInfoOpen} others={active.others} />
            </>
          ) : (
            <WelcomePane
              loading={conversations.isLoading}
              staleLink={Boolean(activeId) && !conversations.isLoading}
              unread={totalUnread}
              onNew={() => setPickerOpen(true)}
            />
          )}
        </div>

        {/* Details */}
        {active && detailsOpen ? (
          <div className="hidden w-[300px] shrink-0 border-l bg-muted/20 animate-in fade-in slide-in-from-right-2 duration-200 xl:block 2xl:w-[330px]">
            <ThreadDetailsPanel
              key={active.conversation.id}
              row={active}
              onClose={toggleDetails}
              onOpenMember={() => setInfoOpen(true)}
            />
          </div>
        ) : null}
      </div>

      <NewConversationDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onCreated={(id) => selectConversation(id)}
      />
    </div>
  );
}

function HeaderStat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors animate-in fade-in zoom-in-95 duration-300',
        highlight ? 'border-primary/30 bg-primary/10 text-primary' : 'bg-card text-muted-foreground hover:bg-muted',
      )}
    >
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
      {label}
    </span>
  );
}

function HeaderAction({
  icon: Icon,
  label,
  pressed,
  onClick,
  className,
}: {
  icon: typeof Search;
  label: string;
  pressed: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-pressed={pressed}
      title={label}
      className={cn(
        'h-9 w-9 rounded-xl text-muted-foreground',
        pressed && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
        className,
      )}
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </Button>
  );
}

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-foreground">{label}</span>
      <span className="flex gap-1">
        {keys.map((k) => (
          <kbd key={k} className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {k}
          </kbd>
        ))}
      </span>
    </div>
  );
}

function WelcomePane({
  loading,
  staleLink,
  unread,
  onNew,
}: {
  loading: boolean;
  staleLink: boolean;
  unread: number;
  onNew: () => void;
}) {
  const { t } = useTranslation();
  if (loading) return <div className="flex-1" />;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 bg-[radial-gradient(circle_at_1px_1px,hsl(var(--muted-foreground)/0.08)_1px,transparent_0)] p-8 text-center [background-size:22px_22px]">
      <div className="relative">
        <span className="absolute inset-0 animate-[pulse_3s_ease-in-out_infinite] rounded-3xl bg-primary/20 blur-xl motion-reduce:animate-none" />
        <span className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg">
          <MessageSquareText className="h-9 w-9" aria-hidden="true" />
        </span>
      </div>
      <div className="max-w-sm space-y-1.5">
        <p className="text-base font-semibold text-foreground">
          {staleLink ? t('messaging.notFound') : t('messaging.selectConversation')}
        </p>
        <p className="text-sm text-muted-foreground">
          {unread > 0 ? t('messaging.unreadWaiting', { count: unread }) : t('messaging.selectConversationHint')}
        </p>
      </div>
      <Button onClick={onNew}>
        <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {t('messaging.newConversation')}
      </Button>
      <p className="hidden text-xs text-muted-foreground md:block">
        {t('messaging.shortcutTip.pre')}{' '}
        <kbd className="rounded-md border bg-card px-1.5 py-0.5 font-mono text-[10px]">/</kbd>{' '}
        {t('messaging.shortcutTip.post')}
      </p>
    </div>
  );
}
