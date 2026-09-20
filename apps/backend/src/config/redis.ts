import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

/** connection ຫຼັກ (ໃຊ້ຮ່ວມສຳລັບ generic cache / pub-sub). */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

redis.on('error', (err) => logger.error({ err }, 'Redis error'));

/**
 * BullMQ ຕ້ອງການ connection ຂອງຕົນເອງ (maxRetriesPerRequest: null).
 * ໃຊ້ factory ນີ້ໃນ queue/worker ເພື່ອບໍ່ share connection ດຽວກັນ.
 */
export function createRedisConnection(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

export async function connectRedis(): Promise<void> {
  if (redis.status === 'wait') await redis.connect();
  logger.info('✅ Redis ເຊື່ອມຕໍ່ສຳເລັດ');
}

export async function disconnectRedis(): Promise<void> {
  redis.disconnect();
  logger.info('🔌 Redis ຕັດການເຊື່ອມຕໍ່');
}
