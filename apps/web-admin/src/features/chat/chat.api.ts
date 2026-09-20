import type {
  ChatMessageView,
  ChatThreadView,
  Paginated,
  SendChatMediaInput,
} from '@abcp/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { http } from '@/services/http';

interface Envelope<T> {
  data: T;
}

const KEY = (appointmentId: string) => ['chat', 'thread', appointmentId] as const;
const MESSAGES_KEY = (threadId: string) => ['chat', 'messages', threadId] as const;

/** GET/ensure the thread for an appointment (lazy-created server-side on first call). */
export function useChatThread(appointmentId: string | undefined) {
  return useQuery({
    queryKey: KEY(appointmentId ?? ''),
    queryFn: async () => {
      const { data } = await http.get<Envelope<ChatThreadView>>(
        `/chat/appointments/${appointmentId}/thread`,
      );
      return data.data;
    },
    enabled: Boolean(appointmentId),
  });
}

/** REST fallback for message history — the live view of new messages comes from the socket. */
export function useChatMessages(threadId: string | undefined) {
  return useQuery({
    queryKey: MESSAGES_KEY(threadId ?? ''),
    queryFn: async () => {
      const { data } = await http.get<Envelope<Paginated<ChatMessageView>>>(
        `/chat/threads/${threadId}/messages`,
        { params: { page: 1, pageSize: 100, latest: true } },
      );
      return data.data.items;
    },
    enabled: Boolean(threadId),
  });
}

/** REST fallback send — the socket path (`chat:message`) is primary, this covers the
 * "socket disconnected / still connecting" gap so the input never feels dead. */
export function useSendChatMessage(threadId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const { data } = await http.post<Envelope<ChatMessageView>>(
        `/chat/threads/${threadId}/messages`,
        { body },
      );
      return data.data;
    },
    onSuccess: (message) => {
      qc.setQueryData<ChatMessageView[]>(MESSAGES_KEY(threadId ?? ''), (prev) =>
        prev?.some((m) => m.id === message.id) ? prev : [...(prev ?? []), message],
      );
    },
  });
}

/** REST-only (no socket upload path) — mirrors the treatment-photo base64 pattern. Web-admin's
 * counterpart to mobile's `ChatComposer` attach/voice flow (Wave 8's chat media attachments were
 * mobile-only at the time; the backend route already supported any client). */
export function useSendChatMedia(threadId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SendChatMediaInput) => {
      const { data } = await http.post<Envelope<ChatMessageView>>(
        `/chat/threads/${threadId}/media`,
        input,
      );
      return data.data;
    },
    onSuccess: (message) => {
      qc.setQueryData<ChatMessageView[]>(MESSAGES_KEY(threadId ?? ''), (prev) =>
        prev?.some((m) => m.id === message.id) ? prev : [...(prev ?? []), message],
      );
    },
  });
}
