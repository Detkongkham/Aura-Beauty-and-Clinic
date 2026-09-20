import { z } from 'zod';

/**
 * Smart Waitlist Management & Backfill — ໂມດູນ 20 (Phase 5).
 * ເຂົ້າຄິວລໍຖ້າເມື່ອເວລາເຕັມ; BullMQ worker ແຈ້ງເມື່ອມີຄິວຍົກເລີກ.
 */

/** POST /waitlist — ລູກຄ້າເຂົ້າຄິວລໍຖ້າ. */
export const joinWaitlistSchema = z.object({
  branchId: z.string().uuid(),
  serviceId: z.string().uuid(),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ຕ້ອງເປັນຮູບແບບ YYYY-MM-DD'),
});
export type JoinWaitlistInput = z.infer<typeof joinWaitlistSchema>;

export type WaitlistEntryView = {
  id: string;
  branchId: string;
  branchName: string;
  serviceId: string;
  serviceName: string;
  preferredDate: string; // YYYY-MM-DD
  createdAt: string;
};
