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
  // 2mb headroom: the business logo is stored inline as a resized PNG data-URL
  // in PUT /settings (no object storage yet).
  app.use(express.json({ limit: '2mb' }));
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
