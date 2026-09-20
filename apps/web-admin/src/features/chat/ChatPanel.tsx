import type { ChatMessageEvent, ChatMessageView } from '@abcp/shared-types';
import { useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Socket } from 'socket.io-client';

import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/features/auth/useAuth';
import { NormalizedApiError } from '@/services/apiError';
import { connectAppSocket } from '@/services/socket';

import { ChatMessageBubble } from './ChatMessageBubble';
import { useChatMessages, useChatThread, useSendChatMessage } from './chat.api';

/**
 * Live admin chat view embedded in AppointmentDetailPage — socket-driven (Wave 7C.2 / Module 21).
 * Unlike 7B.3's dispatch table (deliberately no socket), a live chat view is genuinely useful here,
 * so this is web-admin's first socket.io-client consumer.
 */
export function ChatPanel({ appointmentId }: { appointmentId: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const thread = useChatThread(appointmentId);
  const threadId = thread.data?.id;
  const messages = useChatMessages(threadId);
  const send = useSendChatMessage(threadId);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  const messagesKey = ['chat', 'messages', threadId ?? ''] as const;

  useEffect(() => {
    if (!threadId) return undefined;
    const socket: Socket = connectAppSocket();
    socket.emit('join-chat', { threadId });

    socket.on('chat:message', (evt: ChatMessageEvent) => {
      if (evt.threadId !== threadId) return;
      qc.setQueryData<ChatMessageView[]>(messagesKey, (prev) =>
        prev?.some((m) => m.id === evt.id) ? prev : [...(prev ?? []), evt],
      );
    });

    return () => {
      socket.emit('leave-chat', { threadId });
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- messagesKey is derived from threadId
  }, [threadId, qc]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.data?.length]);

  const onSend = () => {
    const body = draft.trim();
    if (!body || !threadId) return;
    setDraft('');
    send.mutate(body, {
      onError: (err) => {
        setDraft(body);
        toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('chat.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div ref={listRef} className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
          {thread.isLoading || messages.isLoading ? (
            <>
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-10 w-1/2 self-end" />
            </>
          ) : messages.data && messages.data.length > 0 ? (
            messages.data.map((m) => (
              <ChatMessageBubble key={m.id} message={m} mine={m.senderId === user?.id} />
            ))
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('chat.empty')}</p>
          )}
        </div>

        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder={t('chat.placeholder')}
            className="min-h-[40px] flex-1 resize-none"
            maxLength={2000}
          />
          <Button size="icon" onClick={onSend} disabled={!draft.trim() || send.isPending}>
            <Send className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
