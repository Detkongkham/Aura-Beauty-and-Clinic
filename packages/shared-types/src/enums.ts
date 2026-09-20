import { z } from 'zod';

/**
 * Enums — source of truth ຮ່ວມກັບ Prisma schema (§2 ຂອງ implementation_plan.md).
 * ຄ່າຕ້ອງກົງກັບ enum ໃນ prisma/schema/*.prisma ແບບ 1:1.
 */

export const UserRole = z.enum([
  'SUPER_ADMIN',
  'BRANCH_ADMIN',
  'STAFF',
  'CUSTOMER',
  'AFFILIATE_PARTNER',
]);
export type UserRole = z.infer<typeof UserRole>;

export const AppointmentStatus = z.enum([
  'PENDING',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
]);
export type AppointmentStatus = z.infer<typeof AppointmentStatus>;

export const ServiceDeliveryType = z.enum(['IN_STORE', 'HOME_SERVICE']);
export type ServiceDeliveryType = z.infer<typeof ServiceDeliveryType>;

export const AppointmentSource = z.enum(['ONLINE', 'WALK_IN', 'ADMIN']);
export type AppointmentSource = z.infer<typeof AppointmentSource>;

export const PaymentStatus = z.enum([
  'PENDING',
  'DEPOSIT_PAID',
  'FULLY_PAID',
  'REFUNDED',
  'FAILED',
]);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

export const PaymentMethod = z.enum([
  'CASH',
  'BCEL_ONE_QR',
  'CREDIT_CARD',
  'GIFT_CARD',
  'PACKAGE_CREDIT',
  'LOYALTY_POINTS',
]);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const GroupBookingStatus = z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED']);
export type GroupBookingStatus = z.infer<typeof GroupBookingStatus>;

export const LoyaltyTier = z.enum(['SILVER', 'GOLD', 'PLATINUM']);
export type LoyaltyTier = z.infer<typeof LoyaltyTier>;

export const LoyaltyTxType = z.enum(['EARN', 'REDEEM', 'EXPIRE', 'ADJUST']);
export type LoyaltyTxType = z.infer<typeof LoyaltyTxType>;

export const AttendanceStatus = z.enum(['ON_TIME', 'LATE', 'OVERTIME', 'ABSENT']);
export type AttendanceStatus = z.infer<typeof AttendanceStatus>;

export const StockMovementType = z.enum([
  'PURCHASE_IN',
  'SERVICE_CONSUMED',
  'ADJUSTMENT_ADD',
  'ADJUSTMENT_DEDUCT',
  'RETURN_TO_SUPPLIER',
]);
export type StockMovementType = z.infer<typeof StockMovementType>;

export const TreatmentPhotoType = z.enum(['BEFORE', 'AFTER', 'PROGRESS']);
export type TreatmentPhotoType = z.infer<typeof TreatmentPhotoType>;

export const QueueTicketStatus = z.enum([
  'WAITING',
  'CALLED',
  'IN_SERVICE',
  'COMPLETED',
  'CANCELLED',
]);
export type QueueTicketStatus = z.infer<typeof QueueTicketStatus>;

export const POStatus = z.enum(['DRAFT', 'ORDERED', 'RECEIVED', 'CANCELLED']);
export type POStatus = z.infer<typeof POStatus>;

export const PayoutStatus = z.enum(['PENDING', 'PROCESSING', 'PAID', 'REJECTED']);
export type PayoutStatus = z.infer<typeof PayoutStatus>;

export const SubscriptionStatus = z.enum(['ACTIVE', 'PAST_DUE', 'CANCELLED', 'TRIAL']);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;

export const BotPlatform = z.enum(['WHATSAPP', 'LINE', 'MESSENGER', 'TELEGRAM', 'VOICE_AI']);
export type BotPlatform = z.infer<typeof BotPlatform>;

export const CampaignType = z.enum(['BIRTHDAY', 'WIN_BACK', 'FESTIVAL_PROMO', 'CUSTOM']);
export type CampaignType = z.infer<typeof CampaignType>;

export const Currency = z.enum(['LAK', 'THB', 'USD']);
export type Currency = z.infer<typeof Currency>;

export const HomeServiceJobStatus = z.enum([
  'MATCHING',
  'ASSIGNED',
  'EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_MATCH',
]);
export type HomeServiceJobStatus = z.infer<typeof HomeServiceJobStatus>;
