import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(60 * 60 * 24 * 14),
  /** ກະແຈເຂົ້າລະຫັດ TOTP secret (2FA) — ບໍ່ຕັ້ງ = ໃຊ້ JWT_REFRESH_SECRET (ປ່ຽນ JWT secret ແລ້ວ 2FA ຕ້ອງຕັ້ງໃໝ່). */
  TWO_FACTOR_ENC_KEY: z.string().min(16).optional(),
  /** ຊື່ທີ່ສະແດງໃນແອັບ authenticator. */
  TWO_FACTOR_ISSUER: z.string().default('Aura Clinic'),

  STORAGE_DRIVER: z.enum(['local']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./uploads'),
  STORAGE_PUBLIC_URL: z.string().url().default('http://localhost:4000/uploads'),

  /** ລັດສະໝີ (ແມັດ) ທີ່ຊ່າງ check-in/out ໄດ້ ໂດຍນັບຈາກພິກັດສາຂາ (Phase 4 GPS Attendance). */
  STAFF_ATTENDANCE_RADIUS_METERS: z.coerce.number().int().positive().default(300),

  /** ລັດສະໝີ (ແມັດ) ສູງສຸດທີ່ຈະຈັດຊ່າງ Home Service ອັດຕະໂນມັດ (Module 29). */
  HOME_SERVICE_MATCH_RADIUS_METERS: z.coerce.number().int().positive().default(15_000),

  // ---- Phase 5: Finance & Notifications ----
  /** Expo Push access token — ຫວ່າງໄວ້ = push ຖືກ log ເທົ່ານັ້ນ (dev). */
  EXPO_ACCESS_TOKEN: z.string().optional(),
  EXPO_PUSH_URL: z.string().url().default('https://exp.host/--/api/v2/push/send'),
  /** Stripe secret — mock gateway ບໍ່ຮຽກ network; ຄ່ານີ້ພຽງແຕ່ toggle "live-like" log. */
  STRIPE_SECRET_KEY: z.string().optional(),
  /** BCEL One merchant id — ໃສ່ໃນ QR payload (mock). */
  BCEL_MERCHANT_ID: z.string().default('ABCP-DEMO-0001'),
  /** Module 39 W2 — HMAC secret ຂອງ webhook ຈາກ provider ແບບ MOCK (dev/staging). Provider LIVE ໃຊ້ env ຕາມ
   * `PaymentProvider.webhookSecretRef`. ຫ້າມໃຊ້ຄ່ານີ້ໃນ production. */
  PAYMENT_WEBHOOK_SECRET: z.string().min(8).default('dev-payment-webhook-secret'),
  /** ອັດຕາມັດຈຳ default (0.2–0.5) — override ຕໍ່ສາຂາຜ່ານ AppSetting. */
  /** Wave 10C — ຄ່າເລີ່ມຕົ້ນ: ຮັບເງິນສົດ/ຈ່າຍຄືນເງິນສົດ ຕ້ອງມີກະລິ້ນຊັກເປີດຢູ່ (ແກ້ໄດ້ໃນ AppSetting 'finance-cash'). */
  CASH_REQUIRE_OPEN_DRAWER: z.enum(['true', 'false']).default('true'),
  DEPOSIT_RATE_DEFAULT: z.coerce.number().min(0.2).max(0.5).default(0.2),

  /** ຈຳນວນວັນຫຼັງ appointment COMPLETED/CANCELLED/NO_SHOW ກ່ອນ auto-lock ຫ້ອງແຊັດ CONSULTATION
   * (Module 38 Wave 8C) — ຍັງອ່ານໄດ້, ພຽງແຕ່ສົ່ງຂໍ້ຄວາມໃໝ່ບໍ່ໄດ້. */
  CHAT_CONSULTATION_LOCK_AFTER_DAYS: z.coerce.number().int().positive().default(14),

  // ---- Phase 7C: M35 Telegram Chatbot Booking Pilot ----
  /** Telegram Bot API token (@BotFather) — ຫວ່າງໄວ້ = ຄຳຕອບ bot ຖືກ log ເທົ່ານັ້ນ (dev), ຄືກັນກັບ
   * EXPO_ACCESS_TOKEN. */
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  /** ຄ່າສົ່ງໄປ Telegram ຕອນ setWebhook, ຮັບຄືນມາໃນ header `X-Telegram-Bot-Api-Secret-Token` —
   * ໃຊ້ຢືນຢັນ webhook (ບໍ່ໃຊ້ authGuard ເພາະ Telegram ຮຽກເອງ). */
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),

  // ---- ຂໍ້ຈຳກັດ 10G: ຊ່ອງທາງແຄມເປນນອກຈາກ push (ຫວ່າງ = ຊ່ອງນັ້ນປິດ, ແຄມເປນຂ້າມ ແລະ ນັບ skippedNoProvider) ----
  /** HTTP SMS gateway (POST JSON { to, from, message } + Bearer token) — ເຊັ່ນ gateway ຂອງ Unitel/LTC/aggregator. */
  SMS_GATEWAY_URL: z.string().url().optional(),
  SMS_GATEWAY_TOKEN: z.string().optional(),
  SMS_SENDER_ID: z.string().default('AURA'),
  /** shared secret ທີ່ gateway ສົ່ງມາໃນ header `X-Sms-Inbound-Secret` ຕອນ forward ຂໍ້ຄວາມຕອບກັບ (STOP). */
  SMS_INBOUND_SECRET: z.string().optional(),
  /** ອີເມວຜ່ານ HTTP API: resend | sendgrid */
  EMAIL_PROVIDER: z.enum(['resend', 'sendgrid']).optional(),
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  /** LINE Messaging API (Official Account) */
  LINE_CHANNEL_ACCESS_TOKEN: z.string().optional(),
  LINE_CHANNEL_SECRET: z.string().optional(),
  /** Basic ID ຂອງ OA ເຊັ່ນ '@aura' — ໃຊ້ສ້າງລິ້ງເພີ່ມໝູ່ */
  LINE_OA_ID: z.string().optional(),
  /** URL ສາທາລະນະຂອງ API (ສຳລັບລິ້ງຖອນຕົວໃນ SMS/ອີເມວ) */
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000/api/v1'),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:5174,http://localhost:5175'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Environment ບໍ່ຖືກຕ້ອງ:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
};
