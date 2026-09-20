import type { JoinWaitlistInput, WaitlistEntryView } from '@abcp/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '../../services/http';
import { qk } from '../../services/queryKeys';

export function useMyWaitlist() {
  return useQuery({
    queryKey: qk.waitlist,
    queryFn: async () => {
      const { data } = await http.get<{ data: { items: WaitlistEntryView[] } }>('/waitlist/me');
      return data.data.items;
    },
  });
}

export function useJoinWaitlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: JoinWaitlistInput) => {
      const { data } = await http.post<{ data: WaitlistEntryView }>('/waitlist', input);
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.waitlist }),
  });
}

export function useLeaveWaitlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await http.delete(`/waitlist/${id}`);
      return id;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.waitlist }),
  });
}
