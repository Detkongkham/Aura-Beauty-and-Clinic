import type { BlockedUserView, ConversationListItem, ConversationMediaSummary } from '@abcp/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '../../services/http';
import { qk } from '../../services/queryKeys';

/** ໂມດູນ 38 Wave 8D — DIRECT (ລູກຄ້າ↔ລູກຄ້າ). ບໍ່ມີ "ຄົ້ນຫາລູກຄ້າອື່ນເພື່ອສ້າງແຊັດໃໝ່" ໃນ mobile —
 * ບໍ່ມີ directory ຄົ້ນຫາລູກຄ້າໃນ product ນີ້ (ຄວາມສ່ຽງ privacy), ດັ່ງນັ້ນໜ້ານີ້ list ຫ້ອງທີ່ມີແລ້ວເທົ່ານັ້ນ. */
export function useDirectConversations() {
  return useQuery({
    queryKey: qk.conversations('DIRECT'),
    queryFn: async () => {
      const { data } = await http.get<{ data: ConversationListItem[] }>('/conversations', {
        params: { type: 'DIRECT' },
      });
      return data.data;
    },
    // ມີ socket room ສະເພາະຫ້ອງທີ່ເປີດຢູ່ — preview/unread ຂອງຫ້ອງອື່ນອັບເດດດ້ວຍ polling.
    refetchInterval: 20_000,
  });
}

/** `POST /conversations/:id/read` — ເລື່ອນ read cursor. ລ້າງ badge ໃນ cache ທັນທີ (ທຸກ list type)
 * ບໍ່ຕ້ອງລໍຖ້າ poll ຮອບຕໍ່ໄປ. ໃຊ້ຮ່ວມກັນທັງ DIRECT ແລະ STAFF_INTERNAL. */
export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.post(`/conversations/${id}/read`),
    onMutate: (id) => {
      qc.setQueriesData<ConversationListItem[]>({ queryKey: ['conversations', 'list'] }, (prev) =>
        prev?.map((c) => (c.id === id && c.unreadCount > 0 ? { ...c, unreadCount: 0 } : c)),
      );
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['conversations', 'list'] }),
  });
}

const BLOCKS_KEY = ['conversations', 'blocks'] as const;

/** `GET /conversations/blocks` — ຄົນທີ່ຂ້ອຍບລັອກໄວ້ (ໃໝ່ສຸດກ່ອນ). */
export function useBlockedUsers() {
  return useQuery({
    queryKey: BLOCKS_KEY,
    queryFn: async () => {
      const { data } = await http.get<{ data: BlockedUserView[] }>('/conversations/blocks');
      return data.data;
    },
  });
}

export function useBlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => http.post(`/conversations/block/${userId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BLOCKS_KEY });
      void qc.invalidateQueries({ queryKey: qk.conversations('DIRECT') });
    },
  });
}

/** Optimistic — ເອົາອອກຈາກລາຍການທັນທີ, ຄືນຄ່າເກົ່າຖ້າລົ້ມເຫລວ. */
export function useUnblockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => http.delete(`/conversations/block/${userId}`),
    onMutate: async (userId) => {
      await qc.cancelQueries({ queryKey: BLOCKS_KEY });
      const prev = qc.getQueryData<BlockedUserView[]>(BLOCKS_KEY);
      qc.setQueryData<BlockedUserView[]>(BLOCKS_KEY, (list) => list?.filter((b) => b.userId !== userId));
      return { prev };
    },
    onError: (_err, _userId, ctx) => {
      if (ctx?.prev) qc.setQueryData(BLOCKS_KEY, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: BLOCKS_KEY });
      void qc.invalidateQueries({ queryKey: qk.conversations('DIRECT') });
    },
  });
}

/** `messageId` = ລາຍງານຂໍ້ຄວາມສະເພາະ (long-press), ບໍ່ມີ = ລາຍງານທັງຫ້ອງ. */
export function useReportConversation(threadId: string) {
  return useMutation({
    mutationFn: (input: { reason: string; messageId?: string }) =>
      http.post(`/conversations/${threadId}/report`, input),
  });
}

/** ອ່ານແຖວຫ້ອງຈາກ cache ຂອງ inbox (participants/isLocked/messageCount) — ບໍ່ມີ endpoint ດຶງຫ້ອງດຽວ,
 * ແລະ inbox ໂຫຼດກ່ອນເປີດຫ້ອງສະເໝີ. ຍັງຄົງ poll ຢູ່ ເພື່ອໃຫ້ lock ທີ່ admin ຕັ້ງລະຫວ່າງເປີດຫ້ອງສະທ້ອນເຂົ້າມາ. */
export function useDirectConversation(threadId: string): ConversationListItem | undefined {
  const list = useDirectConversations();
  return list.data?.find((c) => c.id === threadId);
}

/** `GET /conversations/:id/media` — ຈຳນວນຮູບ/ສຽງທັງຫ້ອງ + ຮູບລ່າສຸດ ສຳລັບ sheet ຂໍ້ມູນຫ້ອງ. */
export function useConversationMedia(threadId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['conversations', 'media', threadId] as const,
    queryFn: async () => {
      const { data } = await http.get<{ data: ConversationMediaSummary }>(`/conversations/${threadId}/media`, {
        params: { limit: 12 },
      });
      return data.data;
    },
    enabled,
  });
}
