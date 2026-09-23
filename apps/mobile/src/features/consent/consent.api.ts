import type { ConsentPreferencesView, LineLinkCodeView, UpdateConsentInput } from '@abcp/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '../../services/http';
import { qk } from '../../services/queryKeys';

/** Wave 10G — ຄວາມຍິນຍອມການຕະຫຼາດຂອງຕົນເອງ (opt-in, ຖອນໄດ້ທຸກເວລາ). */
export function useConsentPreferences() {
  return useQuery({
    queryKey: qk.consent,
    queryFn: async () => {
      const { data } = await http.get<{ data: ConsentPreferencesView }>('/consent/me');
      return data.data;
    },
  });
}

export function useUpdateConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateConsentInput) => {
      const { data } = await http.put<{ data: ConsentPreferencesView }>('/consent/me', input);
      return data.data;
    },
    onSuccess: (data) => qc.setQueryData(qk.consent, data),
  });
}

/** ຂໍ້ຈຳກັດ 10G — ລະຫັດຜູກ LINE: ລູກຄ້າສົ່ງລະຫັດນີ້ເປັນຂໍ້ຄວາມໃຫ້ LINE OA ຂອງຮ້ານ. */
export function useLineLinkCode() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await http.post<{ data: LineLinkCodeView }>('/consent/me/line-link');
      return data.data;
    },
  });
}
