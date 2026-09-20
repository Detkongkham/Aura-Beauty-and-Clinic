import type {
  Paginated,
  ServiceCategoryView,
  ServiceBranchInfo,
  ServiceDetailView,
  ServiceListItem,
  StaffListItem,
  StaffListQuery,
} from '@abcp/shared-types';
import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query';
import { http } from '../../services/http';
import { qk } from '../../services/queryKeys';

const PAGE_SIZE = 12;

export function useCategories() {
  return useQuery({
    queryKey: qk.categories,
    queryFn: async () => {
      const { data } = await http.get<{ data: ServiceCategoryView[] }>('/catalog/categories');
      return data.data;
    },
  });
}

type ServiceFilters = {
  branchId?: string;
  categoryId?: string;
  q?: string;
  popular?: boolean;
  sort?: 'popular' | 'name' | 'priceAsc' | 'priceDesc';
  priceMin?: number;
  priceMax?: number;
  durationMax?: number;
  requireDeposit?: boolean;
};

export function useServices(filters: ServiceFilters) {
  return useInfiniteQuery({
    queryKey: qk.services(filters),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { data } = await http.get<{ data: Paginated<ServiceListItem> }>('/catalog/services', {
        params: { ...filters, page: pageParam, pageSize: PAGE_SIZE },
      });
      return data.data;
    },
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });
}

/** `branchId` = ສາຂາທີ່ກຳລັງເບິ່ງ — backend ໃຊ້ເປັນບັດສະຖານທີ່ ເມື່ອບໍລິການເປີດທຸກສາຂາ. */
export function useService(id: string, branchId?: string) {
  return useQuery({
    queryKey: qk.service(id),
    queryFn: async () => {
      const { data } = await http.get<{ data: ServiceDetailView }>(`/catalog/services/${id}`, {
        params: branchId ? { branchId } : undefined,
      });
      return data.data;
    },
  });
}

/**
 * ບໍລິການທີ່ບັນທຶກໄວ້ (favorites local) — ໃຊ້ cache ດຽວກັບໜ້າລາຍລະອຽດ (`qk.service`).
 * ຈຳກັດ `limit` ລາຍການ; ລາຍການທີ່ຖືກລຶບ/404 ຈະຖືກຂ້າມ.
 */
export function useSavedServices(ids: string[], branchId?: string, limit = 6): ServiceListItem[] {
  const results = useQueries({
    queries: ids.slice(0, limit).map((id) => ({
      queryKey: qk.service(id),
      queryFn: async () => {
        const { data } = await http.get<{ data: ServiceDetailView }>(`/catalog/services/${id}`, {
          params: branchId ? { branchId } : undefined,
        });
        return data.data;
      },
      retry: false,
    })),
  });
  return results.flatMap((r) => (r.data && r.data.isActive ? [r.data] : []));
}

/** ຂໍ້ມູນສາຂາ (ຊື່/ທີ່ຢູ່/ເບີ/ເວລາເປີດ/ພິກັດ) — ປ່ຽນບໍ່ເລື້ອຍ → cache 30 ນາທີ. */
export function useBranch(branchId: string | null | undefined) {
  return useQuery({
    queryKey: qk.branch(branchId ?? ''),
    enabled: !!branchId,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data } = await http.get<{ data: ServiceBranchInfo }>(`/catalog/branches/${branchId}`);
      return data.data;
    },
  });
}

export function useStaff(params: StaffListQuery, enabled = true) {
  return useQuery({
    queryKey: qk.staff(params),
    enabled,
    queryFn: async () => {
      const { data } = await http.get<{ data: StaffListItem[] }>('/staff', { params });
      return data.data;
    },
  });
}
