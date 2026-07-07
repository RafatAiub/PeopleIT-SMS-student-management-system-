import { env } from '../../../config/env';
import { PaymentGatewayResponse } from './bkash.stub';

export class SslCommerzGateway {
  static async initiatePayment(
    invoiceId: string,
    amount: number,
    callbackUrl: string
  ): Promise<PaymentGatewayResponse> {
    if (!env.SSLCOMMERZ_ENABLED) {
      return {
        success: false,
        message: 'SSL Commerz payment gateway is not enabled/configured for this institution.',
      };
    }

    return {
      success: true,
      message: 'SSL Commerz session initiated successfully (Sandbox Mock)',
      paymentUrl: `${env.SSLCOMMERZ_BASE_URL}/gwprocess/v4/api.php?invoice=${invoiceId}&amount=${amount}&callback=${encodeURIComponent(callbackUrl)}`,
    };
  }

  static async validatePayment(valId: string): Promise<PaymentGatewayResponse> {
    if (!env.SSLCOMMERZ_ENABLED) {
      return {
        success: false,
        message: 'SSL Commerz is disabled',
      };
    }

    return {
      success: true,
      message: 'SSL Commerz payment validated successfully (Sandbox Mock)',
      transactionId: `SSL_MOCK_${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    };
  }
}
