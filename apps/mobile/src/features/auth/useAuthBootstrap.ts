import axios from 'axios';
import { useEffect } from 'react';
import { readPersistedSession, useAuthStore } from '../../store/auth.store';
import { apiMe } from './auth.api';

/** ຕອນເປີດແອັບ: ອ່ານ session ທີ່ persist → verify ດ້ວຍ /auth/me → authed ຫຼື guest. */
export function useAuthBootstrap(): void {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const persisted = await readPersistedSession();
      if (cancelled) return;

      const isAppRole = (r: string): boolean => r === 'CUSTOMER' || r === 'STAFF';

      if (!persisted || !isAppRole(persisted.user.role)) {
        useAuthStore.getState().clear();
        return;
      }

      // ໃສ່ token ກ່ອນ ເພື່ອໃຫ້ http interceptor ໃຊ້ໄດ້ຕອນ verify.
      useAuthStore.getState().setSession(persisted);
      try {
        const user = await apiMe();
        if (cancelled) return;
        if (!isAppRole(user.role)) {
          useAuthStore.getState().clear();
          return;
        }
        useAuthStore.getState().setSession({ tokens: persisted.tokens, user });
      } catch (e) {
        // session ຕາຍແທ້ ຖືກລ້າງໂດຍ http interceptor ແລ້ວ. ເປີດແອັບຕອນບໍ່ມີເນັດ / server ລົ້ມ
        // ຕ້ອງບໍ່ເຕະອອກ — ໃຊ້ session ທີ່ບັນທຶກໄວ້ຕໍ່.
        const status = axios.isAxiosError(e) ? e.response?.status : undefined;
        if (!cancelled && (status === 401 || status === 403)) useAuthStore.getState().clear();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
