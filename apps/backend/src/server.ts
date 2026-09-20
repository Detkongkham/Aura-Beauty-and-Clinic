import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { connectRedis, disconnectRedis } from './config/redis.js';
import { closeQueues } from './jobs/queues.js';
import { closeSocketServer, createSocketServer } from './realtime/socket.js';

async function bootstrap(): Promise<void> {
  await connectDatabase();
  await connectRedis().catch((err) => logger.warn({ err }, 'Redis ບໍ່ພ້ອມ — queue ຈະ retry'));

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 abcp-backend ຮັບຟັງທີ່ http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });
  createSocketServer(server);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'graceful shutdown ເລີ່ມ');
    server.close();
    await closeSocketServer().catch(() => undefined);
    await closeQueues().catch(() => undefined);
    await disconnectRedis();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'bootstrap ລົ້ມເຫຼວ');
  process.exit(1);
});
