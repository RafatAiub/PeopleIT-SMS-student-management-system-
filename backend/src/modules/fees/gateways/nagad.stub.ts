import { env } from '../../../config/env';
import { PaymentGatewayResponse } from './bkash.stub';

export class NagadGateway {
  static async initiatePayment(
    invoiceId: string,
    amount: number,
    callbackUrl: string
  ): Promise<PaymentGatewayResponse> {
    if (!env.NAGAD_ENABLED) {
      return {
        success: false,
        message: 'Nagad payment gateway is not enabled/configured for this institution.',
      };
    }

    return {
      success: true,
      message: 'Nagad payment URL successfully generated (Sandbox Mock)',
      paymentUrl: `${env.NAGAD_BASE_URL}/payment/create?invoice=${invoiceId}&amount=${amount}&callback=${encodeURIComponent(callbackUrl)}`,
    };
  }

  static async verifyPayment(paymentRefId: string): Promise<PaymentGatewayResponse> {
    if (!env.NAGAD_ENABLED) {
      return {
        success: false,
        message: 'Nagad is disabled',
      };
    }

    return {
      success: true,
      message: 'Nagad payment verified successfully (Sandbox Mock)',
      transactionId: `NGD_MOCK_${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    };
  }
}
