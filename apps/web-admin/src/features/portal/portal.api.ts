import type {
  AnnouncementInput,
  AnnouncementPatch,
  AnnouncementView,
  ChecklistDay,
  ChecklistTaskKey,
  PortalSummary,
  SystemStatus,
} from '@abcp/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { http } from '@/services/http';

interface Envelope<T> {
  data: T;
}

export const portalKeys = {
  summary: (branchId: string) => ['portal', 'summary', branchId] as const,
  announcements: ['portal', 'announcements'] as const,
  manage: ['portal', 'announcements', 'manage'] as const,
  status: ['portal', 'system-status'] as const,
  checklist: (branchId: string) => ['portal', 'checklist', branchId] as const,
};

/** GET /portal/summary — every "needs me" count this user may see (missing key = no permission). */
export function usePortalSummary(branchId: string) {
  return useQuery({
    queryKey: portalKeys.summary(branchId),
    queryFn: async () =>
      (await http.get<Envelope<PortalSummary>>('/portal/summary', { params: { branchId } })).data.data,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
  });
}

export function useAnnouncements() {
  return useQuery({
    queryKey: portalKeys.announcements,
    queryFn: async () => (await http.get<Envelope<AnnouncementView[]>>('/portal/announcements')).data.data,
    refetchInterval: 5 * 60_000,
  });
}

export function useManageAnnouncements(enabled: boolean) {
  return useQuery({
    queryKey: portalKeys.manage,
    enabled,
    queryFn: async () =>
      (await http.get<Envelope<AnnouncementView[]>>('/portal/announcements/manage')).data.data,
  });
}

function useInvalidatePortal() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['portal'] });
}

export function useMarkAnnouncementRead() {
  const qc = useQueryClient();
  const invalidate = useInvalidatePortal();
  return useMutation({
    mutationFn: async (id: string) => (await http.post(`/portal/announcements/${id}/read`)).data,
    onMutate: (id) => {
      qc.setQueryData<AnnouncementView[]>(portalKeys.announcements, (rows) =>
        rows?.map((a) => (a.id === id ? { ...a, read: true } : a)),
      );
    },
    onSettled: invalidate,
  });
}

export function useMarkAllAnnouncementsRead() {
  const invalidate = useInvalidatePortal();
  return useMutation({
    mutationFn: async () => (await http.post('/portal/announcements/read-all')).data,
    onSettled: invalidate,
  });
}

export function useSaveAnnouncement() {
  const invalidate = useInvalidatePortal();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: AnnouncementInput | AnnouncementPatch }) =>
      id
        ? (await http.patch<Envelope<AnnouncementView>>(`/portal/announcements/${id}`, input)).data.data
        : (await http.post<Envelope<AnnouncementView>>('/portal/announcements', input)).data.data,
    onSuccess: invalidate,
  });
}

export function useDeleteAnnouncement() {
  const invalidate = useInvalidatePortal();
  return useMutation({
    mutationFn: async (id: string) => (await http.delete(`/portal/announcements/${id}`)).data,
    onSuccess: invalidate,
  });
}

export function useSystemStatus(enabled: boolean) {
  return useQuery({
    queryKey: portalKeys.status,
    enabled,
    queryFn: async () => (await http.get<Envelope<SystemStatus>>('/portal/system-status')).data.data,
    refetchInterval: 30_000,
  });
}

export function useChecklist(branchId: string) {
  return useQuery({
    queryKey: portalKeys.checklist(branchId),
    queryFn: async () =>
      (await http.get<Envelope<ChecklistDay>>('/portal/checklist', { params: { branchId } })).data.data,
    refetchInterval: 2 * 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useToggleChecklist(branchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, done }: { key: ChecklistTaskKey; done: boolean }) =>
      (await http.post<Envelope<ChecklistDay>>(`/portal/checklist/${key}`, { done, branchId })).data.data,
    onMutate: ({ key, done }) => {
      qc.setQueryData<ChecklistDay>(portalKeys.checklist(branchId), (day) =>
        day
          ? {
              ...day,
              tasks: day.tasks.map((t) =>
                t.key === key ? { ...t, ticked: done, done: t.autoDone || done } : t,
              ),
            }
          : day,
      );
    },
    onSuccess: (day) => qc.setQueryData(portalKeys.checklist(branchId), day),
    onError: () => void qc.invalidateQueries({ queryKey: portalKeys.checklist(branchId) }),
  });
}
