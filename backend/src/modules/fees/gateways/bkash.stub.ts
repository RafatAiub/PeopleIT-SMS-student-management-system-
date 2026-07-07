import { env } from '../../../config/env';

export interface PaymentGatewayResponse {
  success: boolean;
  message: string;
  paymentUrl?: string;
  transactionId?: string;
}

export class BkashGateway {
  static async initiatePayment(
    invoiceId: string,
    amount: number,
    callbackUrl: string
  ): Promise<PaymentGatewayResponse> {
    if (!env.BKASH_ENABLED) {
      return {
        success: false,
        message: 'bKash payment gateway is not enabled/configured for this institution.',
      };
    }

    // This is a stub mock implementation
    return {
      success: true,
      message: 'bKash payment URL successfully generated (Sandbox Mock)',
      paymentUrl: `${env.BKASH_BASE_URL}/payment/create?invoice=${invoiceId}&amount=${amount}&callback=${encodeURIComponent(callbackUrl)}`,
    };
  }

  static async executePayment(paymentId: string): Promise<PaymentGatewayResponse> {
    if (!env.BKASH_ENABLED) {
      return {
        success: false,
        message: 'bKash is disabled',
      };
    }

    return {
      success: true,
      message: 'bKash payment executed successfully (Sandbox Mock)',
      transactionId: `BKSH_MOCK_${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    };
  }
}
