import { logger } from '../../../utils/logger';
import { fetchJson, getNagadConfig, type NagadConfig } from './config';
import { nagadChallenge, nagadDateTime, nagadDecrypt, nagadEncrypt, nagadSign, nagadVerify } from './verify';
import type { FeeGatewayAdapter, GatewayInitParams, GatewayInitResult, GatewayVerifyResult } from './types';

// =============================================================================
// Nagad Online Payment API (v-0.2.0).
//   1. initialize: POST /api/dfs/check-out/initialize/{merchantId}/{orderId}
//      sensitiveData = RSA(nagadPub, {merchantId, datetime, orderId, challenge})
//      signature     = SHA256withRSA(merchantPriv, same JSON)
//      → response sensitiveData decrypted with merchantPriv → paymentReferenceId + challenge
//   2. complete:  POST /api/dfs/check-out/complete/{paymentReferenceId}
//      → callBackUrl (the Nagad hosted checkout page)
//   3. customer returns to merchantCallbackURL?payment_ref_id=..&order_id=..&status=..
//   4. verify:    GET  /api/dfs/verify/payment/{paymentReferenceId}  ← crediting is based on this
// =============================================================================

function headers(cfg: NagadConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-KM-Api-Version': 'v-0.2.0',
    'X-KM-IP-V4': cfg.clientIp,
    'X-KM-Client-Type': 'PC_WEB',
  };
}

/** Maps Nagad's verify response onto our verification shape. Pure. */
export function mapNagadVerifyResponse(json: any): Omit<GatewayVerifyResult, 'reachable'> {
  const status = json?.status as string | undefined;
  return {
    success: status === 'Success',
    status,
    amount: json?.amount !== undefined ? parseFloat(json.amount) : undefined,
    // Nagad settles in BDT only; the verify response has no currency field.
    currency: 'BDT',
    tranId: json?.orderId,
    gatewayRef: json?.issuerPaymentRefNo || json?.paymentRefId,
    gatewayPaymentId: json?.paymentRefId,
    message: json?.message ?? json?.statusCode,
    raw: json,
  };
}

export const NagadFeeAdapter: FeeGatewayAdapter & {
  verifyByReference(paymentRefId: string): Promise<GatewayVerifyResult>;
} = {
  name: 'NAGAD',

  async initiate(params: GatewayInitParams): Promise<GatewayInitResult> {
    const cfg = getNagadConfig();
    if (!cfg) return { ok: false, message: 'Nagad is not configured' };

    try {
      const datetime = nagadDateTime();
      const initPayload = JSON.stringify({
        merchantId: cfg.merchantId,
        datetime,
        orderId: params.tranId,
        challenge: nagadChallenge(),
      });
      const init = await fetchJson(
        `${cfg.baseUrl}/api/dfs/check-out/initialize/${encodeURIComponent(cfg.merchantId)}/${encodeURIComponent(params.tranId)}?locale=EN`,
        {
          method: 'POST',
          headers: headers(cfg),
          body: JSON.stringify({
            dateTime: datetime,
            sensitiveData: nagadEncrypt(initPayload, cfg.nagadPublicKey),
            signature: nagadSign(initPayload, cfg.merchantPrivateKey),
          }),
        },
      );
      if (!init?.sensitiveData || !init?.signature) {
        return { ok: false, message: init?.message || 'Nagad rejected the initialize request', raw: init };
      }

      const decrypted = nagadDecrypt(init.sensitiveData, cfg.merchantPrivateKey);
      if (!nagadVerify(decrypted, init.signature, cfg.nagadPublicKey)) {
        logger.error('Nagad initialize response signature did not verify', { tranId: params.tranId });
        return { ok: false, message: 'Nagad response signature verification failed' };
      }
      const { paymentReferenceId, challenge } = JSON.parse(decrypted) as { paymentReferenceId: string; challenge: string };

      const completePayload = JSON.stringify({
        merchantId: cfg.merchantId,
        orderId: params.tranId,
        currencyCode: '050',
        amount: params.amount.toFixed(2),
        challenge,
      });
      const complete = await fetchJson(`${cfg.baseUrl}/api/dfs/check-out/complete/${encodeURIComponent(paymentReferenceId)}`, {
        method: 'POST',
        headers: headers(cfg),
        body: JSON.stringify({
          sensitiveData: nagadEncrypt(completePayload, cfg.nagadPublicKey),
          signature: nagadSign(completePayload, cfg.merchantPrivateKey),
          merchantCallbackURL: `${params.callbackBase}/callback`,
          additionalMerchantInfo: { invoiceNo: params.invoiceNo },
        }),
      });

      const ok = complete?.status === 'Success' && typeof complete?.callBackUrl === 'string';
      return {
        ok,
        paymentUrl: ok ? complete.callBackUrl : undefined,
        gatewayPaymentId: paymentReferenceId,
        message: ok ? 'Nagad checkout created' : complete?.message || 'Nagad rejected the checkout request',
        raw: { status: complete?.status, message: complete?.message, paymentReferenceId },
      };
    } catch (error) {
      logger.error('Nagad fee checkout initiation failed', {
        tranId: params.tranId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, message: 'Failed to reach Nagad gateway' };
    }
  },

  async verifyByReference(paymentRefId: string): Promise<GatewayVerifyResult> {
    const cfg = getNagadConfig();
    if (!cfg) return { reachable: false, success: false, raw: null, message: 'Nagad is not configured' };
    try {
      const json = await fetchJson(`${cfg.baseUrl}/api/dfs/verify/payment/${encodeURIComponent(paymentRefId)}`, {
        method: 'GET',
        headers: headers(cfg),
      });
      return { reachable: true, ...mapNagadVerifyResponse(json) };
    } catch (error) {
      logger.error('Nagad payment verification failed', {
        paymentRefId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { reachable: false, success: false, raw: null };
    }
  },
};
