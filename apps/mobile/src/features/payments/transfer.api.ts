import type {
  PaymentBankAccountView,
  PaymentSlipEvent,
  PaymentSlipView,
  PaymentView,
  ReviewSlipInput,
  SlipContentType,
  SlipVerdict,
  Paginated,
} from '@abcp/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { newIdempotencyKey } from '../../lib/idempotency';
import { http } from '../../services/http';
import { qk } from '../../services/queryKeys';
import { connectAppSocket } from '../../services/socket';
import { useAuthStore } from '../../store/auth.store';

/** ສະລິບທີ່ຍັງລໍຜົນ OCR / ລໍພະນັກງານກວດ — ຍັງບໍ່ຈົບ. */
export const OPEN_VERDICTS: readonly SlipVerdict[] = ['PENDING', 'AUTO_MATCHED', 'NEEDS_REVIEW'];
const isOpen = (s: PaymentSlipView): boolean => OPEN_VERDICTS.includes(s.verdict);

// ---- ລູກຄ້າ: ໂອນເງິນ + ອັບສະລິບ -------------------------------------------

/** ບິນດຽວ (ໃຊ້ໃນໜ້າຊື້ບັດ/ແພັກເກັດທີ່ບໍ່ມີ appointmentId). */
export function usePaymentById(paymentId: string) {
  return useQuery({
    queryKey: qk.paymentById(paymentId),
    queryFn: async () => {
      const { data } = await http.get<{ data: PaymentView }>(`/payments/${paymentId}`);
      return data.data;
    },
  });
}

/** ບັນຊີຮັບເງິນ ACTIVE ຂອງສາຂາທີ່ອອກບິນ. */
export function usePaymentBankAccounts(paymentId: string) {
  return useQuery({
    queryKey: qk.paymentBankAccounts(paymentId),
    queryFn: async () => {
      const { data } = await http.get<{ data: PaymentBankAccountView[] }>(
        `/payments-treasury/payments/${paymentId}/bank-accounts`,
      );
      return data.data;
    },
  });
}

/**
 * ສະລິບຂອງບິນ + ສະຖານະສົດ. ຜົນ OCR/ການກວດມາທາງ socket `payment-slip:updated` (ຫ້ອງ user ຂອງຜູ້ອັບ);
 * ຖ້າ socket ຫຼຸດ ກໍ poll ທຸກ 8 ວິ ຕາບໃດທີ່ຍັງມີສະລິບຄ້າງ. ຜົນອະນຸມັດຍັງ refresh ບິນນຳ.
 */
export function usePaymentSlips(paymentId: string) {
  const qc = useQueryClient();

  useEffect(() => {
    const socket = connectAppSocket();
    const onUpdated = (e: PaymentSlipEvent): void => {
      if (e.paymentId !== paymentId) return;
      void qc.invalidateQueries({ queryKey: qk.paymentSlips(paymentId) });
      if (e.verdict === 'APPROVED') {
        void qc.invalidateQueries({ queryKey: qk.paymentById(paymentId) });
        void qc.invalidateQueries({ queryKey: ['appointments', 'me'] });
      }
    };
    socket.on('payment-slip:updated', onUpdated);
    return () => {
      socket.off('payment-slip:updated', onUpdated);
      socket.disconnect();
    };
  }, [paymentId, qc]);

  return useQuery({
    queryKey: qk.paymentSlips(paymentId),
    queryFn: async () => {
      const { data } = await http.get<{ data: PaymentSlipView[] }>(
        `/payments-treasury/payments/${paymentId}/slips`,
      );
      return data.data;
    },
    refetchInterval: (query) => (query.state.data?.some(isOpen) ? 8000 : false),
  });
}

export type UploadSlipArgs = {
  contentType: SlipContentType;
  dataBase64: string;
  bankAccountId?: string;
  amount?: number;
};

export function useUploadSlip(paymentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: UploadSlipArgs) => {
      const { data } = await http.post<{ data: PaymentSlipView }>(
        `/payments-treasury/payments/${paymentId}/slips`,
        args,
        { headers: { 'Idempotency-Key': newIdempotencyKey() }, timeout: 60_000 },
      );
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.paymentSlips(paymentId) }),
  });
}

// ---- ພະນັກງານ: ກວດສະລິບ -----------------------------------------------

/** ພະນັກງານມີສິດ `payments:review` ບໍ (ຄ່າສິດຢູ່ໃນ session ຕອນ login). */
export function useCanReviewSlips(): boolean {
  return useAuthStore((s) => s.user?.permissions.includes('payments:review') ?? false);
}

export type SlipInboxGroup = 'review' | 'done';
const GROUP_VERDICTS: Record<SlipInboxGroup, readonly SlipVerdict[]> = {
  review: ['PENDING', 'NEEDS_REVIEW', 'AUTO_MATCHED', 'DUPLICATE'],
  done: ['APPROVED', 'REJECTED'],
};

/** backend ກອງ verdict ໄດ້ເທື່ອລະຄ່າ — ດຶງຂະໜານແລ້ວລວມ, ໃໝ່ສຸດກ່ອນ. */
export function useSlipInbox(group: SlipInboxGroup, enabled = true) {
  return useQuery({
    queryKey: qk.slipInbox(group),
    enabled,
    refetchInterval: group === 'review' ? 30_000 : false,
    queryFn: async () => {
      const pages = await Promise.all(
        GROUP_VERDICTS[group].map((verdict) =>
          http
            .get<{ data: Paginated<PaymentSlipView> }>('/payments-treasury/slips', {
              params: { verdict, pageSize: group === 'review' ? 50 : 25 },
            })
            .then((r) => r.data.data.items),
        ),
      );
      return pages.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  });
}

/** ຕົວເລກ badge = ຈຳນວນສະລິບທີ່ພະນັກງານຍັງຕ້ອງກວດ (ບໍ່ນັບ PENDING = OCR ຍັງແລ່ນ). */
export function actionableCount(items: PaymentSlipView[] | undefined): number {
  return items?.filter((s) => s.verdict === 'AUTO_MATCHED' || s.verdict === 'NEEDS_REVIEW').length ?? 0;
}

/** ຕິດ socket ຫ້ອງກວດສະລິບ — ມີສະລິບໃໝ່/ປ່ຽນສະຖານະ → refetch inbox. ໃຊ້ໜ້າດຽວທີ່ຄ້າງຢູ່ (Today). */
export function useSlipReviewLive(enabled: boolean): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const socket = connectAppSocket();
    const join = (): void => void socket.emit('join-slip-review');
    socket.on('connect', join);
    const onUpdated = (): void => void qc.invalidateQueries({ queryKey: ['payment-slips'] });
    socket.on('payment-slip:updated', onUpdated);
    return () => {
      socket.off('connect', join);
      socket.off('payment-slip:updated', onUpdated);
      socket.emit('leave-slip-review');
      socket.disconnect();
    };
  }, [enabled, qc]);
}

export function useSlip(slipId: string) {
  return useQuery({
    queryKey: ['payment-slips', 'one', slipId] as const,
    queryFn: async () => {
      const { data } = await http.get<{ data: PaymentSlipView }>(`/payments-treasury/slips/${slipId}`);
      return data.data;
    },
    // OCR ຍັງແລ່ນຢູ່ → poll ຈົນກວ່າຈະໄດ້ຜົນ
    refetchInterval: (query) => (query.state.data?.verdict === 'PENDING' ? 3000 : false),
  });
}

export function useReviewSlip(slipId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ReviewSlipInput) => {
      const { data } = await http.post<{ data: PaymentSlipView }>(
        `/payments-treasury/slips/${slipId}/review`,
        body,
        { headers: { 'Idempotency-Key': newIdempotencyKey() } },
      );
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['payment-slips'] }),
  });
}
