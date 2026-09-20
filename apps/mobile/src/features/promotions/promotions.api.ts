import type { PromotionView } from '@abcp/shared-types';
import { useQuery } from '@tanstack/react-query';
import { http } from '../../services/http';
import { qk } from '../../services/queryKeys';

/** `GET /pricing/promotions` — Happy Hour (DynamicPricingRule) + ບໍລິການຫຼຸດລາຄາ. ຂໍ້ມູນຈິງທີ່ມີຜົນຕອນຈ່າຍ. */
export function usePromotions(branchId: string) {
  return useQuery({
    queryKey: qk.promotions(branchId),
    enabled: Boolean(branchId),
    queryFn: async () => {
      const { data } = await http.get<{ data: PromotionView[] }>('/pricing/promotions', {
        params: { branchId, limit: 8 },
      });
      return data.data;
    },
    // liveNow ປ່ຽນຕາມເວລາ — refresh ທຸກ 5 ນາທີ.
    refetchInterval: 5 * 60_000,
  });
}
