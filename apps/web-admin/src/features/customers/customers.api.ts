import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { http } from '@/services/http';
import { queryKeys } from '@/services/queryKeys';
import type { AppointmentListItem, Customer, Paginated } from '@/types/models';

interface Envelope<T> {
  data: T;
}

export interface CustomerListParams {
  q?: string;
  tier?: string;
  page: number;
  pageSize: number;
}

export type CustomerDetail = Customer & { history: AppointmentListItem[] };

export const customersApi = {
  async list(params: CustomerListParams): Promise<Paginated<Customer>> {
    const { data } = await http.get<Envelope<Paginated<Customer>>>('/customers', { params });
    return data.data;
  },
  async get(id: string): Promise<CustomerDetail> {
    const { data } = await http.get<Envelope<CustomerDetail>>(`/customers/${id}`);
    return data.data;
  },
  async create(input: Partial<Customer>): Promise<Customer> {
    const { data } = await http.post<Envelope<Customer>>('/customers', input);
    return data.data;
  },
  async update(id: string, patch: Partial<Customer>): Promise<Customer> {
    const { data } = await http.patch<Envelope<Customer>>(`/customers/${id}`, patch);
    return data.data;
  },
};

export function useCustomers(params: CustomerListParams) {
  return useQuery({
    queryKey: queryKeys.customers.list(params),
    queryFn: () => customersApi.list(params),
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customers.detail(id ?? ''),
    queryFn: () => customersApi.get(id!),
    enabled: Boolean(id),
  });
}

export function useSaveCustomer(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<Customer>) =>
      id ? customersApi.update(id, input) : customersApi.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}
