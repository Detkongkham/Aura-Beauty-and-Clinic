import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { http } from '@/services/http';
import type { QueueCancelReason, QueueSummary, QueueTicket } from '@/types/models';

interface Envelope<T> {
  data: T;
}

export type QueueStatus = 'WAITING' | 'CALLED' | 'IN_SERVICE' | 'COMPLETED' | 'CANCELLED';

export interface WalkInInput {
  branchId: string;
  customerName: string;
  customerPhone?: string;
  serviceId: string;
  staffId?: string;
  priority?: 'NORMAL' | 'VIP';
  note?: string;
}

export interface QueueDetailsInput {
  priority?: 'NORMAL' | 'VIP';
  note?: string | null;
  staffProfileId?: string;
}

export interface QueueListResult {
  items: QueueTicket[];
  summary: QueueSummary | null;
}

export const queueApi = {
  async list(branchId: string | 'all'): Promise<QueueListResult> {
    const { data } = await http.get<Envelope<{ items: QueueTicket[]; summary?: QueueSummary }>>(
      '/queue',
      { params: { branchId } },
    );
    return { items: data.data.items, summary: data.data.summary ?? null };
  },
  async setStatus(id: string, status: QueueStatus, reason?: QueueCancelReason): Promise<QueueTicket> {
    const { data } = await http.patch<Envelope<QueueTicket>>(`/queue/${id}`, { status, reason });
    return data.data;
  },
  async recall(id: string): Promise<QueueTicket> {
    const { data } = await http.post<Envelope<QueueTicket>>(`/queue/${id}/recall`);
    return data.data;
  },
  async updateDetails(id: string, input: QueueDetailsInput): Promise<QueueTicket> {
    const { data } = await http.patch<Envelope<QueueTicket>>(`/queue/${id}/details`, input);
    return data.data;
  },
  async clearStale(branchId: string | 'all'): Promise<{ cleared: number }> {
    const { data } = await http.post<Envelope<{ cleared: number }>>('/queue/clear-stale', {
      branchId,
    });
    return data.data;
  },
  async walkIn(input: WalkInInput): Promise<{ ticket: QueueTicket }> {
    const { data } = await http.post<Envelope<{ ticket: QueueTicket }>>(
      '/appointments/walk-in',
      input,
    );
    return data.data;
  },
};

export function useQueue(branchId: string | 'all', paused = false) {
  return useQuery({
    queryKey: ['queue', branchId],
    queryFn: () => queueApi.list(branchId),
    refetchInterval: paused ? false : 15_000,
  });
}

function useInvalidateQueue() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['queue'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['appointments'] });
  };
}

export function useSetTicketStatus() {
  const invalidate = useInvalidateQueue();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: QueueStatus; reason?: QueueCancelReason }) =>
      queueApi.setStatus(id, status, reason),
    onSuccess: invalidate,
  });
}

export function useRecallTicket() {
  const invalidate = useInvalidateQueue();
  return useMutation({ mutationFn: (id: string) => queueApi.recall(id), onSuccess: invalidate });
}

export function useUpdateTicketDetails() {
  const invalidate = useInvalidateQueue();
  return useMutation({
    mutationFn: ({ id, ...input }: QueueDetailsInput & { id: string }) =>
      queueApi.updateDetails(id, input),
    onSuccess: invalidate,
  });
}

export function useClearStaleTickets() {
  const invalidate = useInvalidateQueue();
  return useMutation({ mutationFn: queueApi.clearStale, onSuccess: invalidate });
}

export function useCreateWalkIn() {
  const invalidate = useInvalidateQueue();
  return useMutation({ mutationFn: queueApi.walkIn, onSuccess: invalidate });
}

/**
 * Topbar variant — same cache entry as `useQueue` (so the Queue page and the
 * chrome never disagree), just a slower poll. React Query takes the *shortest*
 * interval of the mounted observers, so opening /queue still refreshes at 15s
 * while every other page costs one small request a minute.
 */
export function useQueuePulse(branchId: string | 'all') {
  return useQuery({
    queryKey: ['queue', branchId],
    queryFn: () => queueApi.list(branchId),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });
}
