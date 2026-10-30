import type { FeeGatewayName } from './types';

// =============================================================================
// Gateway credentials — read straight from process.env at call time (never
// cached, never sent to the browser). A gateway is "live" only when every
// credential it needs is present; otherwise the fee payment flow runs in demo
// mode (simulated checkout, isDemo = true, `demo: true` in API responses).
//
// Env names reuse the ones already declared in config/env.ts / .env.example
// (SSLCOMMERZ_STORE_ID, BKASH_APP_KEY, NAGAD_MERCHANT_PRIVATE_KEY, ...). The
// shorter NAGAD_PUBLIC_KEY / NAGAD_PRIVATE_KEY aliases are accepted too.
// =============================================================================

const clean = (v: string | undefined) => {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : undefined;
};

export interface SslCommerzConfig {
  storeId: string;
  storePassword: string;
  baseUrl: string;
}

export interface BkashConfig {
  appKey: string;
  appSecret: string;
  username: string;
  password: string;
  baseUrl: string;
}

export interface NagadConfig {
  merchantId: string;
  /** Nagad's own public key (encrypts sensitiveData, verifies their signatures). */
  nagadPublicKey: string;
  /** The merchant's private key (signs requests, decrypts Nagad's sensitiveData). */
  merchantPrivateKey: string;
  baseUrl: string;
  clientIp: string;
}

export function getSslCommerzConfig(): SslCommerzConfig | null {
  const storeId = clean(process.env.SSLCOMMERZ_STORE_ID);
  const storePassword = clean(process.env.SSLCOMMERZ_STORE_PASSWORD);
  if (!storeId || !storePassword) return null;
  return {
    storeId,
    storePassword,
    baseUrl: (clean(process.env.SSLCOMMERZ_BASE_URL) ?? 'https://sandbox.sslcommerz.com').replace(/\/+$/, ''),
  };
}

export function getBkashConfig(): BkashConfig | null {
  const appKey = clean(process.env.BKASH_APP_KEY);
  const appSecret = clean(process.env.BKASH_APP_SECRET);
  const username = clean(process.env.BKASH_USERNAME);
  const password = clean(process.env.BKASH_PASSWORD);
  if (!appKey || !appSecret || !username || !password) return null;
  return {
    appKey,
    appSecret,
    username,
    password,
    baseUrl: (clean(process.env.BKASH_BASE_URL) ?? 'https://tokenized.sandbox.bka.sh/v1.2.0-beta').replace(/\/+$/, ''),
  };
}

export function getNagadConfig(): NagadConfig | null {
  const merchantId = clean(process.env.NAGAD_MERCHANT_ID);
  const nagadPublicKey = clean(process.env.NAGAD_PUBLIC_KEY) ?? clean(process.env.NAGAD_MERCHANT_PUBLIC_KEY);
  const merchantPrivateKey = clean(process.env.NAGAD_PRIVATE_KEY) ?? clean(process.env.NAGAD_MERCHANT_PRIVATE_KEY);
  if (!merchantId || !nagadPublicKey || !merchantPrivateKey) return null;
  return {
    merchantId,
    nagadPublicKey,
    merchantPrivateKey,
    baseUrl: (clean(process.env.NAGAD_BASE_URL) ?? 'http://sandbox.mynagad.com:10080/remote-payment-gateway-1.0').replace(/\/+$/, ''),
    clientIp: clean(process.env.NAGAD_CLIENT_IP) ?? '127.0.0.1',
  };
}

/** true when real credentials are configured for this gateway; false → demo mode. */
export function isGatewayLive(gateway: FeeGatewayName): boolean {
  switch (gateway) {
    case 'SSLCOMMERZ':
      return getSslCommerzConfig() !== null;
    case 'BKASH':
      return getBkashConfig() !== null;
    case 'NAGAD':
      return getNagadConfig() !== null;
    default:
      return false;
  }
}

/**
 * Kill-switch for demo-mode fee payments. When unset, demo is ON outside production (so the flow
 * works end to end without merchant keys), but a demo "success" marks a real
 * invoice as paid without money moving — set FEE_DEMO_PAYMENTS_ENABLED=false
 * on a live school until real gateway keys are configured.
 */
export function isDemoPaymentsAllowed(): boolean {
  const flag = (process.env.FEE_DEMO_PAYMENTS_ENABLED ?? '').trim().toLowerCase();
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  // Unset (or any other value): allowed everywhere except production, where a
  // simulated "success" would mark real invoices paid. Production must opt in
  // explicitly with FEE_DEMO_PAYMENTS_ENABLED=true.
  return process.env.NODE_ENV !== 'production';
}

/**
 * P0: one human-readable line for the startup log, e.g.
 *   "Fee payment gateways — SSLCommerz: LIVE (https://securepay.sslcommerz.com), bKash: DEMO, Nagad: OFF; demo payments: DISABLED"
 * LIVE = real credentials; DEMO = no credentials and demo checkout allowed;
 * OFF = no credentials and demo disallowed (the gateway cannot be used).
 * Never prints a credential — only the base URL host.
 */
export function describeGatewayModes(): string {
  const demo = isDemoPaymentsAllowed();
  const host = (url: string | undefined) => {
    try {
      return url ? new URL(url).host : '';
    } catch {
      return '';
    }
  };
  const one = (label: string, live: boolean, baseUrl?: string) =>
    `${label}: ${live ? `LIVE${baseUrl ? ` (${host(baseUrl)})` : ''}` : demo ? 'DEMO' : 'OFF'}`;
  return [
    one('SSLCommerz', isGatewayLive('SSLCOMMERZ'), getSslCommerzConfig()?.baseUrl),
    one('bKash', isGatewayLive('BKASH'), getBkashConfig()?.baseUrl),
    one('Nagad', isGatewayLive('NAGAD'), getNagadConfig()?.baseUrl),
  ].join(', ') + `; demo payments: ${demo ? 'ENABLED (simulated payments mark invoices paid!)' : 'DISABLED'}`;
}

export const GATEWAY_TIMEOUT_MS = 20_000;

/** fetch + JSON parse with a hard timeout. Throws on network error, timeout or non-JSON body. */
export async function fetchJson(url: string, init: RequestInit, timeoutMs = GATEWAY_TIMEOUT_MS): Promise<any> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Gateway returned a non-JSON response (HTTP ${response.status})`);
  }
}
