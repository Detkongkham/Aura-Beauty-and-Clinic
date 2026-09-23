import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { apiRouter } from './routes.js';
import { apiLimiter } from './middlewares/rateLimiter.js';
import { auditLog } from './middlewares/auditLog.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  // ສະລິບໂອນເງິນ (base64 ຈາກກ້ອງມືຖື, ສູງສຸດ SLIP_MAX_BYTES=8MB → ~11MB) ໃຫຍ່ກວ່າ 2mb — ຂະຫຍາຍ limit ສະເພາະ
  // route ນີ້ ແລະ ຕ້ອງມາກ່ອນ parser ກາງ (ອັນທຳອິດທີ່ parse ສຳເລັດຈະຕັ້ງ req.body, ອັນຖັດໄປຂ້າມ).
  app.use('/api/v1/payments-treasury/payments/:id/slips', express.json({ limit: '12mb' }));
  // 2mb headroom: the business logo is stored inline as a resized PNG data-URL
  // in PUT /settings (no object storage yet).
  // rawBody ເກັບໄວ້ເພື່ອກວດ HMAC ຂອງ payment webhook (ຕ້ອງເປັນ byte ຕົ້ນສະບັບ, ບໍ່ແມ່ນ JSON ທີ່ re-serialize).
  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(pinoHttp({ logger }));

  // helmet()'s default Cross-Origin-Resource-Policy: same-origin blocks <img>/<audio> tags loading
  // these from web-admin's own origin (different port ⇒ different origin) — uploads are meant to be
  // publicly embeddable, so relax just this route rather than helmet's app-wide defaults.
  app.use(
    '/uploads',
    (_req, res, next) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(env.STORAGE_LOCAL_DIR),
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'abcp-backend', ts: new Date().toISOString() });
  });

  app.use('/api/v1', apiLimiter, auditLog, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
