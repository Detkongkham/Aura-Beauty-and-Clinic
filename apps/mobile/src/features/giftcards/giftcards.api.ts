import type { GiftCardView, PurchaseGiftCardInput } from '@abcp/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '../../services/http';
import { qk } from '../../services/queryKeys';
import { newIdempotencyKey } from '../../lib/idempotency';

export function useMyGiftCards() {
  return useQuery({
    queryKey: qk.giftCards,
    queryFn: async () => {
      const { data } = await http.get<{ data: { items: GiftCardView[] } }>('/gift-cards/me');
      return data.data.items;
    },
  });
}

/**
 * Wave 10A (ອຸດ C1) — ບໍ່ອອກບັດໃຫ້ທັນທີອີກຕໍ່ໄປ. ຄືນ card ສະຖານະ PENDING_PAYMENT ພ້ອມ
 * `purchasePaymentId` — ໜ້າຈໍຕ້ອງພາລູກຄ້າໄປຈ່າຍຜ່ານ payments flow (deposit-intent/tenders)
 * ໂດຍໃຊ້ `purchasePaymentId` ນັ້ນ, ບັດຈະ activate ອັດຕະໂນມັດເມື່ອຈ່າຍຄົບ.
 */
export function usePurchaseGiftCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PurchaseGiftCardInput) => {
      const { data } = await http.post<{ data: GiftCardView }>('/gift-cards/purchase', input, {
        headers: { 'Idempotency-Key': newIdempotencyKey() },
      });
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.giftCards }),
  });
}

/**
 * ຄົ້ນຫາບັດດ້ວຍລະຫັດ — ນີ້ແມ່ນ endpoint ດຽວທີ່ຄືນ `transactions` (ledger ການໃຊ້ຈ່າຍ),
 * ຂະນະທີ່ GET /gift-cards/me ຄືນສະເພາະຍອດ. ໜ້າ GiftCards ຈຶ່ງເອີ້ນອັນນີ້ຕອນເປີດ
 * ແຜ່ນລາຍລະອຽດ ເພື່ອສະແດງປະຫວັດການໃຊ້ຂອງບັດໃບນັ້ນ.
 */
export function useGiftCardDetail(code: string | null) {
  return useQuery({
    queryKey: qk.giftCardLookup(code ?? ''),
    enabled: Boolean(code),
    retry: false,
    queryFn: () => lookupGiftCard(code!),
  });
}

export async function lookupGiftCard(code: string): Promise<GiftCardView> {
  const { data } = await http.get<{ data: GiftCardView }>('/gift-cards/lookup', {
    params: { code },
  });
  return data.data;
}
