import type {
  MyAffiliateView,
  MyReferralView,
  Paginated,
  PriceQuoteView,
  ReferralUsageView,
} from '@abcp/shared-types';
import { useQuery } from '@tanstack/react-query';
import { http } from '../../services/http';
import { qk } from '../../services/queryKeys';

/** ໂມດູນ 33 — ລະຫັດແນະນຳໝູ່ຂອງຕົນເອງ + ສະຖິຕິ. */
export function useMyReferral() {
  return useQuery({
    queryKey: qk.referral,
    queryFn: async () => {
      const { data } = await http.get<{ data: MyReferralView }>('/referral/me');
      return data.data;
    },
  });
}

/**
 * ລາຍຊື່ໝູ່ທີ່ໃຊ້ລະຫັດແລ້ວ (GET /referral/me/usages) — ມີຢູ່ຝັ່ງ backend ມາແຕ່ 7A ແຕ່
 * mobile ຍັງບໍ່ເຄີຍໃຊ້. ໜ້າ Referral ໃຊ້ໜ້າທຳອິດ (20 ລາຍການ) ເປັນ activity feed.
 */
export function useMyReferralUsages(pageSize = 20) {
  return useQuery({
    queryKey: qk.referralUsages,
    queryFn: async () => {
      const { data } = await http.get<{ data: Paginated<ReferralUsageView> }>('/referral/me/usages', {
        params: { page: 1, pageSize },
      });
      return data.data;
    },
  });
}

/**
 * Dashboard ຂອງ affiliate ເອງ (GET /affiliate/me) — ຄືນ 404 ຖ້າບັນຊີບໍ່ແມ່ນ affiliate,
 * ສະນັ້ນ ເປີດ query ນີ້ສະເພາະເມື່ອ `MyReferralView.isAffiliate === true`.
 */
export function useMyAffiliate(enabled: boolean) {
  return useQuery({
    queryKey: qk.affiliate,
    enabled,
    retry: false,
    queryFn: async () => {
      const { data } = await http.get<{ data: MyAffiliateView }>('/affiliate/me');
      return data.data;
    },
  });
}

/** ໂມດູນ 28 — ລາຄາຈິງຫຼັງ dynamic-pricing ສຳລັບບໍລິການ+ເວລານັດ. */
export function usePriceQuote(
  params: { branchId: string; serviceId: string; at?: string },
  enabled: boolean,
) {
  return useQuery({
    queryKey: qk.priceQuote(params),
    enabled: enabled && Boolean(params.branchId && params.serviceId),
    queryFn: async () => {
      const { data } = await http.get<{ data: PriceQuoteView }>('/pricing/quote', {
        params: {
          branchId: params.branchId,
          serviceId: params.serviceId,
          ...(params.at ? { at: params.at } : {}),
        },
      });
      return data.data;
    },
  });
}
