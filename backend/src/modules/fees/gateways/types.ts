// Shared contracts for the student-fee online payment gateway adapters
// (SSLCommerz, bKash tokenized checkout, Nagad). Each adapter is server-side
// only and never trusts the browser: a callback payload is only a *hint* —
// crediting always happens after the adapter re-verifies with the gateway.

export type FeeGatewayName = 'BKASH' | 'NAGAD' | 'SSLCOMMERZ';

export const FEE_GATEWAYS: FeeGatewayName[] = ['BKASH', 'NAGAD', 'SSLCOMMERZ'];

export interface GatewayInitParams {
  /** Our own unique transaction id (FeePaymentTransaction.gatewayTransactionId). */
  tranId: string;
  amount: number;
  currency: string;
  invoiceNo: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  /** e.g. `${APP_URL}/api/v1/fees/gateway/sslcommerz` — adapters append /success, /ipn, ... */
  callbackBase: string;
}

export interface GatewayInitResult {
  ok: boolean;
  message: string;
  paymentUrl?: string;
  /** Gateway-side session/payment id (bKash paymentID, Nagad paymentReferenceId, SSLCommerz sessionkey). */
  gatewayPaymentId?: string;
  raw?: unknown;
}

export interface GatewayVerifyResult {
  /** false = we could not get an answer from the gateway (network/parse error). Never change status then. */
  reachable: boolean;
  /** Gateway says the payment is complete/valid. */
  success: boolean;
  amount?: number;
  currency?: string;
  /** The merchant transaction id the gateway associates with this payment (our tranId). */
  tranId?: string;
  /** Gateway's final, globally-unique reference (SSLCommerz val_id, bKash trxID, Nagad issuerPaymentRefNo). Used for replay protection. */
  gatewayRef?: string;
  gatewayPaymentId?: string;
  status?: string;
  message?: string;
  raw: unknown;
}

export interface FeeGatewayAdapter {
  name: FeeGatewayName;
  initiate(params: GatewayInitParams): Promise<GatewayInitResult>;
}
