import type {
  ChatMessageView,
  ChatThreadView,
  Paginated,
  SendChatMediaInput,
} from '@abcp/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '../../services/http';
import { qk } from '../../services/queryKeys';

/** ໂມດູນ 21 — In-App Chat. `useChatThread` ensure ໃຫ້ນັດໝາຍນີ້ມີ thread (lazy-created ຝັ່ງ backend). */
export function useChatThread(appointmentId: string) {
  return useQuery({
    queryKey: qk.chatThread(appointmentId),
    queryFn: async () => {
      const { data } = await http.get<{ data: ChatThreadView }>(
        `/chat/appointments/${appointmentId}/thread`,
      );
      return data.data;
    },
    enabled: Boolean(appointmentId),
  });
}

/** REST fallback — history ໂຫຼດຄັ້ງທຳອິດ, ຂໍ້ຄວາມໃໝ່ຫຼັງຈາກນັ້ນມາຈາກ socket (`chat:message`). */
export function useChatMessages(threadId: string | undefined) {
  return useQuery({
    queryKey: qk.chatMessages(threadId ?? ''),
    queryFn: async () => {
      const { data } = await http.get<{ data: Paginated<ChatMessageView> }>(
        `/chat/threads/${threadId}/messages`,
        { params: { page: 1, pageSize: 100, latest: true } },
      );
      return data.data.items;
    },
    enabled: Boolean(threadId),
  });
}

/** REST fallback ສົ່ງ — socket ເປັນທາງຫຼັກ, ນີ້ຄຸ້ມກໍລະນີ socket ຍັງບໍ່ທັນເຊື່ອມຕໍ່. */
export function useSendChatMessage(threadId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const { data } = await http.post<{ data: ChatMessageView }>(
        `/chat/threads/${threadId}/messages`,
        { body },
      );
      return data.data;
    },
    onSuccess: (message) => {
      qc.setQueryData<ChatMessageView[]>(qk.chatMessages(threadId ?? ''), (prev) =>
        prev?.some((m) => m.id === message.id) ? prev : [...(prev ?? []), message],
      );
    },
  });
}

/** ຮູບ/ຂໍ້ຄວາມສຽງ — ຄືກັນກັບ `useSendChatMessage` ແຕ່ໄປ `/media` (base64 JSON, ບໍ່ຜ່ານ socket). */
export function useSendChatMedia(threadId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SendChatMediaInput) => {
      const { data } = await http.post<{ data: ChatMessageView }>(
        `/chat/threads/${threadId}/media`,
        input,
      );
      return data.data;
    },
    onSuccess: (message) => {
      qc.setQueryData<ChatMessageView[]>(qk.chatMessages(threadId ?? ''), (prev) =>
        prev?.some((m) => m.id === message.id) ? prev : [...(prev ?? []), message],
      );
    },
  });
}
