import type { TelegramLinkCodeView } from '@abcp/shared-types';
import { useMutation } from '@tanstack/react-query';
import { http } from '../../services/http';

/** ໂມດູນ 35 — ອອກລະຫັດຜູກ Telegram (ໃຊ້ຄັ້ງດຽວ, ໝົດອາຍຸ 15 ນາທີ). */
export function useGenerateTelegramLinkCode() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await http.post<{ data: TelegramLinkCodeView }>('/chatbot/telegram/link-code');
      return data.data;
    },
  });
}
