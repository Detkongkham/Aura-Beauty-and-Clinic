import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Telegram Bot API adapter (Module 35) — ຮຽກ Telegram ດ້ວຍ global fetch, ບໍ່ເພິ່ງ SDK ໃໝ່ (ຄືກັນ
 * ກັບ `services/push.ts`'s Expo adapter). ຖ້າ TELEGRAM_BOT_TOKEN ບໍ່ຕັ້ງ → log ເທົ່ານັ້ນ (dev).
 */
export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    logger.info({ chatId, text }, '[telegram:dev] would send message');
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      logger.error({ status: res.status, body: await res.text() }, 'Telegram sendMessage failed');
    }
  } catch (err) {
    logger.error({ err }, 'Telegram sendMessage failed');
  }
}
