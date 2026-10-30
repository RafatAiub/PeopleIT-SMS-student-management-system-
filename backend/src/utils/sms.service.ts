import { env } from '../config/env';
import { logger } from './logger';
import { normalizeBdMobile } from './phone';

/**
 * P0: an honest result. `success` is true ONLY when the provider accepted the
 * message. Callers must record `status` as-is:
 *   - SENT    → the gateway accepted it
 *   - SKIPPED → nothing was transmitted on purpose (SMS disabled / no token)
 *   - FAILED  → invalid number, HTTP error, or the gateway reported an error
 */
export type SmsStatus = 'SENT' | 'SKIPPED' | 'FAILED';

export interface SmsResult {
  success: boolean;
  status: SmsStatus;
  /** Provider reply (SENT), or the reason (SKIPPED / FAILED). */
  message: string;
  /** The normalised number actually used (8801XXXXXXXXX), when valid. */
  to?: string;
}

/** Masks all but the last 3 digits — phone numbers are PII in logs. */
export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length <= 3) return '***';
  return `${'*'.repeat(digits.length - 3)}${digits.slice(-3)}`;
}

export function isSmsConfigured(): boolean {
  return env.SMS_ENABLED && !!env.GREENWEB_API_TOKEN;
}

/**
 * Parses a Greenweb reply. Greenweb answers HTTP 200 even for failures, so the
 * body decides. Known shapes:
 *   - text, one line per number: "Ok: SMS Sent Successfully To 8801XXXXXXXXX"
 *     or "Error: <reason>"
 *   - JSON (when `json=1`): [{ "to": "...", "status": "SENT" | "FAILED", "statusmsg": "..." }]
 *     or an object { "status": ..., "message"/"statusmsg": ... }
 * Anything unrecognised or empty is treated as a failure — never assume sent.
 */
export function parseGreenwebResponse(body: string): { ok: boolean; detail: string } {
  const text = (body ?? '').trim();
  if (!text) return { ok: false, detail: 'empty response from SMS gateway' };

  try {
    const parsed: unknown = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    if (rows.length === 0) return { ok: false, detail: 'empty response from SMS gateway' };
    for (const row of rows) {
      if (!row || typeof row !== 'object') return { ok: false, detail: text.slice(0, 300) };
      const r = row as Record<string, unknown>;
      const status = String(r.status ?? r.Status ?? '').trim().toUpperCase();
      const msg = String(r.statusmsg ?? r.message ?? r.msg ?? '').trim();
      if (!['SENT', 'SUCCESS', 'OK', 'TRUE', '200'].includes(status)) {
        return { ok: false, detail: msg || `gateway status ${status || 'unknown'}` };
      }
    }
    return { ok: true, detail: text.slice(0, 300) };
  } catch {
    // not JSON — fall through to the text format
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^error\b/i.test(line) || /\b(invalid|insufficient|failed|failure|not\s+allowed|blocked|expired)\b/i.test(line)) {
      return { ok: false, detail: line.slice(0, 300) };
    }
    if (!/^ok\b/i.test(line)) {
      return { ok: false, detail: `unrecognised gateway reply: ${line.slice(0, 200)}` };
    }
  }
  return { ok: true, detail: text.slice(0, 300) };
}

/**
 * Sends an SMS via the Greenweb gateway. Gated behind SMS_ENABLED +
 * GREENWEB_API_TOKEN — when either is missing, nothing is transmitted and the
 * result is SKIPPED (not success). The number is normalised to the BD
 * 8801XXXXXXXXX form first; anything that is not a valid BD mobile is FAILED
 * without calling the provider.
 */
export async function sendSms(toPhone: string, message: string): Promise<SmsResult> {
  const to = normalizeBdMobile(toPhone);
  if (!to) {
    logger.warn('SMS not sent: invalid BD mobile number', { to: maskPhone(toPhone) });
    return { success: false, status: 'FAILED', message: `invalid BD mobile number (${maskPhone(toPhone)})` };
  }

  if (!isSmsConfigured()) {
    logger.info('[SMS disabled or not configured] SMS not transmitted', { to: maskPhone(to), length: message.length });
    return {
      success: false,
      status: 'SKIPPED',
      message: 'SMS sending is disabled (SMS_ENABLED=false or no GREENWEB_API_TOKEN)',
      to,
    };
  }

  try {
    const params = new URLSearchParams({
      token: env.GREENWEB_API_TOKEN as string,
      to,
      message,
    });
    const response = await fetch(`${env.GREENWEB_BASE_URL}?${params.toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`Greenweb API responded with status ${response.status}`);
    }
    const parsed = parseGreenwebResponse(body);
    if (!parsed.ok) {
      logger.error('Greenweb rejected the SMS', { to: maskPhone(to), detail: parsed.detail });
      return { success: false, status: 'FAILED', message: parsed.detail, to };
    }
    logger.info('SMS sent via Greenweb', { to: maskPhone(to) });
    return { success: true, status: 'SENT', message: parsed.detail, to };
  } catch (error) {
    logger.error('Failed to send SMS via Greenweb', { to: maskPhone(to), error: (error as Error).message });
    return { success: false, status: 'FAILED', message: (error as Error).message, to };
  }
}
