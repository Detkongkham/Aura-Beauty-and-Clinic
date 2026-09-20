import type { ChatReportView, ConversationListItem, ConversationMediaSummary } from '@abcp/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { http } from '@/services/http';

interface Envelope<T> {
  data: T;
}

const KEY = (type?: string) => ['conversations', 'list', type ?? 'all'] as const;

/** GET /conversations — ໂມດູນ 38 Wave 8B. ຫ້ອງແຊັດ STAFF_INTERNAL ຂອງ actor ປັດຈຸບັນ. */
export function useConversations(type: 'STAFF_INTERNAL' = 'STAFF_INTERNAL') {
  return useQuery({
    queryKey: KEY(type),
    queryFn: async () => {
      const { data } = await http.get<Envelope<ConversationListItem[]>>('/conversations', {
        params: { type },
      });
      return data.data;
    },
    // Only the open thread has a socket room, so other threads' previews/unread badges catch up by polling.
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });
}

/** GET /conversations/:id/media — whole-thread photo/voice counts + latest photos. */
export function useConversationMedia(id: string | undefined, limit = 60) {
  return useQuery({
    queryKey: ['conversations', 'media', id ?? '', limit] as const,
    queryFn: async () => {
      const { data } = await http.get<Envelope<ConversationMediaSummary>>(`/conversations/${id}/media`, {
        params: { limit },
      });
      return data.data;
    },
    enabled: Boolean(id),
  });
}

/** Refetch the inbox list (e.g. after a message lands in the open thread). */
export function useInvalidateConversations() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['conversations', 'list'] }),
      qc.invalidateQueries({ queryKey: ['conversations', 'media'] }),
    ]);
}

/** POST /conversations/:id/read — moves the viewer's read cursor. Clears the badge locally first
 * so it doesn't wait for the next poll. */
export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await http.post(`/conversations/${id}/read`);
      return id;
    },
    onMutate: (id) => {
      qc.setQueriesData<ConversationListItem[]>({ queryKey: ['conversations', 'list'] }, (prev) =>
        prev?.map((c) => (c.id === id && c.unreadCount > 0 ? { ...c, unreadCount: 0 } : c)),
      );
    },
  });
}

/** POST /conversations {type:'STAFF_INTERNAL'} — ສ້າງຫ້ອງ STAFF_INTERNAL ໃໝ່. */
export function useCreateStaffConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (participantIds: string[]) => {
      const { data } = await http.post<Envelope<ConversationListItem>>('/conversations', {
        type: 'STAFF_INTERNAL',
        participantIds,
      });
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY('STAFF_INTERNAL') });
    },
  });
}

const REPORTS_KEY = (status?: string) => ['conversations', 'reports', status ?? 'all'] as const;

/** GET /conversations/reports — ໂມດູນ 38 Wave 8D, admin-only moderation queue. */
export function useChatReports(status?: 'PENDING' | 'REVIEWED' | 'ACTIONED') {
  return useQuery({
    queryKey: REPORTS_KEY(status),
    queryFn: async () => {
      const { data } = await http.get<Envelope<ChatReportView[]>>('/conversations/reports', {
        params: { status },
      });
      return data.data;
    },
  });
}

export function useReviewChatReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'REVIEWED' | 'ACTIONED' }) => {
      const { data } = await http.patch<Envelope<{ id: string; status: string }>>(
        `/conversations/reports/${id}`,
        { status },
      );
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conversations', 'reports'] });
    },
  });
}
