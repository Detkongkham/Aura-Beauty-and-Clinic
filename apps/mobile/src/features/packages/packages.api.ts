import type {
  PackagePurchaseView,
  PackageView,
  UserPackageUsageView,
  UserPackageView,
} from '@abcp/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { newIdempotencyKey } from '../../lib/idempotency';
import { http } from '../../services/http';
import { qk } from '../../services/queryKeys';

/** ແພັກເກັດທີ່ເປີດຂາຍ (?serviceId = ສະເພາະທີ່ມີບໍລິການນີ້). */
export function usePackages(params: { branchId?: string; serviceId?: string }) {
  return useQuery({
    queryKey: qk.packages(params),
    queryFn: async () => {
      const { data } = await http.get<{ data: PackageView[] }>('/packages', { params });
      return data.data;
    },
  });
}

export function usePackage(id: string) {
  return useQuery({
    queryKey: qk.package(id),
    queryFn: async () => {
      const { data } = await http.get<{ data: PackageView }>(`/packages/${id}`);
      return data.data;
    },
  });
}

export function useMyPackages(enabled = true) {
  return useQuery({
    queryKey: qk.myPackages,
    enabled,
    queryFn: async () => {
      const { data } = await http.get<{ data: UserPackageView[] }>('/packages/me');
      return data.data;
    },
  });
}

/** ປະຫວັດການໃຊ້ສິດຂອງແພັກເກັດ — ໂຫລດຕອນຜູ້ໃຊ້ກາງອອກເບິ່ງເທົ່ານັ້ນ. */
export function usePackageUsage(userPackageId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.packageUsage(userPackageId),
    enabled,
    queryFn: async () => {
      const { data } = await http.get<{ data: UserPackageUsageView[] }>(
        `/packages/me/${userPackageId}/usage`,
      );
      return data.data;
    },
  });
}

/** ສ້າງບິນຊື້ — server ຄືນບິນເກົ່າຖ້າມີລາຍການຄ້າງຈ່າຍຂອງແພັກເກັດດຽວກັນ. */
export function usePurchasePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (packageId: string) => {
      const { data } = await http.post<{ data: PackagePurchaseView }>(
        `/packages/${packageId}/purchase`,
        {},
        { headers: { 'Idempotency-Key': newIdempotencyKey() } },
      );
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.myPackages }),
  });
}

export function useCancelPendingPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userPackageId: string) => {
      await http.delete(`/packages/me/${userPackageId}`);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.myPackages }),
  });
}

/** ສິດຈອງທີ່ໃຊ້ໄດ້ຂອງບໍລິການໜຶ່ງ — ACTIVE, ບໍ່ໝົດອາຍຸ, ຍັງເຫຼືອ; ໃກ້ໝົດອາຍຸກ່ອນ. */
export function findRedeemable(
  mine: UserPackageView[] | undefined,
  serviceId: string,
): { userPackage: UserPackageView; item: UserPackageView['items'][number] } | null {
  const candidates = (mine ?? [])
    .filter((u) => u.status === 'ACTIVE' && !u.expired)
    .flatMap((u) =>
      u.items
        .filter((i) => i.serviceId === serviceId && i.remainingUnits > 0)
        .map((item) => ({ userPackage: u, item })),
    )
    .sort((a, b) => a.userPackage.expireDate.localeCompare(b.userPackage.expireDate));
  return candidates[0] ?? null;
}
