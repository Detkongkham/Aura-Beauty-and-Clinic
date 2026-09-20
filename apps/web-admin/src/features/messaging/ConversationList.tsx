import { CheckCheck, Image as ImageIcon, Inbox, Lock, MessageSquareText, Mic, Plus, Search, X } from 'lucide-react';
import { forwardRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import {
  compactStamp,
  INBOX_FILTERS,
  mediaKind,
  previewText,
  recencyBucket,
  type ConversationRow,
  type InboxFilter,
  type Participant,
  type RecencyBucket,
} from './messagingModel';

const BUCKET_ORDER: RecencyBucket[] = ['today', 'yesterday', 'week', 'older', 'never'];

/** Single face for 1:1, a two-face stack for groups. The lock badge sits on the corner. */
export function ConversationAvatar({
  others,
  size = 44,
  locked = false,
}: {
  others: Participant[];
  size?: number;
  locked?: boolean;
}) {
  const small = Math.round(size * 0.72);
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {others.length <= 1 ? (
        <PersonAvatar name={others[0]?.name ?? '?'} size={size} />
      ) : (
        <>
          <PersonAvatar name={others[0]!.name} size={small} className="absolute left-0 top-0" />
          <span className="absolute bottom-0 right-0 rounded-full ring-2 ring-card">
            {others.length > 2 ? (
              <span
                className="flex items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground"
                style={{ width: small, height: small }}
              >
                +{others.length - 1}
              </span>
            ) : (
              <PersonAvatar name={others[1]!.name} size={small} />
            )}
          </span>
        </>
      )}
      {locked ? (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-amber-500 text-white ring-2 ring-card">
          <Lock className="h-2.5 w-2.5" aria-hidden="true" />
        </span>
      ) : null}
    </span>
  );
}

interface ConversationListProps {
  rows: ConversationRow[];
  visibleRows: ConversationRow[];
  isLoading: boolean;
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onNew: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  filter: InboxFilter;
  onFilterChange: (f: InboxFilter) => void;
  userId: string | undefined;
}

export const ConversationList = forwardRef<HTMLInputElement, ConversationListProps>(function ConversationList(
  { rows, visibleRows, isLoading, activeId, onSelect, onNew, query, onQueryChange, filter, onFilterChange, userId },
  searchRef,
) {
  const { t, i18n } = useTranslation();

  const counts = useMemo(() => {
    const c: Record<InboxFilter, number> = { all: rows.length, unread: 0, direct: 0, group: 0 };
    for (const r of rows) {
      if (r.conversation.unreadCount > 0) c.unread += 1;
      if (r.isGroup) c.group += 1;
      else c.direct += 1;
    }
    return c;
  }, [rows]);

  const sections = useMemo(() => {
    const map = new Map<RecencyBucket, ConversationRow[]>();
    for (const r of visibleRows) {
      const b = recencyBucket(r.conversation.lastMessageAt);
      map.set(b, [...(map.get(b) ?? []), r]);
    }
    return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({ bucket: b, rows: map.get(b)! }));
  }, [visibleRows]);

  // Arrow keys move through the visible rows, in on-screen order.
  const ordered = sections.flatMap((s) => s.rows);
  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const idx = ordered.findIndex((r) => r.conversation.id === activeId);
    const next = ordered[e.key === 'ArrowDown' ? Math.min(idx + 1, ordered.length - 1) : Math.max(idx - 1, 0)];
    if (next) {
      onSelect(next.conversation.id);
      document.getElementById(`conv-${next.conversation.id}`)?.focus();
    }
  };

  let staggerIndex = 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">{t('messaging.inbox')}</h2>
            {counts.unread > 0 ? (
              <span
                role="status"
                aria-atomic="true"
                className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary-foreground"
              >
                <span aria-hidden="true">{counts.unread}</span>
                <span className="sr-only">{t('messaging.unreadConversations', { count: counts.unread })}</span>
              </span>
            ) : null}
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground"
            onClick={onNew}
            title={t('messaging.newConversation')}
          >
            <Plus className="h-[18px] w-[18px]" aria-hidden="true" />
            <span className="sr-only">{t('messaging.newConversation')}</span>
          </Button>
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.stopPropagation();
                onQueryChange('');
              }
            }}
            placeholder={t('messaging.searchConversations')}
            aria-label={t('messaging.searchConversations')}
            className="h-10 rounded-xl border-transparent bg-muted/60 pl-9 pr-9 transition-colors focus-visible:border-input focus-visible:bg-background"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t('common.remove')}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-md border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:block">
              /
            </kbd>
          )}
        </div>

        <div role="tablist" aria-label={t('messaging.filterLabel')} className="flex gap-1 rounded-xl bg-muted/60 p-1">
          {INBOX_FILTERS.map((f) => {
            const selected = filter === f;
            return (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onFilterChange(f)}
                className={cn(
                  'flex flex-auto items-center justify-center gap-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-medium transition-all duration-200',
                  selected
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span>{t(`messaging.filter.${f}`)}</span>
                {counts[f] > 0 ? (
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-1.5 text-[10px] tabular-nums',
                      selected && f === 'unread' ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/10',
                    )}
                  >
                    {counts[f]}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" onKeyDown={onListKeyDown}>
        {isLoading ? (
          <div className="space-y-1 px-1">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl p-2.5">
                <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between gap-6">
                    <div
                      className="h-3 animate-pulse rounded bg-muted"
                      style={{ width: `${45 + ((i * 17) % 35)}%` }}
                    />
                    <div className="h-2.5 w-8 animate-pulse rounded bg-muted" />
                  </div>
                  <div className="h-2.5 animate-pulse rounded bg-muted" style={{ width: `${60 + ((i * 11) % 30)}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <MessageSquareText className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{t('messaging.empty')}</p>
              <p className="text-xs text-muted-foreground">{t('messaging.emptyHint')}</p>
            </div>
            <Button size="sm" onClick={onNew}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('messaging.newConversation')}
            </Button>
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              {query ? t('messaging.noMatches') : t(`messaging.filterEmpty.${filter}`)}
            </p>
            {query || filter !== 'all' ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  onQueryChange('');
                  onFilterChange('all');
                }}
              >
                {t('messaging.clearFilters')}
              </Button>
            ) : null}
          </div>
        ) : (
          sections.map(({ bucket, rows: sectionRows }) => (
            <section key={bucket} aria-label={t(`messaging.bucket.${bucket}`)}>
              <h3 className="sticky top-0 z-10 bg-card/95 px-3 pb-1 pt-3 text-[11px] font-medium text-muted-foreground backdrop-blur-sm">
                {t(`messaging.bucket.${bucket}`)}
              </h3>
              <ul className="space-y-0.5">
                {sectionRows.map((row) => {
                  const c = row.conversation;
                  const isActive = activeId === c.id;
                  const unread = c.unreadCount > 0 && !isActive;
                  const last = c.lastMessage;
                  const kind = mediaKind(last?.messageType);
                  const mine = last?.senderId === userId;
                  const delay = Math.min(staggerIndex++, 12) * 25;
                  return (
                    <li
                      key={c.id}
                      className="animate-in fade-in slide-in-from-left-1 fill-mode-both duration-300 ease-out motion-reduce:animate-none"
                      style={{ animationDelay: `${delay}ms` }}
                    >
                      <button
                        id={`conv-${c.id}`}
                        type="button"
                        onClick={() => onSelect(c.id)}
                        aria-current={isActive ? 'true' : undefined}
                        title={row.fullNames}
                        className={cn(
                          'group relative flex w-full min-w-0 items-center gap-3 rounded-xl px-2.5 py-2.5 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring',
                          isActive ? 'bg-primary/10' : 'hover:bg-muted/70',
                        )}
                      >
                        <span
                          className={cn(
                            'absolute inset-y-3 left-0 w-[3px] rounded-full bg-primary transition-transform duration-200',
                            isActive ? 'scale-y-100' : 'scale-y-0',
                          )}
                          aria-hidden="true"
                        />
                        <ConversationAvatar others={row.others} locked={c.isLocked} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p
                              className={cn(
                                'min-w-0 truncate text-sm text-foreground',
                                unread || isActive ? 'font-semibold' : 'font-medium',
                              )}
                            >
                              {row.label}
                              {row.extraCount > 0 ? (
                                <span className="font-normal text-muted-foreground"> +{row.extraCount}</span>
                              ) : null}
                            </p>
                            <span
                              className={cn(
                                'shrink-0 text-[11px] tabular-nums',
                                unread ? 'font-semibold text-primary' : 'text-muted-foreground',
                              )}
                            >
                              {compactStamp(c.lastMessageAt ?? c.createdAt, i18n.language)}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2">
                            <p
                              className={cn(
                                'flex min-w-0 flex-1 items-center gap-1 text-xs',
                                unread ? 'text-foreground' : 'text-muted-foreground',
                                !last && 'italic',
                              )}
                            >
                              {mine ? (
                                <CheckCheck className="h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden="true" />
                              ) : null}
                              {kind === 'IMAGE' ? (
                                <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              ) : kind === 'AUDIO' ? (
                                <Mic className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              ) : null}
                              <span className="truncate">{previewText(row, userId, t)}</span>
                            </p>
                            {unread ? (
                              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold tabular-nums text-primary-foreground animate-in zoom-in-50 duration-200">
                                {c.unreadCount > 99 ? '99+' : c.unreadCount}
                                <span className="sr-only"> {t('messaging.unreadMessages', { count: c.unreadCount })}</span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
});
