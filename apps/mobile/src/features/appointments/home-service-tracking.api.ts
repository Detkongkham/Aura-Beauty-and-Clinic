import type { HomeServiceTripView } from '@abcp/shared-types';
import { useQuery } from '@tanstack/react-query';
import { http } from '../../services/http';
import { qk } from '../../services/queryKeys';

/**
 * ໂມດູນ 29 — ລູກຄ້າຕິດຕາມ trip ຂອງຕົນ (`GET /home-service/:id` ໃຊ້ຮ່ວມກັນລະຫວ່າງລູກຄ້າ/ຊ່າງ/admin,
 * ດຽວກັນກັບ `useHomeServiceTrip` ໃນ `features/staff/home-service.api.ts` — ຄີ query ດຽວກັນ
 * (`qk.homeServiceTrip`) ຈຶ່ງແບ່ງ cache ກັນໄດ້ຖ້າຫາກເປີດພ້ອມກັນ).
 */
export function useHomeServiceTrip(appointmentId: string) {
  return useQuery({
    queryKey: qk.homeServiceTrip(appointmentId),
    queryFn: async () => {
      const { data } = await http.get<{ data: HomeServiceTripView }>(
        `/home-service/${appointmentId}`,
      );
      return data.data;
    },
    enabled: Boolean(appointmentId),
  });
}
