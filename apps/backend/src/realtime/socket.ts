import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type {
  AccessTokenPayload,
  ChatMessageEvent,
  ChatReadEvent,
  HomeServiceLocationEvent,
  HomeServiceStatusEvent,
  HomeServiceTripView,
  PaymentSlipEvent,
} from '@abcp/shared-types';
import { locationPingSchema, sendChatMessageSchema } from '@abcp/shared-types';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from '../config/database.js';
import { createRedisConnection } from '../config/redis.js';
import { verifyAccessToken } from '../utils/token.js';
import { getTripViewByAppointmentId, recordLocationPing } from '../modules/home-service/home-service.service.js';
import { authorizeThreadAccess, postMessage } from '../modules/chat/chat.service.js';
import { markConversationRead } from '../modules/conversations/conversations.service.js';

type SocketData = { auth: AccessTokenPayload };

type ClientToServerEvents = {
  'join-trip': (payload: { appointmentId?: string }) => void;
  'leave-trip': (payload: { appointmentId?: string }) => void;
  'stylist:location': (payload: unknown) => void;
  'join-home-service-admin': () => void;
  'leave-home-service-admin': () => void;
  'join-chat': (payload: { threadId?: string }) => void;
  'leave-chat': (payload: { threadId?: string }) => void;
  'chat:message': (payload: unknown) => void;
  'chat:read': (payload: { threadId?: string }) => void;
  'join-slip-review': () => void;
  'leave-slip-review': () => void;
};

type ServerToClientEvents = {
  'trip:location': (event: HomeServiceLocationEvent) => void;
  'trip:status': (event: HomeServiceStatusEvent) => void;
  'home-service:trip-update': (event: HomeServiceTripView) => void;
  unauthorized: (payload: { appointmentId?: string; threadId?: string }) => void;
  'chat:message': (event: ChatMessageEvent) => void;
  'chat:read': (event: ChatReadEvent) => void;
  'payment-slip:updated': (event: PaymentSlipEvent) => void;
};

type InterServerEvents = Record<string, never>;

/**
 * ໂມດູນ 29 — socket.io server ດຽວ, ໃຊ້ຮ່ວມກັນທົ່ວແອັບ (M21 chat / M35 chatbot ໃນອະນາຄົດ).
 * Singleton — ຕັ້ງຄ່າຄັ້ງດຽວຕອນ bootstrap (server.ts), REST handlers ໃຊ້ getIO() ເພື່ອ emit.
 */
let io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> | null = null;

function tripRoom(appointmentId: string): string {
  return `home-service:${appointmentId}`;
}

function chatRoom(threadId: string): string {
  return `chat:${threadId}`;
}

/** ຫ້ອງສ່ວນຕົວຂອງຜູ້ໃຊ້ — ໃຊ້ push ຜົນທີ່ກ່ຽວກັບຕົວເອງ (ເຊັ່ນ ຜົນກວດສະລິບ). */
function userRoom(userId: string): string {
  return `user:${userId}`;
}

/** ຫ້ອງກວດສະລິບ (ໂມດູນ 39 W3): SUPER_ADMIN ໄດ້ທຸກສາຂາ, ຜູ້ອື່ນສະເພາະສາຂາຕົນ. */
function slipReviewRoom(branchId: string | 'all'): string {
  return `slip-review:${branchId}`;
}

/** ຫ້ອງດຽວ ໃຫ້ admin/branch-admin ທຸກຄົນທີ່ເປີດໜ້າ dispatch console ຮ່ວມ — ໄດ້ trip update ທຸກອັນສົດໆ. */
function homeServiceAdminRoom(): string {
  return 'home-service:admin';
}

/** ອະນຸຍາດຮ່ວມ trip room ສະເພາະ: ລູກຄ້າເຈົ້າຂອງ, ຊ່າງທີ່ຖືກຈັບຄູ່, ຫຼື admin/branch-admin. */
async function canAccessTrip(auth: AccessTokenPayload, appointmentId: string): Promise<boolean> {
  if (auth.role === 'SUPER_ADMIN' || auth.role === 'BRANCH_ADMIN') return true;
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { customerId: true, staffProfile: { select: { userId: true } } },
  });
  if (!appt) return false;
  return appt.customerId === auth.sub || appt.staffProfile.userId === auth.sub;
}

export function createSocketServer(httpServer: HttpServer): typeof io {
  io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
  });

  // Redis adapter — ບໍ່ຈຳເປັນສຳລັບ instance ດຽວ, ແຕ່ເປັນການລົງທຶນ infra ໄວ້ລ່ວງໜ້າ ສຳລັບ
  // horizontal scaling ໃນອະນາຄົດ + reuse ໂດຍ M21 chat / M35 chatbot (ຄືກັນກັບ BullMQ — dedicated connections).
  const pubClient = createRedisConnection();
  const subClient = createRedisConnection();
  io.adapter(createAdapter(pubClient, subClient));

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error('unauthorized'));
      return;
    }
    try {
      socket.data.auth = verifyAccessToken(token);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>) => {
    void socket.join(userRoom(socket.data.auth.sub));

    // ໜ້າກວດສະລິບ — ສະເພາະ admin / branch-admin / staff. event ບໍ່ມີຂໍ້ມູນສ່ວນຕົວ (ມີແຕ່ id + ສະຖານະ);
    // ລາຍລະອຽດດຶງຜ່ານ REST ທີ່ກວດສິດ payments:review ແລະ ສາຂາ.
    socket.on('join-slip-review', () => {
      const { role, branchId } = socket.data.auth;
      if (role === 'SUPER_ADMIN') {
        void socket.join(slipReviewRoom('all'));
      } else if ((role === 'BRANCH_ADMIN' || role === 'STAFF') && branchId) {
        void socket.join(slipReviewRoom(branchId));
      } else {
        socket.emit('unauthorized', {});
      }
    });

    socket.on('leave-slip-review', () => {
      const { branchId } = socket.data.auth;
      void socket.leave(slipReviewRoom('all'));
      if (branchId) void socket.leave(slipReviewRoom(branchId));
    });

    socket.on('join-trip', async (payload: { appointmentId?: string }) => {
      const appointmentId = payload?.appointmentId;
      if (!appointmentId) return;
      const allowed = await canAccessTrip(socket.data.auth, appointmentId).catch(() => false);
      if (!allowed) {
        socket.emit('unauthorized', { appointmentId });
        return;
      }
      await socket.join(tripRoom(appointmentId));
    });

    socket.on('leave-trip', (payload: { appointmentId?: string }) => {
      if (payload?.appointmentId) void socket.leave(tripRoom(payload.appointmentId));
    });

    // ໜ້າ dispatch console ຂອງ web-admin — ອະນຸຍາດສະເພາະ admin/branch-admin.
    socket.on('join-home-service-admin', () => {
      if (socket.data.auth.role !== 'SUPER_ADMIN' && socket.data.auth.role !== 'BRANCH_ADMIN') {
        socket.emit('unauthorized', {});
        return;
      }
      void socket.join(homeServiceAdminRoom());
    });

    socket.on('leave-home-service-admin', () => {
      void socket.leave(homeServiceAdminRoom());
    });

    // ໂມດູນ 21 — chat room join, ອະນຸຍາດຜ່ານ chat.service.authorizeThreadAccess ດຽວກັນກັບ REST
    // (ບໍ່ຊ້ຳ logic ກວດສິດ). ຮັບ-ສົ່ງ persist ຜ່ານ postMessage ແລ້ວ broadcast ເຂົ້າ room.
    socket.on('join-chat', async (payload: { threadId?: string }) => {
      const threadId = payload?.threadId;
      if (!threadId) return;
      const allowed = await authorizeThreadAccess(threadId, socket.data.auth).catch(() => null);
      if (!allowed) {
        socket.emit('unauthorized', { threadId });
        return;
      }
      await socket.join(chatRoom(threadId));
    });

    socket.on('leave-chat', (payload: { threadId?: string }) => {
      if (payload?.threadId) void socket.leave(chatRoom(payload.threadId));
    });

    socket.on('chat:message', async (payload: unknown) => {
      const parsedThread = (payload as { threadId?: string } | null)?.threadId;
      if (!parsedThread) return;
      const parsed = sendChatMessageSchema.safeParse(payload);
      if (!parsed.success) return;
      try {
        const message = await postMessage(parsedThread, socket.data.auth, parsed.data.body);
        emitChatMessage(message);
      } catch (err) {
        logger.warn({ err }, 'chat:message ລົ້ມເຫລວ');
      }
    });

    socket.on('chat:read', async (payload: { threadId?: string }) => {
      const threadId = payload?.threadId;
      if (!threadId) return;
      const allowed = await authorizeThreadAccess(threadId, socket.data.auth).catch(() => null);
      if (!allowed) return;
      await markConversationRead(threadId, socket.data.auth.sub).catch(() => undefined);
      emitChatRead({ threadId, readerId: socket.data.auth.sub, readAt: new Date().toISOString() });
    });

    // ຊ່າງສົ່ງພິກັດ — server ບັນທຶກ + ຄິດ ETA ໃໝ່ ແລ້ວ broadcast ຄືນເຂົ້າ room (recordLocationPing
    // ຫາ trip active ຈາກ matchedStaffId ເອງ, ບໍ່ເຊື່ອຖື appointmentId ຈາກ client).
    socket.on('stylist:location', async (payload: unknown) => {
      if (socket.data.auth.role !== 'STAFF') return;
      const parsed = locationPingSchema.safeParse(payload);
      if (!parsed.success) return;
      try {
        const event = await recordLocationPing(socket.data.auth.sub, parsed.data);
        if (event) {
          emitTripLocation(event);
          const view = await getTripViewByAppointmentId(event.appointmentId).catch(() => null);
          if (view) emitHomeServiceAdminUpdate(view);
        }
      } catch (err) {
        logger.warn({ err }, 'stylist:location ping ລົ້ມເຫລວ');
      }
    });
  });

  return io;
}

/** ສຳລັບ tests / graceful shutdown — ປິດ io ແລະ reset singleton. */
export async function closeSocketServer(): Promise<void> {
  if (!io) return;
  await new Promise<void>((resolve) => io!.close(() => resolve()));
  io = null;
}

export function getIO(): NonNullable<typeof io> {
  if (!io) throw new Error('Socket.io server ຍັງບໍ່ທັນ initialize');
  return io;
}

/**
 * ໃຊ້ຈາກ REST route handlers — no-op ຢ່າງງຽບໆຖ້າ socket server ຍັງບໍ່ໄດ້ສ້າງ (ເຊັ່ນ integration
 * tests ທີ່ໃຊ້ createApp() ໂດຍກົງ, ບໍ່ໄດ້ຜ່ານ server.ts). Production ສະເໝີມີ io ຕັ້ງແຕ່ boot.
 */
export function emitTripLocation(event: HomeServiceLocationEvent): void {
  io?.to(tripRoom(event.appointmentId)).emit('trip:location', event);
}

export function emitTripStatus(event: HomeServiceStatusEvent): void {
  io?.to(tripRoom(event.appointmentId)).emit('trip:status', event);
}

/** Broadcast trip ໃໝ່/ອັບເດດໃຫ້ dispatcher ທັງໝົດທີ່ຮ່ວມ `homeServiceAdminRoom()` ຢູ່. */
export function emitHomeServiceAdminUpdate(trip: HomeServiceTripView): void {
  io?.to(homeServiceAdminRoom()).emit('home-service:trip-update', trip);
}

export function emitChatMessage(event: ChatMessageEvent): void {
  io?.to(chatRoom(event.threadId)).emit('chat:message', event);
}

export function emitChatRead(event: ChatReadEvent): void {
  io?.to(chatRoom(event.threadId)).emit('chat:read', event);
}

/** ໂມດູນ 39 W3 — ແຈ້ງຜົນສະລິບໃຫ້ຜູ້ອັບໂຫຼດ + ໜ້າກວດສະລິບຂອງສາຂານັ້ນ (ແລະ SUPER_ADMIN). */
export function emitPaymentSlipUpdated(event: PaymentSlipEvent, uploadedById: string): void {
  io?.to([userRoom(uploadedById), slipReviewRoom(event.branchId), slipReviewRoom('all')]).emit(
    'payment-slip:updated',
    event,
  );
}
