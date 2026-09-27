import { Router, Request, Response } from 'express';
import { logger } from '../../../utils/logger';
import { env } from '../../../config/env';
import { gatewayFromSlug, handleGatewayCallback, type CallbackKind } from './onlinePayment.service';

// =============================================================================
// PUBLIC (unauthenticated) fee gateway callbacks — mount in app.ts BEFORE the
// authenticated fee router:
//   app.use('/api/v1/fees/gateway', feeGatewayRouter);
//
//   GET|POST /:gateway/ipn       server-to-server (SSLCommerz IPN) → always 200 JSON
//   GET|POST /:gateway/success   browser redirect                  → 302 to the frontend
//   GET|POST /:gateway/fail      browser redirect                  → 302
//   GET|POST /:gateway/cancel    browser redirect                  → 302
//   GET|POST /:gateway/callback  bKash / Nagad single callback URL → 302
//
// :gateway ∈ sslcommerz | bkash | nagad. Nothing here trusts the payload:
// every credit is re-verified with the gateway (see onlinePayment.service.ts).
// =============================================================================

export const feeGatewayRouter = Router();

const KINDS: CallbackKind[] = ['ipn', 'success', 'fail', 'cancel', 'callback'];

async function handle(req: Request, res: Response) {
  const gateway = gatewayFromSlug(req.params.gateway ?? '');
  const kind = req.params.kind as CallbackKind;
  const payload = { ...(req.query as Record<string, unknown>), ...((req.body as Record<string, unknown>) ?? {}) };

  if (!gateway || !KINDS.includes(kind)) {
    res.status(404).json({ success: false, message: 'Unknown gateway callback' });
    return;
  }

  let redirectTo = `${env.FRONTEND_URL}/fees?payment=failed`;
  try {
    redirectTo = await handleGatewayCallback(gateway, kind, payload);
  } catch (error) {
    logger.error('Unhandled error while processing fee gateway callback', {
      gateway,
      kind,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (kind === 'ipn') {
    // Always ack so the gateway doesn't retry forever; processing is idempotent anyway.
    res.status(200).json({ success: true });
    return;
  }
  res.redirect(303, redirectTo);
}

feeGatewayRouter.get('/:gateway/:kind', handle);
feeGatewayRouter.post('/:gateway/:kind', handle);

export default feeGatewayRouter;
