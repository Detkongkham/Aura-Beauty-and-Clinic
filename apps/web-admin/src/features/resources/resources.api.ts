import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateEquipmentInput,
  CreateRoomInput,
  EquipmentView,
  RoomView,
  UpdateEquipmentInput,
  UpdateRoomInput,
} from '@abcp/shared-types';

import { http } from '@/services/http';

interface Envelope<T> {
  data: T;
}

export interface ResourceFilters {
  branchId?: string;
}

const clean = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));

const ROOMS_KEY = ['resources', 'rooms'];
const EQUIPMENT_KEY = ['resources', 'equipment'];

export function useRooms(f: ResourceFilters) {
  return useQuery({
    queryKey: [...ROOMS_KEY, f],
    queryFn: async () => {
      const { data } = await http.get<Envelope<RoomView[]>>('/resources/rooms', {
        params: clean({ branchId: f.branchId }),
      });
      return data.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useCreateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateRoomInput) => {
      const { data } = await http.post<Envelope<RoomView>>('/resources/rooms', input);
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ROOMS_KEY }),
  });
}

export function useUpdateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateRoomInput }) => {
      const { data } = await http.patch<Envelope<RoomView>>(`/resources/rooms/${id}`, input);
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ROOMS_KEY }),
  });
}

export function useDeleteRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await http.delete(`/resources/rooms/${id}`);
      return id;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ROOMS_KEY }),
  });
}

export function useEquipmentList(f: ResourceFilters) {
  return useQuery({
    queryKey: [...EQUIPMENT_KEY, f],
    queryFn: async () => {
      const { data } = await http.get<Envelope<EquipmentView[]>>('/resources/equipment', {
        params: clean({ branchId: f.branchId }),
      });
      return data.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useCreateEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateEquipmentInput) => {
      const { data } = await http.post<Envelope<EquipmentView>>('/resources/equipment', input);
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: EQUIPMENT_KEY }),
  });
}

export function useUpdateEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateEquipmentInput }) => {
      const { data } = await http.patch<Envelope<EquipmentView>>(`/resources/equipment/${id}`, input);
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: EQUIPMENT_KEY }),
  });
}

export function useDeleteEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await http.delete(`/resources/equipment/${id}`);
      return id;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: EQUIPMENT_KEY }),
  });
}
