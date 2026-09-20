import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { startWorkers } from './worker.js';

/** Entry point ຂອງ worker process: `node dist/jobs/main.js` ຫຼື `tsx src/jobs/main.ts`. */
async function main(): Promise<void> {
  await connectDatabase();
  const workers = startWorkers();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'worker shutting down');
    await Promise.all(workers.map((w) => w.close()));
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'worker failed to start');
  process.exit(1);
});
