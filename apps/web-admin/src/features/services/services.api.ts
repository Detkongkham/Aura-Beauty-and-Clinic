import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { http } from '@/services/http';
import { queryKeys } from '@/services/queryKeys';
import type { Paginated, Service, ServiceCategory } from '@/types/models';

interface Envelope<T> {
  data: T;
}

export interface ServiceStats {
  total: number;
  active: number;
  inactive: number;
  withDeposit: number;
  avgPrice: number;
  avgDuration: number;
  byCategory: { id: string; name: string; count: number }[];
}

export interface ServiceListParams {
  q?: string;
  categoryId?: string;
  isActive?: 'true' | 'false';
  page: number;
  pageSize: number;
}

export type ServiceInput = Partial<
  Pick<
    Service,
    | 'categoryId'
    | 'branchId'
    | 'name'
    | 'description'
    | 'price'
    | 'compareAtPrice'
    | 'durationMinutes'
    | 'imageUrl'
    | 'highlights'
    | 'requireDeposit'
    | 'depositAmount'
    | 'isActive'
  > & { consumables: Pick<Service['consumables'][number], 'productId' | 'productName' | 'qtyPerUse' | 'unit'>[] }
>;

export const servicesApi = {
  async list(params: ServiceListParams): Promise<Paginated<Service>> {
    const { data } = await http.get<Envelope<Paginated<Service>>>('/services', { params });
    return data.data;
  },
  async get(id: string): Promise<Service> {
    const { data } = await http.get<Envelope<Service>>(`/services/${id}`);
    return data.data;
  },
  async stats(): Promise<ServiceStats> {
    const { data } = await http.get<Envelope<ServiceStats>>('/services/stats');
    return data.data;
  },
  async create(input: ServiceInput): Promise<Service> {
    const { data } = await http.post<Envelope<Service>>('/services', input);
    return data.data;
  },
  async update(id: string, input: ServiceInput): Promise<Service> {
    const { data } = await http.patch<Envelope<Service>>(`/services/${id}`, input);
    return data.data;
  },
  async remove(id: string): Promise<void> {
    await http.delete(`/services/${id}`);
  },
  async categories(): Promise<ServiceCategory[]> {
    const { data } = await http.get<Envelope<{ items: ServiceCategory[] }>>('/service-categories');
    return data.data.items;
  },
  async createCategory(input: { name: string }): Promise<ServiceCategory> {
    const { data } = await http.post<Envelope<ServiceCategory>>('/service-categories', input);
    return data.data;
  },
  async updateCategory(id: string, input: { name: string }): Promise<ServiceCategory> {
    const { data } = await http.patch<Envelope<ServiceCategory>>(
      `/service-categories/${id}`,
      input,
    );
    return data.data;
  },
  async removeCategory(id: string): Promise<void> {
    await http.delete(`/service-categories/${id}`);
  },
};

export function useServices(params: ServiceListParams) {
  return useQuery({
    queryKey: queryKeys.services.list(params),
    queryFn: () => servicesApi.list(params),
  });
}

export function useServiceStats() {
  return useQuery({ queryKey: ['services', 'stats'], queryFn: servicesApi.stats });
}

export function useService(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.services.detail(id ?? ''),
    queryFn: () => servicesApi.get(id!),
    enabled: Boolean(id),
  });
}

export function useServiceCategories() {
  return useQuery({ queryKey: ['service-categories'], queryFn: servicesApi.categories });
}

export function useSaveService(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ServiceInput) =>
      id ? servicesApi.update(id, input) : servicesApi.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['services'] });
      void qc.invalidateQueries({ queryKey: ['service-categories'] });
    },
  });
}

export function useDeleteService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => servicesApi.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['services'] });
      void qc.invalidateQueries({ queryKey: ['service-categories'] });
    },
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: servicesApi.createCategory,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['service-categories'] }),
  });
}

export function useSaveCategory(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) =>
      id ? servicesApi.updateCategory(id, input) : servicesApi.createCategory(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['service-categories'] });
      void qc.invalidateQueries({ queryKey: ['services'] });
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => servicesApi.removeCategory(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['service-categories'] });
      void qc.invalidateQueries({ queryKey: ['services'] });
    },
  });
}
