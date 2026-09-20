import { PrismaClient } from '@prisma/client';
import { env } from './env.js';
import { logger } from './logger.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Force every connection's session timezone to UTC.
 *
 * Our datetime columns are `timestamp without time zone` holding UTC instants.
 * Whenever one of those is compared against a `timestamptz` — which is exactly
 * what Prisma binds a JS `Date` as in `$queryRaw` — Postgres reconciles the two
 * using the **session** timezone. This deployment's server was initialised with
 * `TimeZone = 'Asia/Vientiane'` (baked into the data directory), so those
 * comparisons silently landed 7 hours off and matched the wrong rows, with no
 * error raised. That had been quietly defeating the double-booking guard.
 *
 * Pinning the session here fixes the whole class at the source, on every
 * machine, without depending on anyone's `.env` or on how the database
 * container happened to be initialised. `tsParam()` in utils/dateHelpers stays
 * as the explicit, belt-and-braces form at each call site.
 *
 * Application code never relies on the session timezone for display: all
 * user-facing time goes through the Asia/Vientiane helpers.
 */
function withUtcSession(url: string): string {
  try {
    const parsed = new URL(url);
    const existing = parsed.searchParams.get('options');
    if (existing?.includes('timezone')) return url;
    parsed.searchParams.set('options', `${existing ? `${existing} ` : ''}-c timezone=UTC`);
    return parsed.toString();
  } catch {
    // Not a URL we can parse (e.g. a socket DSN) — leave it alone; tsParam()
    // still keeps every raw comparison correct.
    return url;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isProd ? ['warn', 'error'] : ['warn', 'error'],
    datasources: { db: { url: withUtcSession(env.DATABASE_URL) } },
  });

if (!env.isProd) globalForPrisma.prisma = prisma;

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  const [tz] = await prisma.$queryRaw<{ tz: string }[]>`SELECT current_setting('TimeZone') AS tz`;
  if (tz?.tz !== 'UTC') {
    // Not fatal — tsParam() keeps raw comparisons correct either way — but it
    // means the connection string could not be pinned, which is worth knowing.
    logger.warn({ timeZone: tz?.tz }, '⚠️  DB session timezone is not UTC');
  }
  logger.info('✅ PostgreSQL ເຊື່ອມຕໍ່ສຳເລັດ');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('🔌 PostgreSQL ຕັດການເຊື່ອມຕໍ່');
}
