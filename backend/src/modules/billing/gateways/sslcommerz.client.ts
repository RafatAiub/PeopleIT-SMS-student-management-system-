import { env } from '../../../config/env';
import { logger } from '../../../utils/logger';

// =============================================================================
// SSLCommerz Gateway Client — REAL client for platform SUBSCRIPTION billing.
// This is a separate, new client from modules/fees/gateways/sslcommerz.stub.ts
// (which stays untouched and keeps mocking student-invoice payments).
// =============================================================================

export interface SslCommerzSessionResult {
  success: boolean;
  paymentUrl?: string;
  message: string;
}

export interface SslCommerzValidationResult {
  valid: boolean;
  amount?: number;
  currency?: string;
  tranId?: string;
  raw: unknown;
}

export interface InitiateSessionParams {
  tranId: string;
  amount: number;
  currency: string;
  successUrl: string;
  failUrl: string;
  cancelUrl: string;
  ipnUrl: string;
  customerName: string;
  customerEmail: string;
}

export class SslCommerzClient {
  static async initiateSession(params: InitiateSessionParams): Promise<SslCommerzSessionResult> {
    if (!env.SSLCOMMERZ_ENABLED) {
      return { success: false, message: 'SSLCommerz is not enabled' };
    }

    try {
      const body = new URLSearchParams({
        store_id: env.SSLCOMMERZ_STORE_ID ?? '',
        store_passwd: env.SSLCOMMERZ_STORE_PASSWORD ?? '',
        total_amount: String(params.amount),
        currency: params.currency,
        tran_id: params.tranId,
        success_url: params.successUrl,
        fail_url: params.failUrl,
        cancel_url: params.cancelUrl,
        ipn_url: params.ipnUrl,
        cus_name: params.customerName,
        cus_email: params.customerEmail,
        cus_add1: 'N/A',
        cus_city: 'Dhaka',
        cus_country: 'Bangladesh',
        cus_phone: 'N/A',
        shipping_method: 'NO',
        product_name: 'SMS Subscription',
        product_category: 'Service',
        product_profile: 'general',
      });

      const response = await fetch(`${env.SSLCOMMERZ_BASE_URL}/gwprocess/v4/api.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      const json: any = await response.json();

      return {
        success: json?.status === 'SUCCESS',
        paymentUrl: json?.GatewayPageURL,
        message: json?.failedreason || json?.status || 'OK',
      };
    } catch (error) {
      logger.error('SSLCommerz initiateSession failed', {
        error: error instanceof Error ? error.message : String(error),
        tranId: params.tranId,
      });
      return { success: false, message: 'Failed to reach SSLCommerz gateway' };
    }
  }

  static async validateTransaction(valId: string): Promise<SslCommerzValidationResult> {
    if (!env.SSLCOMMERZ_ENABLED) {
      return { valid: false, raw: null };
    }

    try {
      const query = new URLSearchParams({
        val_id: valId,
        store_id: env.SSLCOMMERZ_STORE_ID ?? '',
        store_passwd: env.SSLCOMMERZ_STORE_PASSWORD ?? '',
        format: 'json',
      });

      const response = await fetch(
        `${env.SSLCOMMERZ_BASE_URL}/validator/api/validationserverAPI.php?${query.toString()}`,
        { method: 'GET' },
      );

      const json: any = await response.json();
      const status = json?.status;

      return {
        valid: status === 'VALID' || status === 'VALIDATED',
        amount: json?.amount !== undefined ? parseFloat(json.amount) : undefined,
        currency: json?.currency,
        tranId: json?.tran_id,
        raw: json,
      };
    } catch (error) {
      logger.error('SSLCommerz validateTransaction failed', {
        error: error instanceof Error ? error.message : String(error),
        valId,
      });
      return { valid: false, raw: null };
    }
  }

  // ⚠️ Field names below are sourced from SSLCommerz developer documentation,
  // NOT verified against a live sandbox refund call (unlike initiateSession/
  // validateTransaction above, which were verified with a real sandbox
  // payment). The full raw response is logged via logger.info on every call
  // (not just on error) specifically so the first real refund attempt can be
  // used to visually confirm these field names before relying on this in
  // production.
  static async initiateRefund(params: {
    bankTranId: string;
    refundTransId: string;
    refundAmount: number;
    refundRemarks: string;
    refeId?: string;
  }): Promise<{ success: boolean; refundRefId?: string; gatewayStatus?: string; errorReason?: string; raw: unknown }> {
    if (!env.SSLCOMMERZ_ENABLED) {
      return { success: false, errorReason: 'SSLCommerz is not enabled', raw: null };
    }

    try {
      const query = new URLSearchParams({
        bank_tran_id: params.bankTranId,
        refund_trans_id: params.refundTransId,
        store_id: env.SSLCOMMERZ_STORE_ID ?? '',
        store_passwd: env.SSLCOMMERZ_STORE_PASSWORD ?? '',
        refund_amount: String(params.refundAmount),
        refund_remarks: params.refundRemarks,
        format: 'json',
        ...(params.refeId ? { refe_id: params.refeId } : {}),
      });

      const response = await fetch(
        `${env.SSLCOMMERZ_BASE_URL}/validator/api/merchantTransIDvalidationAPI.php?${query.toString()}`,
        { method: 'GET' },
      );

      const json: any = await response.json();

      logger.info('SSLCommerz initiateRefund raw response', {
        bankTranId: params.bankTranId,
        refundTransId: params.refundTransId,
        raw: json,
      });

      const apiConnect = json?.APIConnect;
      const status = json?.status;
      const success = apiConnect === 'DONE' && (status === 'success' || status === 'processing');

      return {
        success,
        refundRefId: json?.refund_ref_id,
        gatewayStatus: status,
        errorReason: json?.errorReason,
        raw: json,
      };
    } catch (error) {
      logger.error('SSLCommerz initiateRefund failed', {
        error: error instanceof Error ? error.message : String(error),
        bankTranId: params.bankTranId,
        refundTransId: params.refundTransId,
      });
      return { success: false, errorReason: 'Failed to reach SSLCommerz gateway', raw: null };
    }
  }

  // ⚠️ Field names below are sourced from SSLCommerz developer documentation,
  // NOT verified against a live sandbox refund call (unlike initiateSession/
  // validateTransaction above, which were verified with a real sandbox
  // payment). The full raw response is logged via logger.info on every call
  // (not just on error) specifically so the first real refund-status query
  // can be used to visually confirm these field names before relying on
  // this in production.
  static async queryRefund(refundRefId: string): Promise<{ status?: string; refundedOn?: string; raw: unknown }> {
    if (!env.SSLCOMMERZ_ENABLED) {
      return { raw: null };
    }

    try {
      const query = new URLSearchParams({
        refund_ref_id: refundRefId,
        store_id: env.SSLCOMMERZ_STORE_ID ?? '',
        store_passwd: env.SSLCOMMERZ_STORE_PASSWORD ?? '',
        format: 'json',
      });

      const response = await fetch(
        `${env.SSLCOMMERZ_BASE_URL}/validator/api/merchantTransIDvalidationAPI.php?${query.toString()}`,
        { method: 'GET' },
      );

      const json: any = await response.json();

      logger.info('SSLCommerz queryRefund raw response', { refundRefId, raw: json });

      return {
        status: json?.status,
        refundedOn: json?.refunded_on,
        raw: json,
      };
    } catch (error) {
      logger.error('SSLCommerz queryRefund failed', {
        error: error instanceof Error ? error.message : String(error),
        refundRefId,
      });
      return { raw: null };
    }
  }
}
