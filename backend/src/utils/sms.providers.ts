import { env } from '../config/env';
import { logger } from './logger';

// =============================================================================
// P5: SMS provider layer — one interface, three Bangladeshi gateways, and
// automatic failover from the primary to the fallback provider.
//
//   SMS_PROVIDER_PRIMARY   GREENWEB (default) | BULKSMSBD | SSLWIRELESS
//   SMS_PROVIDER_FALLBACK  optional, tried ONCE when the primary fails with a
//                          provider/HTTP/network error (never for a
//                          recipient error such as "invalid number")
//
// Credentials are read from process.env at call time (never cached, never
// logged). Greenweb keeps its existing env names (GREENWEB_API_TOKEN,
// GREENWEB_BASE_URL, read through config/env.ts as before).
//
// VERIFIED vs UNVERIFIED: the Greenweb send path is the P0 implementation.
// BulkSMSBD and SSL Wireless are implemented from their public API docs and
// have NOT been verified against a live account — see docs/features/
// P5-sms-credits.md. Every parser treats an unknown reply as a failure.
// =============================================================================

export type SmsProviderName = 'GREENWEB' | 'BULKSMSBD' | 'SSLWIRELESS';
export const SMS_PROVIDER_NAMES: SmsProviderName[] = ['GREENWEB', 'BULKSMSBD', 'SSLWIRELESS'];

export interface ProviderSendInput {
  /** Normalised 8801XXXXXXXXX. */
  to: string;
  message: string;
  /** Masking sender ID approved for this provider, or null for non-masking. */
  senderId?: string | null;
  /** true when the text needs UCS-2 (Bangla, emoji…). */
  unicode: boolean;
  /** Our own unique reference (≤ 20 chars, alphanumeric). */
  clientRef: string;
}

export interface ProviderSendResult {
  ok: boolean;
  /**
   * The failure is about THIS recipient/message (invalid number, blocked
   * number), so another provider would fail too — no failover.
   */
  recipientError?: boolean;
  providerMessageId?: string;
  /** Provider reply (ok) or the reason (failure). Never contains credentials. */
  detail: string;
}

export type DeliveryState = 'DELIVERED' | 'FAILED' | 'PENDING' | 'UNKNOWN';

export interface SmsProvider {
  readonly name: SmsProviderName;
  readonly label: string;
  isConfigured(): boolean;
  send(input: ProviderSendInput): Promise<ProviderSendResult>;
  /** Account balance (provider's own unit — usually BDT). Optional. */
  getBalance?(): Promise<{ ok: boolean; balance?: number; detail: string }>;
  /** Delivery status of one message by the provider's id. Optional. */
  getDeliveryStatus?(providerMessageId: string): Promise<{ state: DeliveryState; detail: string }>;
}

const clean = (v: string | undefined) => {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : undefined;
};

const TIMEOUT_MS = 15_000;

/** Strips anything that looks like a credential before a reply is stored or logged. */
export function redact(text: string): string {
  return text
    .replace(/(api_key|api_token|token|password|passwd)=([^&\s"]+)/gi, '$1=***')
    .replace(/("(?:api_key|api_token|token|password)"\s*:\s*")([^"]*)(")/gi, '$1***$3');
}

async function httpText(url: string, init?: RequestInit): Promise<{ status: number; ok: boolean; body: string }> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = await response.text();
  return { status: response.status, ok: response.ok, body };
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Finds a numeric "balance" anywhere in a provider reply (shapes differ per provider). */
export function extractBalance(body: string): number | undefined {
  const json = tryJson(body.trim());
  const visit = (v: unknown): number | undefined => {
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (/balance/i.test(k)) {
          const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ''));
          if (Number.isFinite(n)) return n;
        }
        const nested = visit(val);
        if (nested !== undefined) return nested;
      }
    }
    return undefined;
  };
  if (json !== undefined) {
    if (typeof json === 'number') return json;
    return visit(json);
  }
  const m = body.match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : undefined;
}

const RECIPIENT_ERROR = /invalid\s*(?:mobile|number|msisdn|phone|recipient)|wrong\s*number|number\s*(?:is\s*)?invalid|dnd|blacklist|blocked\s*number/i;

// ── Greenweb ────────────────────────────────────────────────────────────────

/**
 * Parses a Greenweb reply (P0). Greenweb answers HTTP 200 even for failures,
 * so the body decides. Known shapes:
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

export const greenwebProvider: SmsProvider = {
  name: 'GREENWEB',
  label: 'Greenweb',
  isConfigured: () => !!env.GREENWEB_API_TOKEN,
  async send(input) {
    // Greenweb binds a masking sender to the token itself — there is no
    // per-message sender parameter, so senderId is not sent here.
    const params = new URLSearchParams({ token: env.GREENWEB_API_TOKEN as string, to: input.to, message: input.message });
    const r = await httpText(`${env.GREENWEB_BASE_URL}?${params.toString()}`, { method: 'GET' });
    if (!r.ok) return { ok: false, detail: `Greenweb API responded with status ${r.status}` };
    const parsed = parseGreenwebResponse(r.body);
    if (!parsed.ok) return { ok: false, recipientError: RECIPIENT_ERROR.test(parsed.detail), detail: redact(parsed.detail) };
    return { ok: true, detail: redact(parsed.detail) };
  },
  // UNVERIFIED: Greenweb's documented account API is g_api.php?token=…&balance.
  async getBalance() {
    const base = env.GREENWEB_BASE_URL.replace(/api\.php$/, 'g_api.php');
    const r = await httpText(`${base}?token=${encodeURIComponent(env.GREENWEB_API_TOKEN as string)}&balance`, { method: 'GET' });
    const balance = r.ok ? extractBalance(r.body) : undefined;
    return { ok: balance !== undefined, balance, detail: redact(r.body.slice(0, 200)) };
  },
};

// ── BulkSMSBD (UNVERIFIED against a live account) ───────────────────────────

/** BulkSMSBD response codes (from their API page). 202 = accepted. */
export const BULKSMSBD_CODES: Record<number, string> = {
  202: 'SMS Submitted Successfully',
  1001: 'Invalid Number',
  1002: 'sender id not correct/sender id is disabled',
  1003: 'Please Required all fields/Contact Your System Administrator',
  1005: 'Internal Error',
  1006: 'Balance Validity Not Available',
  1007: 'Balance Insufficient',
  1011: 'User Id not found',
  1012: 'Masking SMS must be sent in Bengali',
  1013: 'Sender Id has not found Gateway by api key',
  1014: 'Sender Type Name not found using this sender by api key',
  1015: 'Sender Id has not found Any Valid Gateway by api key',
  1016: 'Sender Type Name Active Price Info not found by this sender id',
  1017: 'Sender Type Name Price Info not found by this sender id',
  1018: 'The Owner of this (username) Account is disabled',
  1019: 'The (sender type name) Price of this (username) Account is disabled',
  1020: 'The parent of this account is not found.',
  1021: 'The parent active (sender type name) price of this account is not found.',
  1031: 'Your Account Not Verified, Please Contact Administrator.',
  1032: 'IP Not whitelisted',
};
const BULKSMSBD_RECIPIENT_CODES = new Set([1001]);

export function parseBulkSmsBdResponse(body: string): ProviderSendResult {
  const text = (body ?? '').trim();
  if (!text) return { ok: false, detail: 'empty response from BulkSMSBD' };
  const json = tryJson(text);
  let code: number | undefined;
  let messageId: string | undefined;
  let msg = '';
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const r = json as Record<string, unknown>;
    code = Number(r.response_code ?? r.responseCode ?? r.code);
    if (r.message_id !== undefined && r.message_id !== null && r.message_id !== '') messageId = String(r.message_id);
    msg = String(r.success_message || r.error_message || r.message || '').trim();
  } else if (typeof json === 'number' || /^\d{3,4}$/.test(text)) {
    code = Number(text);
  } else {
    return { ok: false, detail: `unrecognised BulkSMSBD reply: ${text.slice(0, 200)}` };
  }
  if (!Number.isFinite(code)) return { ok: false, detail: `BulkSMSBD reply without a response code: ${text.slice(0, 200)}` };
  const label = BULKSMSBD_CODES[code as number] ?? 'unknown response code';
  if (code === 202) return { ok: true, providerMessageId: messageId, detail: msg || label };
  return { ok: false, recipientError: BULKSMSBD_RECIPIENT_CODES.has(code as number), detail: `BulkSMSBD ${code}: ${msg || label}` };
}

function bulkSmsBdBase(): string {
  return (clean(process.env.BULKSMSBD_BASE_URL) ?? 'http://bulksmsbd.net/api').replace(/\/+$/, '');
}

export const bulkSmsBdProvider: SmsProvider = {
  name: 'BULKSMSBD',
  label: 'BulkSMSBD',
  isConfigured: () => !!clean(process.env.BULKSMSBD_API_KEY) && !!clean(process.env.BULKSMSBD_SENDER_ID),
  async send(input) {
    const params = new URLSearchParams({
      api_key: clean(process.env.BULKSMSBD_API_KEY) as string,
      type: input.unicode ? 'unicode' : 'text',
      number: input.to,
      senderid: input.senderId || (clean(process.env.BULKSMSBD_SENDER_ID) as string),
      message: input.message,
    });
    const r = await httpText(`${bulkSmsBdBase()}/smsapi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!r.ok) return { ok: false, detail: `BulkSMSBD API responded with status ${r.status}` };
    const parsed = parseBulkSmsBdResponse(r.body);
    return { ...parsed, detail: redact(parsed.detail) };
  },
  async getBalance() {
    const r = await httpText(`${bulkSmsBdBase()}/getBalanceApi?api_key=${encodeURIComponent(clean(process.env.BULKSMSBD_API_KEY) as string)}`, { method: 'GET' });
    const balance = r.ok ? extractBalance(r.body) : undefined;
    return { ok: balance !== undefined, balance, detail: redact(r.body.slice(0, 200)) };
  },
};

// ── SSL Wireless ISMS API v3 (UNVERIFIED against a live account) ────────────

export function parseSslWirelessResponse(body: string): ProviderSendResult {
  const text = (body ?? '').trim();
  const json = tryJson(text);
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { ok: false, detail: text ? `unrecognised SSL Wireless reply: ${text.slice(0, 200)}` : 'empty response from SSL Wireless' };
  }
  const r = json as Record<string, unknown>;
  const status = String(r.status ?? '').toUpperCase();
  const statusCode = r.status_code !== undefined ? String(r.status_code) : '';
  const info = Array.isArray(r.smsinfo) ? (r.smsinfo[0] as Record<string, unknown> | undefined) : undefined;
  const smsStatus = String(info?.sms_status ?? '').toUpperCase();
  const errorMessage = String(r.error_message || info?.status_message || '').trim();

  if (status === 'SUCCESS' && (!info || smsStatus === 'SUCCESS')) {
    const id = info?.reference_id ?? info?.csms_id;
    return { ok: true, providerMessageId: id !== undefined && id !== null ? String(id) : undefined, detail: String(info?.status_message || 'Success') };
  }
  const detail = `SSL Wireless ${statusCode || status || 'error'}: ${errorMessage || 'request failed'}`;
  return { ok: false, recipientError: RECIPIENT_ERROR.test(errorMessage), detail };
}

/** Maps a DLR / status word (any provider) onto our delivery states. */
export function mapDeliveryWord(word: string | undefined | null): DeliveryState {
  const w = String(word ?? '').trim().toUpperCase();
  if (!w) return 'UNKNOWN';
  if (/^(DELIVRD|DELIVERED|DELIVERY_SUCCESS|SUCCESS_DELIVERED|DELIVERED_TO_HANDSET)$/.test(w)) return 'DELIVERED';
  if (/(UNDELIV|FAIL|REJECT|EXPIRED|UNDELIVERABLE|DELETED|ERROR)/.test(w)) return 'FAILED';
  if (/(PENDING|SUBMIT|SENT|ACCEPTED|ENROUTE|QUEUED|PROCESSING|SUCCESS)/.test(w)) return 'PENDING';
  return 'UNKNOWN';
}

function sslBase(): string {
  return (clean(process.env.SSLWIRELESS_BASE_URL) ?? 'https://smsplus.sslwireless.com').replace(/\/+$/, '');
}

export const sslWirelessProvider: SmsProvider = {
  name: 'SSLWIRELESS',
  label: 'SSL Wireless',
  isConfigured: () => !!clean(process.env.SSLWIRELESS_API_TOKEN) && !!clean(process.env.SSLWIRELESS_SID),
  async send(input) {
    // In SSL Wireless a masking sender is its own SID, issued per mask.
    const r = await httpText(`${sslBase()}/api/v3/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        api_token: clean(process.env.SSLWIRELESS_API_TOKEN),
        sid: input.senderId || clean(process.env.SSLWIRELESS_SID),
        msisdn: input.to,
        sms: input.message,
        csms_id: input.clientRef,
      }),
    });
    if (!r.ok && !r.body) return { ok: false, detail: `SSL Wireless API responded with status ${r.status}` };
    const parsed = parseSslWirelessResponse(r.body);
    if (!r.ok && parsed.ok) return { ok: false, detail: `SSL Wireless API responded with status ${r.status}` };
    return { ...parsed, detail: redact(parsed.detail) };
  },
  async getBalance() {
    const r = await httpText(`${sslBase()}/api/v3/balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ api_token: clean(process.env.SSLWIRELESS_API_TOKEN), sid: clean(process.env.SSLWIRELESS_SID) }),
    });
    const balance = r.ok ? extractBalance(r.body) : undefined;
    return { ok: balance !== undefined, balance, detail: redact(r.body.slice(0, 200)) };
  },
  async getDeliveryStatus(providerMessageId) {
    const r = await httpText(`${sslBase()}/api/v3/sms-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ api_token: clean(process.env.SSLWIRELESS_API_TOKEN), sid: clean(process.env.SSLWIRELESS_SID), reference_id: providerMessageId }),
    });
    if (!r.ok) return { state: 'UNKNOWN', detail: `HTTP ${r.status}` };
    const json = tryJson(r.body) as Record<string, unknown> | undefined;
    const info = json && Array.isArray(json.smsinfo) ? (json.smsinfo[0] as Record<string, unknown>) : json;
    const word = (info?.dlr_status ?? info?.delivery_status ?? info?.sms_status ?? info?.status) as string | undefined;
    return { state: mapDeliveryWord(word), detail: redact(r.body.slice(0, 200)) };
  },
};

// ── Registry, config, failover ──────────────────────────────────────────────

export const SMS_PROVIDERS: Record<SmsProviderName, SmsProvider> = {
  GREENWEB: greenwebProvider,
  BULKSMSBD: bulkSmsBdProvider,
  SSLWIRELESS: sslWirelessProvider,
};

export function parseProviderName(v: string | undefined | null): SmsProviderName | null {
  const s = String(v ?? '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (s === 'GREENWEB') return 'GREENWEB';
  if (s === 'BULKSMSBD') return 'BULKSMSBD';
  if (s === 'SSLWIRELESS' || s === 'SSL') return 'SSLWIRELESS';
  return null;
}

/** Primary then fallback, as configured (not filtered by credentials). */
export function configuredOrder(): { primary: SmsProviderName; fallback: SmsProviderName | null } {
  const primary = parseProviderName(process.env.SMS_PROVIDER_PRIMARY) ?? 'GREENWEB';
  const fb = parseProviderName(process.env.SMS_PROVIDER_FALLBACK);
  return { primary, fallback: fb && fb !== primary ? fb : null };
}

/** The providers that can actually send, in order (primary first). */
export function providerChain(): SmsProvider[] {
  const { primary, fallback } = configuredOrder();
  return [primary, fallback]
    .filter((n): n is SmsProviderName => !!n)
    .map((n) => SMS_PROVIDERS[n])
    .filter((p) => p.isConfigured());
}

export interface FailoverAttempt {
  provider: SmsProviderName;
  ok: boolean;
  detail: string;
  recipientError?: boolean;
}

export interface FailoverResult {
  ok: boolean;
  provider?: SmsProviderName;
  providerMessageId?: string;
  detail: string;
  recipientError?: boolean;
  attempts: FailoverAttempt[];
}

/**
 * Sends through the chain: the primary first; on a provider/HTTP/network
 * error (not a recipient error) the fallback is tried ONCE. A masking sender
 * is only passed to the provider it was registered with (`senderProvider`
 * null = any provider); other providers send non-masking.
 */
export async function sendWithFailover(
  input: Omit<ProviderSendInput, 'senderId'>,
  sender: { senderId: string | null; senderProvider: string | null } | null,
  chain: SmsProvider[] = providerChain(),
): Promise<FailoverResult> {
  const attempts: FailoverAttempt[] = [];
  if (chain.length === 0) return { ok: false, detail: 'no SMS provider is configured', attempts };

  for (let i = 0; i < Math.min(chain.length, 2); i += 1) {
    const provider = chain[i];
    const senderId = sender?.senderId && (!sender.senderProvider || sender.senderProvider === provider.name) ? sender.senderId : null;
    let result: ProviderSendResult;
    try {
      result = await provider.send({ ...input, senderId });
    } catch (error) {
      result = { ok: false, detail: `${provider.label} request failed: ${(error as Error).message}` };
    }
    attempts.push({ provider: provider.name, ok: result.ok, detail: result.detail.slice(0, 300), recipientError: result.recipientError });
    if (result.ok) {
      return { ok: true, provider: provider.name, providerMessageId: result.providerMessageId, detail: result.detail, attempts };
    }
    if (result.recipientError) {
      return { ok: false, provider: provider.name, detail: result.detail, recipientError: true, attempts };
    }
    if (i + 1 < Math.min(chain.length, 2)) {
      logger.warn('SMS provider failed — failing over', { from: provider.name, to: chain[i + 1].name, detail: result.detail.slice(0, 200) });
    }
  }
  const last = attempts[attempts.length - 1];
  const detail = attempts.length === 1 ? last.detail : attempts.map((a) => `${a.provider}: ${a.detail}`).join(' | ');
  return { ok: false, provider: last.provider, detail, attempts };
}

/** Status of each provider for the startup log and the super-admin page (no secrets). */
export function describeProviders() {
  const { primary, fallback } = configuredOrder();
  return SMS_PROVIDER_NAMES.map((name) => ({
    name,
    label: SMS_PROVIDERS[name].label,
    configured: SMS_PROVIDERS[name].isConfigured(),
    role: name === primary ? 'PRIMARY' : name === fallback ? 'FALLBACK' : 'UNUSED',
    supportsBalance: !!SMS_PROVIDERS[name].getBalance,
    supportsStatus: !!SMS_PROVIDERS[name].getDeliveryStatus,
    verified: name === 'GREENWEB',
  }));
}
