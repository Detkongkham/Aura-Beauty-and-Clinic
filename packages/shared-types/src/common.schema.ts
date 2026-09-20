import { z } from 'zod';

/** ຮູບແບບເວລາ "HH:MM" 24 ຊົ່ວໂມງ — ໃຊ້ໃນ WorkingHour, DynamicPricingRule. */
export const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'ຕ້ອງເປັນຮູບແບບ HH:MM (24h) ເຊັ່ນ "09:00"');
export type TimeString = z.infer<typeof timeStringSchema>;

/** 0 = ວັນອາທິດ ... 6 = ວັນເສົາ */
export const dayOfWeekSchema = z.number().int().min(0).max(6);

export const uuidSchema = z.string().uuid();

/** ISO datetime string → Date */
export const isoDateTimeSchema = z.coerce.date();

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  /** Max 5000 — several web-admin screens fetch an "everything" page in one shot
   * (dropdown option lists, CSV export, summary widgets) rather than paging through. */
  pageSize: z.coerce.number().int().positive().max(5000).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const moneySchema = z
  .number()
  .nonnegative()
  .refine((n) => Number.isFinite(n) && Math.round(n * 100) === n * 100, {
    message: 'ຮອງຮັບທົດສະນິຍົມສູງສຸດ 2 ຕຳແໜ່ງ',
  });

export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiResponse<T> = {
  data: T;
};

/** ຜົນລັບແບບແບ່ງໜ້າ — ໃຊ້ຮ່ວມກັນລະຫວ່າງ backend ແລະ client. */
export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
