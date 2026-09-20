import type { AdminStaffView, ConversationListItem, Paginated } from '@abcp/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '../../services/http';
import { qk } from '../../services/queryKeys';

/** `GET /staff?page=` — admin-shaped view (ມີ `userId`), ໃຊ້ເປັນ directory ເລືອກຄົນເລີ່ມແຊັດ. ບໍ່ມີ
 * roleGuard, ໃຊ້ໄດ້ຈາກ authGuard ໃດກໍ່ໄດ້ (ຄືກັນກັບ web-admin ໜ້າ Staff). */
export function useStaffDirectory(q: string, pageSize = 50) {
  return useQuery({
    queryKey: ['staff', 'directory', q, pageSize] as const,
    queryFn: async () => {
      const { data } = await http.get<{ data: Paginated<AdminStaffView> }>('/staff', {
        params: { page: 1, pageSize, q },
      });
      return data.data.items;
    },
  });
}

/** ໂມດູນ 38 Wave 8B — STAFF_INTERNAL conversations, ຄືກັນກັບ web-admin `messaging.api.ts`. */
export function useConversations(type: 'STAFF_INTERNAL' = 'STAFF_INTERNAL') {
  return useQuery({
    queryKey: qk.conversations(type),
    queryFn: async () => {
      const { data } = await http.get<{ data: ConversationListItem[] }>('/conversations', {
        params: { type },
      });
      return data.data;
    },
    refetchInterval: 20_000,
  });
}

export function useCreateStaffConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (participantIds: string[]) => {
      const { data } = await http.post<{ data: ConversationListItem }>('/conversations', {
        type: 'STAFF_INTERNAL',
        participantIds,
      });
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.conversations('STAFF_INTERNAL') });
    },
  });
}
