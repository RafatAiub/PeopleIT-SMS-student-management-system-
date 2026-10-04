import { logger } from '../../../utils/logger';
import { fetchJson, getSslCommerzConfig } from './config';
import type { FeeGatewayAdapter, GatewayInitParams, GatewayInitResult, GatewayVerifyResult } from './types';

// =============================================================================
// SSLCommerz (student fees). Same request/validation contract as the working
// platform-billing client (modules/billing/gateways/sslcommerz.client.ts), but
// keyed on credential presence instead of SSLCOMMERZ_ENABLED and with request
// timeouts. Crediting only ever follows validateByValId().
// =============================================================================

export const SslCommerzFeeAdapter: FeeGatewayAdapter & {
  validateByValId(valId: string): Promise<GatewayVerifyResult>;
} = {
  name: 'SSLCOMMERZ',

  async initiate(params: GatewayInitParams): Promise<GatewayInitResult> {
    const cfg = getSslCommerzConfig();
    if (!cfg) return { ok: false, message: 'SSLCommerz is not configured' };

    try {
      const body = new URLSearchParams({
        store_id: cfg.storeId,
        store_passwd: cfg.storePassword,
        total_amount: params.amount.toFixed(2),
        currency: params.currency,
        tran_id: params.tranId,
        success_url: `${params.callbackBase}/success`,
        fail_url: `${params.callbackBase}/fail`,
        cancel_url: `${params.callbackBase}/cancel`,
        ipn_url: `${params.callbackBase}/ipn`,
        cus_name: params.customerName || 'Student',
        cus_email: params.customerEmail || 'noreply@example.com',
        cus_add1: 'N/A',
        cus_city: 'Dhaka',
        cus_country: 'Bangladesh',
        cus_phone: params.customerPhone || 'N/A',
        shipping_method: 'NO',
        product_name: `School fee ${params.invoiceNo}`,
        product_category: 'Education',
        product_profile: 'non-physical-goods',
        value_a: params.invoiceNo,
      });

      const json = await fetchJson(`${cfg.baseUrl}/gwprocess/v4/api.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      const ok = json?.status === 'SUCCESS' && typeof json?.GatewayPageURL === 'string';
      return {
        ok,
        paymentUrl: ok ? json.GatewayPageURL : undefined,
        gatewayPaymentId: typeof json?.sessionkey === 'string' ? json.sessionkey : undefined,
        message: ok ? 'SSLCommerz session created' : json?.failedreason || 'SSLCommerz rejected the session request',
        raw: { status: json?.status, failedreason: json?.failedreason, sessionkey: json?.sessionkey },
      };
    } catch (error) {
      logger.error('SSLCommerz fee session initiation failed', {
        tranId: params.tranId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, message: 'Failed to reach SSLCommerz gateway' };
    }
  },

  async validateByValId(valId: string): Promise<GatewayVerifyResult> {
    const cfg = getSslCommerzConfig();
    if (!cfg) return { reachable: false, success: false, raw: null, message: 'SSLCommerz is not configured' };

    try {
      const query = new URLSearchParams({
        val_id: valId,
        store_id: cfg.storeId,
        store_passwd: cfg.storePassword,
        format: 'json',
      });
      const json = await fetchJson(`${cfg.baseUrl}/validator/api/validationserverAPI.php?${query.toString()}`, { method: 'GET' });
      const status = json?.status as string | undefined;
      return {
        reachable: true,
        success: status === 'VALID' || status === 'VALIDATED',
        status,
        amount: json?.amount !== undefined ? parseFloat(json.amount) : undefined,
        currency: json?.currency,
        tranId: json?.tran_id,
        gatewayRef: json?.val_id ?? valId,
        gatewayPaymentId: json?.bank_tran_id,
        raw: json,
      };
    } catch (error) {
      logger.error('SSLCommerz fee validation failed', {
        valId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { reachable: false, success: false, raw: null };
    }
  },
};
