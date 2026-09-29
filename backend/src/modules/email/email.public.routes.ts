import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { handleBrevoEvent, type BrevoWebhookEvent } from './webhook/brevo';
import { applyUnsubscribe, verifyUnsubscribeToken } from './unsubscribe';

// =============================================================================
// Public (unauthenticated) email endpoints — mount in app.ts BEFORE the
// authenticated routers, and exempt from the frontend-origin CORS allow-list
// and the global rate limiter (same treatment as the fee/billing gateway
// callbacks — see feeGateway.routes.ts):
//
//   POST /api/v1/email/webhooks/brevo?token=<EMAIL_WEBHOOK_TOKEN>
//        Brevo calls this directly; never a browser/XHR request.
//   GET  /api/v1/email/unsubscribe?token=...   simple confirmation page
//   POST /api/v1/email/unsubscribe             one-click (RFC 8058
//        List-Unsubscribe-Post) — mail clients POST here with no body beyond
//        `List-Unsubscribe=One-Click`; token travels in the query string.
// =============================================================================

export const emailPublicRouter = Router();

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

emailPublicRouter.post('/webhooks/brevo', async (req: Request, res: Response) => {
  const configured = env.EMAIL_WEBHOOK_TOKEN;
  if (!configured) {
    logger.warn('Brevo webhook called but EMAIL_WEBHOOK_TOKEN is not set — rejecting');
    res.status(503).json({ success: false, message: 'Webhook not configured' });
    return;
  }

  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!timingSafeEqualStrings(token, configured)) {
    res.status(401).json({ success: false, message: 'Invalid webhook token' });
    return;
  }

  try {
    const events: BrevoWebhookEvent[] = Array.isArray(req.body) ? req.body : [req.body];
    for (const event of events) {
      await handleBrevoEvent(event);
    }
    res.status(200).json({ success: true });
  } catch (error) {
    // Ack anyway — Brevo retries on non-2xx, and a malformed/unexpected
    // payload will never become processable by retrying it.
    logger.error('Brevo webhook processing failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(200).json({ success: true });
  }
});

function unsubscribePage(opts: { state: 'confirm' | 'done' | 'invalid'; token: string; email?: string }): string {
  const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  const body =
    opts.state === 'invalid'
      ? `<h1>Link no longer valid</h1><p>This unsubscribe link is invalid or has already been used.</p>`
      : opts.state === 'done'
        ? `<h1>You're unsubscribed</h1><p>${escape(opts.email ?? 'This address')} will no longer receive bulk emails (newsletters, campaigns, reminders). You'll still receive account security mail and receipts.</p>`
        : `<h1>Unsubscribe from bulk emails?</h1><p>${escape(opts.email ?? 'This address')} will stop receiving newsletters, campaigns and reminder emails. Security and receipt emails are unaffected.</p>
           <form method="POST" action="/api/v1/email/unsubscribe?token=${encodeURIComponent(opts.token)}">
             <button type="submit" style="background:#c2550a;color:#fff;border:none;border-radius:6px;padding:12px 24px;font-size:15px;cursor:pointer;">Unsubscribe</button>
           </form>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>Unsubscribe</title></head>
    <body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:60px auto;padding:0 20px;color:#111827;">${body}</body></html>`;
}

emailPublicRouter.get('/unsubscribe', (req: Request, res: Response) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const payload = verifyUnsubscribeToken(token);
  res.status(200).type('html').send(unsubscribePage(payload ? { state: 'confirm', token, email: payload.email } : { state: 'invalid', token }));
});

emailPublicRouter.post('/unsubscribe', async (req: Request, res: Response) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const result = await applyUnsubscribe(token, 'unsubscribe-link');

  // A one-click (List-Unsubscribe-Post) request wants a bare 2xx, not a page.
  const isOneClick = req.is('application/x-www-form-urlencoded') && Object.keys(req.body ?? {}).length === 0;
  if (isOneClick) {
    res.status(result.ok ? 200 : 400).end();
    return;
  }

  res.status(200).type('html').send(unsubscribePage(result.ok ? { state: 'done', token, email: result.email } : { state: 'invalid', token }));
});

export default emailPublicRouter;
