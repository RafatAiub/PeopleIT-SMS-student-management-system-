import { env } from '../config/env';
import { logger } from './logger';

export interface SmsResult {
  success: boolean;
  message: string;
}

/**
 * Sends an SMS via the Greenweb gateway (the provider named in
 * reminderWorker.ts's own comment as the intended integration). Gated
 * behind SMS_ENABLED — when disabled (the default, and always true in
 * tests/dev without real credentials), this logs instead of calling out,
 * matching the same env-gated pattern already used for the bKash/Nagad/
 * SSLCommerz stubs.
 */
export async function sendSms(toPhone: string, message: string): Promise<SmsResult> {
  if (!env.SMS_ENABLED || !env.GREENWEB_API_TOKEN) {
    logger.info('[SMS disabled or not configured] Would send SMS', { toPhone, message });
    return { success: true, message: 'SMS sending is disabled (SMS_ENABLED=false or no API token configured)' };
  }

  try {
    const params = new URLSearchParams({
      token: env.GREENWEB_API_TOKEN,
      to: toPhone,
      message,
    });
    const response = await fetch(`${env.GREENWEB_BASE_URL}?${params.toString()}`, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`Greenweb API responded with status ${response.status}`);
    }
    const body = await response.text();
    logger.info('SMS sent via Greenweb', { toPhone, response: body });
    return { success: true, message: body };
  } catch (error) {
    logger.error('Failed to send SMS via Greenweb', { toPhone, error: (error as Error).message });
    return { success: false, message: (error as Error).message };
  }
}
