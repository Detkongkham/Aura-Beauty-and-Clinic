import { io, type Socket } from 'socket.io-client';

import { env } from '@/config/env';
import { authStore } from '@/features/auth/auth.store';

/** socket.io server ຕິດຢູ່ HTTP server ຫຼັກ (ບໍ່ແມ່ນ /api/v1 prefix) — ຄືກັນກັບ mobile
 * `services/socket.ts`. ບໍ່ແມ່ນ singleton — scope ຕາມ component lifecycle ຂອງໜ້າທີ່ໃຊ້ (ເຊັ່ນ
 * ChatPanel): ເປີດຕອນ mount, join/leave + disconnect ຕອນ unmount. */
const SOCKET_URL = env.apiBaseUrl.replace(/\/api\/v1\/?$/, '');

export function connectAppSocket(): Socket {
  return io(SOCKET_URL, {
    transports: ['websocket'],
    auth: (cb) => cb({ token: authStore.getAccessToken() }),
  });
}
