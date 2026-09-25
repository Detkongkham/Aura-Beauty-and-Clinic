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
import { requireUploadSignature, signedUploadUrls } from './storage/signedUrl.js';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  // ສະລິບໂອນເງິນ (base64 ຈາກກ້ອງມືຖື, ສູງສຸດ SLIP_MAX_BYTES=8MB → ~11MB) ໃຫຍ່ກວ່າ 2mb — ຂະຫຍາຍ limit ສະເພາະ
  // route ນີ້ ແລະ ຕ້ອງມາກ່ອນ parser ກາງ (ອັນທຳອິດທີ່ parse ສຳເລັດຈະຕັ້ງ req.body, ອັນຖັດໄປຂ້າມ).
  app.use('/api/v1/payments-treasury/payments/:id/slips', express.json({ limit: '12mb' }));
  // H2 — ຮູບຫຼັກຖານການປັບສະຕັອກ (≤ 5MB → base64 ~7MB).
  app.use('/api/v1/stock-movements/adjust', express.json({ limit: '8mb' }));
  // ຮູບບໍລິການ (≤ 5MB → base64 ~7MB).
  app.use('/api/v1/services/images', express.json({ limit: '8mb' }));
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
  // these from web-admin's own origin (different port ⇒ different origin), so relax just this route.
  // Files are private (slips, receipts, chat media…) — access needs the short-lived signed URL the API
  // hands out (storage/signedUrl.ts), so being embeddable cross-origin leaks nothing on its own.
  app.use(
    '/uploads',
    requireUploadSignature,
    (_req, res, next) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    // cacheControl off so requireUploadSignature's private max-age (bounded by the signature) stands
    express.static(env.STORAGE_LOCAL_DIR, { cacheControl: false }),
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'abcp-backend', ts: new Date().toISOString() });
  });

  app.use('/api/v1', apiLimiter, auditLog, signedUploadUrls, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
