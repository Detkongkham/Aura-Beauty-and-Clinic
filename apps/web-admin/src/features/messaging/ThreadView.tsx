import type { ChatMessageEvent, ChatMessageView, ChatReadEvent, ConversationListItem } from '@abcp/shared-types';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, ImagePlus, Lock, Mic, Search, Send, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Socket } from 'socket.io-client';
import { toast } from 'sonner';

import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { DateTimeText } from '@/components/shared/DateTimeText';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/features/auth/useAuth';
import { ChatMessageBubble } from '@/features/chat/ChatMessageBubble';
import { useChatMessages, useSendChatMedia, useSendChatMessage } from '@/features/chat/chat.api';
import { ChatMediaError, fileToChatImage, useVoiceRecorder } from '@/features/chat/mediaCapture';
import { dayjs } from '@/lib/format';
import { APP_TIMEZONE } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';
import { connectAppSocket } from '@/services/socket';

import { useInvalidateConversations, useMarkConversationRead } from './messaging.api';

const ALLOWED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp';

/** How close to the bottom (px) still counts as "at the bottom" for auto-scroll purposes. */
const BOTTOM_THRESHOLD_PX = 120;
/** Composer character limit — matches the backend's message body cap. */
const MESSAGE_MAX_LENGTH = 2000;
/** Show the live character counter only once a draft gets close to the limit. */
const COUNTER_VISIBLE_AT = MESSAGE_MAX_LENGTH - 200;
/** Composer grows with the draft up to this height, then scrolls. */
const COMPOSER_MAX_HEIGHT_PX = 160;
/** Starter phrases offered in an empty thread (i18n keys under messaging.starters). */
const STARTER_KEYS = ['hello', 'shift', 'thanks'] as const;

/** Local day key (Vientiane tz) for the "same day → one divider" grouping below. */
const dayKey = (value: string) => dayjs(value).tz(APP_TIMEZONE).format('YYYY-MM-DD');

/** `mm:ss` elapsed-time label for the voice recorder row. */
function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Consecutive messages from the same sender within this window collapse into one visual group. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

interface RenderItem {
  message: ChatMessageView;
  dayDivider: string | null;
  isGroupStart: boolean;
  isGroupEnd: boolean;
}

function buildRenderItems(messages: ChatMessageView[]): RenderItem[] {
  return messages.map((message, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const key = dayKey(message.createdAt);
    const dayDivider = !prev || dayKey(prev.createdAt) !== key ? key : null;

    const sameGroup = (a: ChatMessageView, b: ChatMessageView | undefined) =>
      !!b &&
      b.senderId === a.senderId &&
      Math.abs(dayjs(b.createdAt).diff(dayjs(a.createdAt))) < GROUP_WINDOW_MS &&
      dayKey(b.createdAt) === dayKey(a.createdAt);

    return {
      message,
      dayDivider,
      isGroupStart: !sameGroup(message, prev),
      isGroupEnd: !sameGroup(message, next),
    };
  });
}

/**
 * Generic message list + composer for any `threadId` (Module 38 Wave 8B) — reuses the
 * already-generic `useChatMessages`/`useSendChatMessage` hooks from `features/chat/chat.api.ts`
 * (Module 21) but, unlike `ChatPanel`, doesn't resolve a thread from an `appointmentId` — this is
 * kept as a separate component rather than a refactor of `ChatPanel` so M21's appointment-embedded
 * chat stays untouched.
 *
 * Inbox additions: persists the read cursor (so list unread badges clear), refreshes the inbox list
 * when messages land, an in-thread search bar (`searchOpen`) with prev/next hit navigation, and a
 * read-only banner in place of the composer when the thread is locked.
 */
export function ThreadView({
  threadId,
  participants = [],
  isLocked = false,
  searchOpen = false,
  onSearchClose,
}: {
  threadId: string | undefined;
  /** Other members of the thread (excludes the viewer) — used to label read receipts. */
  participants?: ConversationListItem['participants'];
  isLocked?: boolean;
  searchOpen?: boolean;
  onSearchClose?: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const messages = useChatMessages(threadId);
  const send = useSendChatMessage(threadId);
  const sendMedia = useSendChatMedia(threadId);
  const markRead = useMarkConversationRead();
  const invalidateList = useInvalidateConversations();
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesKey = ['chat', 'messages', threadId ?? ''] as const;

  const mediaError = (err: unknown) => {
    if (err instanceof ChatMediaError && err.message === 'too-large') {
      toast.error(t('chat.mediaTooLarge'));
    } else {
      toast.error(err instanceof NormalizedApiError ? err.message : t('chat.mediaError'));
    }
  };

  const recorder = useVoiceRecorder((clip) => {
    if (!clip) return;
    sendMedia.mutate(
      { messageType: 'AUDIO', contentType: clip.contentType, dataBase64: clip.base64 },
      { onError: mediaError, onSuccess: () => void invalidateList() },
    );
  });

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { base64, contentType } = await fileToChatImage(file);
      sendMedia.mutate(
        { messageType: 'IMAGE', contentType, dataBase64: base64 },
        { onError: mediaError, onSuccess: () => void invalidateList() },
      );
    } catch (err) {
      mediaError(err);
    }
  };

  const onMicClick = async () => {
    if (recorder.isRecording) {
      recorder.stop();
      return;
    }
    try {
      await recorder.start();
    } catch {
      toast.error(t('chat.micUnavailable'));
    }
  };

  // ຕິດຕາມວ່າຄົນອື່ນອ່ານເຖິງໄສແລ້ວ — `chat:read` ເປັນ broadcast ສົດ, ສະນັ້ນ "seen" ນີ້ແມ່ນສະເພາະຄົນທີ່
  // ເປີດ thread ຢູ່ຕອນນັ້ນ (ຄືກັນກັບຫຼາຍແອັບແຊັດສົດ). read cursor ໃນ DB ແຍກຕ່າງຫາກ ໃຊ້ນັບ unread ໃນ inbox.
  const [reads, setReads] = useState<Map<string, string>>(new Map());
  const atBottomRef = useRef(true);
  const prevLenRef = useRef(0);
  const [showJump, setShowJump] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!threadId) return undefined;
    const socket: Socket = connectAppSocket();
    socketRef.current = socket;
    socket.emit('join-chat', { threadId });
    socket.emit('chat:read', { threadId });
    socket.on('chat:message', (evt: ChatMessageEvent) => {
      if (evt.threadId !== threadId) return;
      qc.setQueryData<ChatMessageView[]>(messagesKey, (prev) =>
        prev?.some((m) => m.id === evt.id) ? prev : [...(prev ?? []), evt],
      );
      void invalidateList();
    });
    socket.on('chat:read', (evt: ChatReadEvent) => {
      if (evt.threadId !== threadId || evt.readerId === user?.id) return;
      setReads((prev) => new Map(prev).set(evt.readerId, evt.readAt));
    });
    return () => {
      socket.emit('leave-chat', { threadId });
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- messagesKey derives from threadId
  }, [threadId, qc, user?.id]);

  // ປ່ຽນຫ້ອງແຊັດ → ຣີເຊັດສະຖານະ scroll/seen ຂອງຫ້ອງເກົ່າ, ແລະ ບັນທຶກວ່າອ່ານແລ້ວ (REST, ບໍ່ລໍຖ້າ socket).
  useEffect(() => {
    atBottomRef.current = true;
    prevLenRef.current = 0;
    setShowJump(false);
    setNewCount(0);
    setReads(new Map());
    setDraft('');
    if (threadId) markRead.mutate(threadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per thread switch
  }, [threadId]);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior });
    setShowJump(false);
    setNewCount(0);
    atBottomRef.current = true;
    if (threadId) socketRef.current?.emit('chat:read', { threadId });
  };

  useEffect(() => {
    const len = messages.data?.length ?? 0;
    const grew = len > prevLenRef.current;
    const firstLoad = prevLenRef.current === 0;
    if (grew) {
      if (atBottomRef.current || firstLoad) {
        scrollToBottom(firstLoad ? 'auto' : 'smooth');
      } else {
        setNewCount((c) => c + (len - prevLenRef.current));
        setShowJump(true);
      }
    }
    prevLenRef.current = len;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scrollToBottom is stable-enough for this effect's purpose
  }, [messages.data?.length]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < BOTTOM_THRESHOLD_PX;
    const wasAtBottom = atBottomRef.current;
    atBottomRef.current = atBottom;
    if (atBottom) {
      setShowJump(false);
      setNewCount(0);
      if (!wasAtBottom && threadId) socketRef.current?.emit('chat:read', { threadId });
    }
  };

  // ---- In-thread search ----
  const [rawSearch, setRawSearch] = useState('');
  const [hitIndex, setHitIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const term = searchOpen ? rawSearch.trim() : '';

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
    else setRawSearch('');
  }, [searchOpen]);

  useEffect(() => {
    setRawSearch('');
  }, [threadId]);

  const hits = useMemo(() => {
    if (term.length < 2) return [];
    const needle = term.toLowerCase();
    return (messages.data ?? [])
      .filter((m) => m.messageType !== 'IMAGE' && m.messageType !== 'AUDIO' && m.body.toLowerCase().includes(needle))
      .map((m) => m.id);
  }, [messages.data, term]);

  // Newest hit first, like most chat apps.
  useEffect(() => {
    setHitIndex(hits.length > 0 ? hits.length - 1 : 0);
  }, [hits.length, term]);

  const focusedHit = hits[hitIndex];
  useEffect(() => {
    if (!focusedHit) return;
    document.getElementById(`msg-${focusedHit}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focusedHit]);

  const stepHit = (dir: -1 | 1) => {
    if (hits.length === 0) return;
    setHitIndex((i) => (i + dir + hits.length) % hits.length);
  };

  const renderItems = useMemo(() => buildRenderItems(messages.data ?? []), [messages.data]);

  const lastMineId = useMemo(() => {
    const mine = (messages.data ?? []).filter((m) => m.senderId === user?.id);
    return mine[mine.length - 1]?.id;
  }, [messages.data, user?.id]);

  const seenBy = useMemo(() => {
    if (!lastMineId) return [];
    const lastMine = (messages.data ?? []).find((m) => m.id === lastMineId);
    if (!lastMine) return [];
    return participants.filter((p) => {
      const readAt = reads.get(p.id);
      return readAt && dayjs(readAt).isAfter(dayjs(lastMine.createdAt).subtract(1, 'second'));
    });
  }, [lastMineId, messages.data, participants, reads]);

  const dayLabel = (key: string) => {
    const today = dayjs().tz(APP_TIMEZONE).format('YYYY-MM-DD');
    const yesterday = dayjs().tz(APP_TIMEZONE).subtract(1, 'day').format('YYYY-MM-DD');
    if (key === today) return t('messaging.today');
    if (key === yesterday) return t('messaging.yesterday');
    return null;
  };

  // Composer grows with its content.
  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
  }, [draft]);

  const onSend = () => {
    const body = draft.trim();
    if (!body || !threadId) return;
    setDraft('');
    send.mutate(body, {
      onSuccess: () => void invalidateList(),
      onError: (err) => {
        setDraft(body);
        toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));
      },
    });
  };

  if (!threadId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('messaging.selectConversation')}
      </div>
    );
  }

  const counterVisible = draft.length >= COUNTER_VISIBLE_AT;
  const nearLimit = draft.length >= MESSAGE_MAX_LENGTH - 20;
  const firstOther = participants[0]?.name;

  return (
    <div className="flex h-full flex-col">
      {searchOpen ? (
        <div className="flex shrink-0 items-center gap-2 border-b bg-card px-4 py-2 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              ref={searchInputRef}
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  stepHit(e.shiftKey ? 1 : -1);
                } else if (e.key === 'Escape') {
                  e.stopPropagation();
                  onSearchClose?.();
                }
              }}
              placeholder={t('messaging.searchInThread')}
              aria-label={t('messaging.searchInThread')}
              className="h-9 rounded-lg pl-9"
            />
          </div>
          <span className="w-16 shrink-0 text-center text-xs tabular-nums text-muted-foreground" role="status">
            {term.length >= 2 ? (hits.length > 0 ? `${hitIndex + 1}/${hits.length}` : t('messaging.noHits')) : null}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => stepHit(-1)}
            disabled={hits.length < 2}
            title={t('messaging.prevHit')}
          >
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{t('messaging.prevHit')}</span>
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => stepHit(1)}
            disabled={hits.length < 2}
            title={t('messaging.nextHit')}
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{t('messaging.nextHit')}</span>
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onSearchClose} title={t('common.close')}>
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{t('common.close')}</span>
          </Button>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 bg-[radial-gradient(circle_at_1px_1px,hsl(var(--muted-foreground)/0.08)_1px,transparent_0)] [background-size:22px_22px]">
        <div
          ref={listRef}
          onScroll={onScroll}
          className="flex h-full flex-col overflow-y-auto px-4 pt-4 sm:px-8"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {messages.isLoading ? (
            <div className="flex flex-col gap-3 py-2">
              <Skeleton className="h-10 w-2/3 rounded-2xl" />
              <Skeleton className="h-10 w-1/2 self-end rounded-2xl" />
              <Skeleton className="h-16 w-3/5 rounded-2xl" />
              <Skeleton className="h-10 w-2/5 self-end rounded-2xl" />
            </div>
          ) : messages.data && messages.data.length > 0 ? (
            <>
              <div className="mt-auto" aria-hidden="true" />
              {renderItems.map(({ message: m, dayDivider, isGroupStart, isGroupEnd }, i) => (
                <div key={m.id} id={`msg-${m.id}`} className="flex scroll-mt-16 flex-col">
                  {dayDivider ? (
                    <div className="my-5 flex justify-center first:mt-1">
                      <span className="rounded-full border bg-card/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur">
                        {dayLabel(dayDivider) ?? <DateTimeText value={m.createdAt} mode="date" />}
                      </span>
                    </div>
                  ) : null}
                  <div
                    className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none"
                    style={{ animationDelay: `${Math.max(0, Math.min(renderItems.length - 1 - i, 8)) * 20}ms` }}
                  >
                    <ChatMessageBubble
                      message={m}
                      mine={m.senderId === user?.id}
                      showMeta={isGroupEnd}
                      isGroupStart={isGroupStart}
                      isGroupEnd={isGroupEnd}
                      showAvatar
                      highlight={hits.includes(m.id) ? term : undefined}
                      focused={m.id === focusedHit}
                    />
                  </div>
                  {m.id === lastMineId && seenBy.length > 0 ? (
                    <div
                      className="mt-1 flex animate-in items-center justify-end gap-1 fade-in duration-300"
                      title={seenBy.map((p) => p.name).join(', ')}
                    >
                      <div className="flex -space-x-1.5">
                        {seenBy.slice(0, 3).map((p) => (
                          <PersonAvatar key={p.id} name={p.name} size={14} className="ring-1 ring-card" />
                        ))}
                      </div>
                      <span className="text-[10px] text-muted-foreground">{t('messaging.seen')}</span>
                    </div>
                  ) : null}
                </div>
              ))}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
              <div className="flex -space-x-3">
                {participants.slice(0, 3).map((p) => (
                  <PersonAvatar key={p.id} name={p.name} size={56} className="ring-4 ring-background" />
                ))}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {firstOther ? t('messaging.sayHello', { name: firstOther }) : t('chat.empty')}
                </p>
                <p className="max-w-xs text-xs text-muted-foreground">{t('messaging.sayHelloHint')}</p>
              </div>
              {!isLocked ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {STARTER_KEYS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setDraft(t(`messaging.starters.${k}`));
                        composerRef.current?.focus();
                      }}
                      className="rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary"
                    >
                      {t(`messaging.starters.${k}`)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
          <div className="h-3 shrink-0" aria-hidden="true" />
        </div>

        {showJump ? (
          <button
            type="button"
            onClick={() => scrollToBottom()}
            className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200 hover:bg-primary-hover"
          >
            {newCount > 0 ? t('messaging.newMessages', { count: newCount }) : t('messaging.jumpToLatest')}
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="shrink-0 border-t bg-card px-3 pb-2 pt-2.5 sm:px-4">
        {isLocked ? (
          <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
            <Lock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-medium text-foreground">{t('messaging.lockedTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('messaging.lockedHint')}</p>
            </div>
          </div>
        ) : (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_IMAGE_TYPES}
              className="hidden"
              onChange={onPickImage}
            />
            {recorder.isRecording ? (
              <div className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 py-1.5 pl-4 pr-1.5 animate-in fade-in duration-150">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
                </span>
                <span className="text-sm font-medium tabular-nums text-destructive">
                  {formatElapsed(recorder.elapsedMs)}
                </span>
                <span className="flex-1 truncate text-xs text-muted-foreground">{t('messaging.recording')}</span>
                <button
                  type="button"
                  onClick={recorder.cancel}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={t('common.cancel')}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
                <Button
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-full"
                  onClick={recorder.stop}
                  aria-label={t('chat.sendRecording')}
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ) : (
              <div className="flex items-end gap-1 rounded-2xl border border-input bg-background p-1.5 shadow-sm transition-shadow focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/10">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-xl text-muted-foreground hover:text-primary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sendMedia.isPending}
                  title={t('chat.attachImage')}
                >
                  <ImagePlus className="h-[18px] w-[18px]" aria-hidden="true" />
                  <span className="sr-only">{t('chat.attachImage')}</span>
                </Button>
                <Textarea
                  ref={composerRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      onSend();
                    }
                  }}
                  placeholder={t('chat.placeholder')}
                  aria-label={t('chat.placeholder')}
                  rows={1}
                  className="max-h-40 min-h-9 flex-1 resize-none border-none bg-transparent px-1.5 py-2 text-sm leading-snug shadow-none focus-visible:ring-0"
                  maxLength={MESSAGE_MAX_LENGTH}
                />
                {draft.trim() ? (
                  <Button
                    size="icon"
                    className="h-9 w-9 shrink-0 rounded-xl transition-transform animate-in zoom-in-75 duration-150 active:scale-90"
                    onClick={onSend}
                    disabled={send.isPending}
                    title={t('messaging.send')}
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">{t('messaging.send')}</span>
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 rounded-xl text-muted-foreground hover:text-primary"
                    onClick={onMicClick}
                    disabled={sendMedia.isPending}
                    title={t('chat.recordVoice')}
                  >
                    <Mic className="h-[18px] w-[18px]" aria-hidden="true" />
                    <span className="sr-only">{t('chat.recordVoice')}</span>
                  </Button>
                )}
              </div>
            )}
            <div className="mt-1.5 flex h-4 items-center justify-between px-1 text-[11px] text-muted-foreground">
              <span className="hidden sm:inline">
                {sendMedia.isPending ? t('messaging.uploading') : t('messaging.composerHint')}
              </span>
              {counterVisible ? (
                <span className={cn('ml-auto tabular-nums', nearLimit && 'font-medium text-destructive')}>
                  {draft.length}/{MESSAGE_MAX_LENGTH}
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
