import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

/** Web Admin ▸ Settings — flat blob, ຮູບຮ່າງກົງກັບ web-admin `AppSettings`. */
export type AppSettings = {
  logoUrl: string;
  businessName: string;
  legalName: string;
  contactPhone: string;
  contactEmail: string;
  addressLine: string;
  taxId: string;
  displayCurrency: 'LAK' | 'THB' | 'USD';
  timezone: string;
  defaultLanguage: 'lo' | 'en';
  weekStart: 'mon' | 'sun';
  dateFormat: 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY';
  autoConvertCurrency: boolean;
  fxRefreshMinutes: number;
  bookingLeadHours: number;
  cancellationWindowHours: number;
  maxAdvanceDays: number;
  slotIntervalMinutes: number;
  allowWalkIns: boolean;
  allowOnlineBooking: boolean;
  autoConfirm: boolean;
  requireDeposit: boolean;
  depositPercent: number;
  noShowThreshold: number;
  queueEnabled: boolean;
  ticketPrefix: string;
  waitAlertMinutes: number;
  autoRecall: boolean;
  smsSenderName: string;
  reminderOffsetsHours: string;
  sendBookingConfirmation: boolean;
  sessionTimeoutMinutes: number;
  minPasswordLength: number;
  require2fa: boolean;
  dataRetentionMonths: number;
};

const SETTINGS_KEY = 'app';

export const DEFAULT_SETTINGS: AppSettings = {
  logoUrl: '',
  businessName: 'Aura Beauty & Clinic',
  legalName: 'Aura Co., Ltd',
  contactPhone: '',
  contactEmail: '',
  addressLine: '',
  taxId: '',
  displayCurrency: 'LAK',
  timezone: 'Asia/Vientiane',
  defaultLanguage: 'lo',
  weekStart: 'mon',
  dateFormat: 'DD/MM/YYYY',
  autoConvertCurrency: false,
  fxRefreshMinutes: 60,
  bookingLeadHours: 2,
  cancellationWindowHours: 4,
  maxAdvanceDays: 30,
  slotIntervalMinutes: 15,
  allowWalkIns: true,
  allowOnlineBooking: true,
  autoConfirm: false,
  requireDeposit: false,
  depositPercent: 20,
  noShowThreshold: 3,
  queueEnabled: true,
  ticketPrefix: 'A',
  waitAlertMinutes: 20,
  autoRecall: false,
  smsSenderName: 'AURA',
  reminderOffsetsHours: '24,1',
  sendBookingConfirmation: true,
  sessionTimeoutMinutes: 60,
  minPasswordLength: 8,
  require2fa: false,
  dataRetentionMonths: 24,
};

/** GET /settings — defaults merged with any stored overrides. */
export async function getSettings(): Promise<AppSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
  const stored = (row?.value as Partial<AppSettings> | undefined) ?? {};
  return { ...DEFAULT_SETTINGS, ...stored };
}

/** PUT /settings — shallow-merge the patch and persist. */
export async function updateSettings(patch: Record<string, unknown>): Promise<AppSettings> {
  const allowed = new Set(Object.keys(DEFAULT_SETTINGS));
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (allowed.has(k)) clean[k] = v;
  if (Object.keys(clean).length === 0) throw ApiError.badRequest('ບໍ່ມີຄ່າທີ່ຖືກຕ້ອງໃຫ້ບັນທຶກ');

  const current = await getSettings();
  const next = { ...current, ...clean } as AppSettings;
  await prisma.appSetting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: next },
    update: { value: next },
  });
  return next;
}

// ---- notification templates ----------------------------------------

export type NotifTemplateView = {
  key: string;
  channel: string;
  enabled: boolean;
  body: string;
  subject: string;
};

const DEFAULT_TEMPLATES: NotifTemplateView[] = [
  { key: 'reminder_24h', channel: 'sms', enabled: true, subject: '', body: 'ສະບາຍດີ {{name}}, ມື້ອື່ນທ່ານມີນັດ {{service}} ເວລາ {{time}}.' },
  { key: 'reminder_1h', channel: 'push', enabled: true, subject: '', body: 'ອີກ 1 ຊົ່ວໂມງ ນັດ {{service}} ຂອງທ່ານຈະເລີ່ມ.' },
  { key: 'booking_confirmed', channel: 'sms', enabled: true, subject: '', body: 'ຢືນຢັນການຈອງ {{code}} ວັນທີ {{date}}.' },
  { key: 'waitlist_open', channel: 'push', enabled: false, subject: '', body: 'ມີຄິວວ່າງສຳລັບ {{service}} — ຈອງດ່ວນ!' },
];

async function ensureTemplatesSeeded(): Promise<void> {
  const count = await prisma.notificationTemplate.count();
  if (count > 0) return;
  await prisma.notificationTemplate.createMany({ data: DEFAULT_TEMPLATES, skipDuplicates: true });
}

export async function listTemplates(): Promise<{ items: NotifTemplateView[] }> {
  await ensureTemplatesSeeded();
  const rows = await prisma.notificationTemplate.findMany({ orderBy: { key: 'asc' } });
  return {
    items: rows.map((r) => ({
      key: r.key,
      channel: r.channel,
      enabled: r.enabled,
      body: r.body,
      subject: r.subject,
    })),
  };
}

export async function updateTemplate(
  key: string,
  patch: { channel?: string; enabled?: boolean; body?: string; subject?: string },
): Promise<NotifTemplateView> {
  await ensureTemplatesSeeded();
  const existing = await prisma.notificationTemplate.findUnique({ where: { key } });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບແມ່ແບບ');
  const row = await prisma.notificationTemplate.update({
    where: { key },
    data: {
      ...(patch.channel !== undefined ? { channel: patch.channel } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.subject !== undefined ? { subject: patch.subject } : {}),
    },
  });
  return {
    key: row.key,
    channel: row.channel,
    enabled: row.enabled,
    body: row.body,
    subject: row.subject,
  };
}
