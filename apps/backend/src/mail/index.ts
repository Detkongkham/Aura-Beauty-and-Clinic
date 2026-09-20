import { logger } from '../config/logger.js';

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
};

/**
 * Mail transport — skeleton. Phase 5 ຈະຕໍ່ Nodemailer + templates.
 * ຕອນນີ້ log ໄວ້ເພື່ອ dev ເຫັນ payload.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  logger.info({ to: message.to, subject: message.subject }, 'sendMail (stub)');
}
