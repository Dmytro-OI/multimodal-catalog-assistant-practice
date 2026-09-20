import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';

export function telegramWebhook({ secret, enqueue }) {
  const router = Router();
  router.post('/webhooks/telegram', async (req, res) => {
    const supplied = Buffer.from(req.get('x-telegram-bot-api-secret-token') || '');
    const expected = Buffer.from(secret);
    if (!expected.length || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return res.sendStatus(401);
    }
    if (!Number.isSafeInteger(req.body?.update_id)) return res.sendStatus(400);
    try {
      await enqueue(req.body);
      return res.sendStatus(200);
    } catch {
      return res.sendStatus(503);
    }
  });
  return router;
}
