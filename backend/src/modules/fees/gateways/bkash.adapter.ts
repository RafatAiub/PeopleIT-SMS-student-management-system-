import { logger } from '../../../utils/logger';
import { fetchJson, getBkashConfig, type BkashConfig } from './config';
import type { FeeGatewayAdapter, GatewayInitParams, GatewayInitResult, GatewayVerifyResult } from './types';

// =============================================================================
// bKash Tokenized Checkout (v1.2.0-beta).
//   grant token → create payment (returns bkashURL + paymentID) → customer pays
//   → bKash redirects to callbackURL?paymentID=..&status=success|failure|cancel
//   → we EXECUTE the payment server-side (this is what actually captures it)
//   → on an ambiguous execute result we fall back to payment/status.
// The id_token is cached in-process for 50 minutes (bKash issues 1h tokens),
// one cache entry per merchant (base URL + app key).
//
// P1: the client is built by createBkashClient(getConfig) so platform billing
// (PeopleNIT's own merchant, PLATFORM_BKASH_* env) and school fees (BKASH_*)
// share one implementation. BkashFeeAdapter below is unchanged in behaviour.
// =============================================================================

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function grantToken(cfg: BkashConfig): Promise<string> {
  const cacheKey = `${cfg.baseUrl}|${cfg.appKey}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }
  const json = await fetchJson(`${cfg.baseUrl}/tokenized/checkout/token/grant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      username: cfg.username,
      password: cfg.password,
    },
    body: JSON.stringify({ app_key: cfg.appKey, app_secret: cfg.appSecret }),
  });
  if (!json?.id_token) {
    throw new Error(`bKash token grant failed: ${json?.statusMessage || json?.msg || 'no id_token'}`);
  }
  tokenCache.set(cacheKey, { token: json.id_token, expiresAt: Date.now() + 50 * 60 * 1000 });
  return json.id_token;
}

async function authedPost(cfg: BkashConfig, path: string, body: Record<string, unknown>): Promise<any> {
  const token = await grantToken(cfg);
  return fetchJson(`${cfg.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: token,
      'X-APP-Key': cfg.appKey,
    },
    body: JSON.stringify(body),
  });
}

/** Maps a bKash execute/status response onto our verification shape. Pure. */
export function mapBkashPaymentResponse(json: any): Omit<GatewayVerifyResult, 'reachable'> {
  const status = json?.transactionStatus as string | undefined;
  return {
    success: status === 'Completed' && (json?.statusCode === undefined || json?.statusCode === '0000'),
    status: status ?? json?.statusMessage,
    amount: json?.amount !== undefined ? parseFloat(json.amount) : undefined,
    currency: json?.currency,
    tranId: json?.merchantInvoiceNumber,
    gatewayRef: json?.trxID,
    gatewayPaymentId: json?.paymentID,
    message: json?.statusMessage,
    raw: json,
  };
}

export interface BkashClient {
  initiate(params: GatewayInitParams): Promise<GatewayInitResult>;
  executeOrQuery(paymentId: string): Promise<GatewayVerifyResult>;
}

/**
 * A bKash tokenized-checkout client bound to one set of merchant credentials.
 * `getConfig` is read on every call (never cached), so credentials can change
 * without a restart; null = not configured.
 */
export function createBkashClient(getConfig: () => BkashConfig | null, label = 'bKash'): BkashClient {
  return {
    async initiate(params: GatewayInitParams): Promise<GatewayInitResult> {
      const cfg = getConfig();
      if (!cfg) return { ok: false, message: 'bKash is not configured' };
      try {
        const json = await authedPost(cfg, '/tokenized/checkout/create', {
          mode: '0011',
          payerReference: params.invoiceNo,
          callbackURL: `${params.callbackBase}/callback`,
          amount: params.amount.toFixed(2),
          currency: params.currency,
          intent: 'sale',
          merchantInvoiceNumber: params.tranId,
        });
        const ok = json?.statusCode === '0000' && typeof json?.bkashURL === 'string';
        return {
          ok,
          paymentUrl: ok ? json.bkashURL : undefined,
          gatewayPaymentId: json?.paymentID,
          message: ok ? 'bKash payment created' : json?.statusMessage || 'bKash rejected the payment request',
          raw: { statusCode: json?.statusCode, statusMessage: json?.statusMessage, paymentID: json?.paymentID },
        };
      } catch (error) {
        logger.error(`${label} payment create failed`, {
          tranId: params.tranId,
          error: error instanceof Error ? error.message : String(error),
        });
        return { ok: false, message: 'Failed to reach bKash gateway' };
      }
    },

    async executeOrQuery(paymentId: string): Promise<GatewayVerifyResult> {
      const cfg = getConfig();
      if (!cfg) return { reachable: false, success: false, raw: null, message: 'bKash is not configured' };

      let executed: any = null;
      try {
        executed = await authedPost(cfg, '/tokenized/checkout/execute', { paymentID: paymentId });
        const mapped = mapBkashPaymentResponse(executed);
        if (mapped.success) return { reachable: true, ...mapped };
      } catch (error) {
        logger.warn(`${label} execute call failed — falling back to payment status query`, {
          paymentId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Execute either failed, timed out, or said "already completed" (a
      // duplicate callback) — the status query is the source of truth.
      try {
        const status = await authedPost(cfg, '/tokenized/checkout/payment/status', { paymentID: paymentId });
        return { reachable: true, ...mapBkashPaymentResponse(status) };
      } catch (error) {
        logger.error(`${label} payment status query failed`, {
          paymentId,
          error: error instanceof Error ? error.message : String(error),
        });
        return { reachable: false, success: false, raw: executed };
      }
    },
  };
}

const feeClient = createBkashClient(getBkashConfig, 'bKash fee');

export const BkashFeeAdapter: FeeGatewayAdapter & {
  executeOrQuery(paymentId: string): Promise<GatewayVerifyResult>;
} = {
  name: 'BKASH',
  initiate: (params) => feeClient.initiate(params),
  executeOrQuery: (paymentId) => feeClient.executeOrQuery(paymentId),
};
