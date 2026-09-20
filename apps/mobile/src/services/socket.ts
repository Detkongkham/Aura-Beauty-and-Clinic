import { io, type Socket } from 'socket.io-client';
import { env } from '../config/env';
import { useAuthStore } from '../store/auth.store';

/** socket.io server ຕິດຢູ່ HTTP server ຫຼັກ (ບໍ່ແມ່ນ /api/v1 prefix). */
const SOCKET_URL = env.apiBaseUrl.replace(/\/api\/v1\/?$/, '');

/**
 * ສ້າງ connection ໃໝ່ (ບໍ່ແມ່ນ singleton) — scope ຕາມ component lifecycle ຂອງໜ້າທີ່ໃຊ້ (ເຊັ່ນ
 * StaffActiveTripScreen / ChatScreen): ເປີດຕອນ mount, join/leave room ທີ່ກ່ຽວຂ້ອງ + disconnect ຕອນ
 * unmount. `auth` ເປັນ callback ເພື່ອໃຫ້ token ຫຼ້າສຸດຖືກສົ່ງທຸກຄັ້ງທີ່ (re)connect (ຫຼັງ refresh token
 * ໝູນວຽນ). Socket server ດຽວໃຊ້ຮ່ວມກັນທົ່ວແອັບ (home-service trip room ແລະ chat room ອາໄສ connection
 * ດຽວກັນນີ້) — ດັ່ງນັ້ນ connector ດຽວກໍ່ພຽງພໍ, ບໍ່ຈຳເປັນຕ້ອງແຍກຕໍ່ purpose.
 */
export function connectAppSocket(): Socket {
  return io(SOCKET_URL, {
    transports: ['websocket'],
    auth: (cb) => cb({ token: useAuthStore.getState().accessToken }),
  });
}

/** ຊື່ເກົ່າ — ຄົງໄວ້ເພື່ອບໍ່ຕ້ອງແກ້ໄຂທຸກບ່ອນທີ່ໃຊ້ (HomeServiceTrackingScreen/StaffActiveTripScreen). */
export const connectTripSocket = connectAppSocket;
