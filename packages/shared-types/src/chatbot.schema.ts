import { z } from 'zod';

/**
 * ໂມດູນ 35 — Telegram Chatbot Booking Pilot (Phase 7C, de-scoped ໃຫ້ Telegram ຢ່າງດຽວ — Bot API
 * ຟຣີ, ບໍ່ຕ້ອງ business verification, ບໍ່ຄືກັບ WhatsApp/LINE/Messenger). ບໍ່ມີ booking ຜ່ານ chat
 * wave ນີ້ — ອ່ານ/ຍົກເລີກ ເທົ່ານັ້ນ (ຄວາມສ່ຽງຕ່ຳກວ່າການເຮັດ slot-picking UX ໃນ chat text).
 */

export type TelegramLinkCodeView = {
  code: string;
  /** `t.me/<bot_username>` — null ຖ້າ TELEGRAM_BOT_USERNAME ຍັງບໍ່ໄດ້ຕັ້ງ (dev). */
  botDeepLink: string | null;
  expiresAt: string;
};

/** Telegram webhook update — ພຽງ subset ທີ່ໃຊ້ (message.text/chat.id). */
export const telegramUpdateSchema = z.object({
  update_id: z.number(),
  message: z
    .object({
      message_id: z.number(),
      chat: z.object({ id: z.number() }),
      text: z.string().optional(),
    })
    .optional(),
});
export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
