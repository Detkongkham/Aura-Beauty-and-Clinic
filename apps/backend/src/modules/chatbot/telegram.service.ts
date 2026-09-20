import { randomBytes } from 'node:crypto';
import type { TelegramLinkCodeView, TelegramUpdate } from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { cancelAppointment, getMyAppointments } from '../booking/booking.service.js';
import { sendTelegramMessage } from '../../services/telegram.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ບໍ່ມີ O/0/I/1, ຄືກັນກັບ referral code
const LINK_CODE_TTL_MS = 15 * 60 * 1000;

function randomLinkCode(): string {
  const bytes = randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i += 1) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return out;
}

/** ອອກລະຫັດຜູກ Telegram ໃໝ່ໃຫ້ userId (retry ເມື່ອລະຫັດຊ້ຳ, ຄືກັນກັບ referral.ensureCode). */
export async function generateLinkCode(userId: string): Promise<TelegramLinkCodeView> {
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
  for (let attempt = 1; ; attempt += 1) {
    try {
      const row = await prisma.telegramLink.upsert({
        where: { userId },
        update: { linkCode: randomLinkCode(), linkCodeExpiresAt: expiresAt },
        create: { userId, linkCode: randomLinkCode(), linkCodeExpiresAt: expiresAt },
      });
      return {
        code: row.linkCode!,
        botDeepLink: env.TELEGRAM_BOT_USERNAME ? `https://t.me/${env.TELEGRAM_BOT_USERNAME}` : null,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002' && attempt < 5) continue;
      throw err;
    }
  }
}

async function findLinkedUserId(chatId: string): Promise<string | null> {
  const link = await prisma.telegramLink.findUnique({
    where: { telegramChatId: chatId },
    select: { userId: true },
  });
  return link?.userId ?? null;
}

async function logConversation(
  chatId: string,
  intent: string,
  slots: Record<string, unknown>,
  resolved: boolean,
): Promise<void> {
  await prisma.botConversation.create({
    data: {
      platform: 'TELEGRAM',
      externalUserId: chatId,
      intentDetected: intent,
      extractedSlots: slots as Prisma.InputJsonValue,
      isResolved: resolved,
    },
  });
}

async function handleLink(chatId: string, code: string): Promise<string> {
  const trimmed = code.trim().toUpperCase();
  const link = await prisma.telegramLink.findUnique({ where: { linkCode: trimmed } });
  if (!link || !link.linkCodeExpiresAt || link.linkCodeExpiresAt.getTime() < Date.now()) {
    return 'ລະຫັດຜູກບໍ່ຖືກຕ້ອງ ຫຼື ໝົດອາຍຸແລ້ວ — ຂໍລະຫັດໃໝ່ຈາກແອັບ Aura.';
  }
  await prisma.telegramLink.update({
    where: { id: link.id },
    data: { telegramChatId: chatId, linkedAt: new Date(), linkCode: null, linkCodeExpiresAt: null },
  });
  return 'ຜູກບັນຊີສຳເລັດແລ້ວ! ພິມ /myappointments ເພື່ອເບິ່ງນັດໝາຍ ຫຼື /services ເພື່ອເບິ່ງບໍລິການ.';
}

async function handleServices(): Promise<string> {
  const services = await prisma.service.findMany({
    where: { isActive: true, deletedAt: null },
    select: { name: true, price: true },
    take: 10,
    orderBy: { name: 'asc' },
  });
  if (services.length === 0) return 'ບໍ່ພົບບໍລິການໃນຂະນະນີ້.';
  return services.map((s) => `• ${s.name} — ${s.price.toNumber().toLocaleString('en-US')} ກີບ`).join('\n');
}

async function handleMyAppointments(chatId: string): Promise<string> {
  const userId = await findLinkedUserId(chatId);
  if (!userId) return 'ຍັງບໍ່ໄດ້ຜູກບັນຊີ — ພິມ /link CODE ກ່ອນ (ຂໍລະຫັດຈາກແອັບ Aura).';
  const { items } = await getMyAppointments(userId, { page: 1, pageSize: 5, scope: 'upcoming' });
  if (items.length === 0) return 'ທ່ານບໍ່ມີນັດໝາຍທີ່ຈະມາເຖິງ.';
  return items
    .map((a) => `• ${a.serviceName} — ${new Date(a.startAt).toLocaleString('lo-LA', { timeZone: 'Asia/Vientiane' })}\n  id: ${a.id}`)
    .join('\n\n')
    .concat('\n\nຍົກເລີກ: /cancel <id>');
}

async function handleCancel(chatId: string, appointmentId: string): Promise<string> {
  const userId = await findLinkedUserId(chatId);
  if (!userId) return 'ຍັງບໍ່ໄດ້ຜູກບັນຊີ — ພິມ /link CODE ກ່ອນ.';
  try {
    await cancelAppointment(appointmentId.trim(), userId, {});
    return 'ຍົກເລີກນັດໝາຍສຳເລັດແລ້ວ.';
  } catch (err) {
    return (err as { message?: string }).message ?? 'ຍົກເລີກບໍ່ສຳເລັດ.';
  }
}

const WELCOME =
  'ຍິນດີຕ້ອນຮັບສູ່ Aura! ພິມ /link CODE ເພື່ອຜູກບັນຊີ (ຂໍລະຫັດຈາກແອັບ), ' +
  '/services ເບິ່ງບໍລິການ, /myappointments ເບິ່ງນັດໝາຍ, /cancel <id> ຍົກເລີກນັດ.';

/** ຮັບ Telegram webhook update 1 ອັນ, ຕອບກັບຜ່ານ sendTelegramMessage. ບໍ່ຮອງຮັບການຈອງໃໝ່ຜ່ານ
 * chat wave ນີ້ — ອ່ານ/ຍົກເລີກ ເທົ່ານັ້ນ (ຄວາມສ່ຽງຕ່ຳກວ່າ slot-picking UX ໃນ text). */
export async function handleUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message?.text) return;
  const chatId = String(message.chat.id);
  const text = message.text.trim();

  let reply: string;
  let intent: string;
  let slots: Record<string, unknown> = {};

  if (text === '/start') {
    intent = 'start';
    reply = WELCOME;
  } else if (text.startsWith('/link')) {
    intent = 'link';
    const code = text.slice('/link'.length).trim();
    slots = { code };
    reply = code ? await handleLink(chatId, code) : 'ໃຊ້ຮູບແບບ: /link CODE';
  } else if (text === '/services') {
    intent = 'services';
    reply = await handleServices();
  } else if (text === '/myappointments') {
    intent = 'myappointments';
    reply = await handleMyAppointments(chatId);
  } else if (text.startsWith('/cancel')) {
    intent = 'cancel';
    const id = text.slice('/cancel'.length).trim();
    slots = { id };
    reply = id ? await handleCancel(chatId, id) : 'ໃຊ້ຮູບແບບ: /cancel <id>';
  } else {
    intent = 'unknown';
    reply = WELCOME;
  }

  await logConversation(chatId, intent, slots, true);
  await sendTelegramMessage(chatId, reply);
}
