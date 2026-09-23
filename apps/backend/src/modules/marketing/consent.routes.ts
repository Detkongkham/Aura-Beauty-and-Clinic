import { Router } from 'express';
import { smsInboundSchema, unsubscribeSchema, updateConsentSchema } from '@abcp/shared-types';
import { env } from '../../config/env.js';
import { verifyLineSignature } from '../../services/channels.js';
import { ApiError } from '../../utils/ApiError.js';
import { authGuard } from '../../middlewares/authGuard.js';
import { authLimiter } from '../../middlewares/rateLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as consent from './consent.service.js';

export const consentRouter: Router = Router();

/** POST /consent/unsubscribe — ສາທາລະນະ (ລິ້ງໃນຂໍ້ຄວາມ); token ລາຍເຊັນ HMAC ຢືນຢັນຕົວຕົນ. */
consentRouter.post(
  '/unsubscribe',
  authLimiter,
  validateRequest({ body: unsubscribeSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await consent.unsubscribeByToken(req.body.token) });
  }),
);

/** GET /consent/me — ຄວາມຍິນຍອມຂອງຕົນເອງທຸກຊ່ອງທາງ. */
consentRouter.get(
  '/me',
  authGuard,
  asyncHandler(async (req, res) => {
    res.json({ data: await consent.getPreferences(req.auth!.sub) });
  }),
);

/** PUT /consent/me — ເປີດ/ປິດໂປຣໂມຊັນຕໍ່ຊ່ອງທາງ. */
consentRouter.put(
  '/me',
  authGuard,
  validateRequest({ body: updateConsentSchema }),
  asyncHandler(async (req, res) => {
    await consent.setConsent(req.auth!.sub, req.body.channel, req.body.granted, {
      source: 'profile',
      actorId: req.auth!.sub,
      ipAddress: req.ip,
    });
    res.json({ data: await consent.getPreferences(req.auth!.sub) });
  }),
);

/** POST /consent/me/line-link — ລະຫັດຜູກ LINE (ສົ່ງລະຫັດໃຫ້ OA ເປັນຂໍ້ຄວາມ). */
consentRouter.post(
  '/me/line-link',
  authGuard,
  asyncHandler(async (req, res) => {
    res.json({ data: await consent.generateLineLinkCode(req.auth!.sub) });
  }),
);

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * GET /consent/unsubscribe?token= — ລິ້ງໃນ SMS/ອີເມວ (ເປີດໃນ browser). ຜົນເປັນ HTML ງ່າຍໆ.
 * (ອີເມວສະແກນລິ້ງອັດຕະໂນມັດ ອາດກົດລິ້ງແທນຜູ້ໃຊ້ — ການຖອນຕົວເປັນທິດທາງປອດໄພ ຈຶ່ງຍອມຮັບໄດ້.)
 */
consentRouter.get(
  '/unsubscribe',
  authLimiter,
  asyncHandler(async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    let msg: string;
    try {
      const r = await consent.unsubscribeByToken(token);
      msg = `ຍົກເລີກຮັບໂປຣໂມຊັນທາງ ${r.channel} ແລ້ວ. ທ່ານຍັງຈະໄດ້ຮັບການແຈ້ງເຕືອນນັດໝາຍ ແລະ ໃບຮັບເງິນຕາມປົກກະຕິ.`;
    } catch (err) {
      res.status(400);
      msg = err instanceof ApiError ? err.message : 'ລິ້ງບໍ່ຖືກຕ້ອງ';
    }
    res
      .type('html')
      .send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title><body style="font-family:sans-serif;max-width:480px;margin:48px auto;padding:0 16px;line-height:1.6"><p>${escapeHtml(msg)}</p></body>`);
  }),
);

/** POST /consent/sms/inbound — SMS gateway forward ຂໍ້ຄວາມຕອບກັບ (STOP). ຢືນຢັນດ້ວຍ header secret. */
consentRouter.post(
  '/sms/inbound',
  validateRequest({ body: smsInboundSchema }),
  asyncHandler(async (req, res) => {
    const given = req.header('x-sms-inbound-secret');
    if (!env.SMS_INBOUND_SECRET || given !== env.SMS_INBOUND_SECRET) throw ApiError.forbidden('inbound secret ບໍ່ຖືກຕ້ອງ');
    res.json({ data: await consent.handleSmsInbound(req.body) });
  }),
);

/** POST /consent/line/webhook — LINE Messaging API webhook (ກວດ X-Line-Signature ກັບ raw body). */
consentRouter.post(
  '/line/webhook',
  asyncHandler(async (req, res) => {
    if (!verifyLineSignature(req.rawBody, req.header('x-line-signature'))) throw ApiError.forbidden('LINE signature ບໍ່ຖືກຕ້ອງ');
    const events = Array.isArray(req.body?.events) ? req.body.events : [];
    res.json({ data: await consent.handleLineEvents(events) });
  }),
);
