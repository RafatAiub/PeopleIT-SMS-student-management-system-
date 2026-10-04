import crypto from 'crypto';
import type { GatewayVerifyResult } from './types';

// =============================================================================
// Pure verification helpers (no I/O) — unit tested in
// backend/tests/fee-gateways.test.ts.
// =============================================================================

export type VerificationDecision =
  | { action: 'credit' }
  /** Gateway answered and the payment is not valid (declined, amount/currency tampering) — mark FAILED. */
  | { action: 'fail'; reason: string }
  /** Say nothing about this transaction (gateway unreachable, or a tran_id mismatch/replay) — leave status untouched. */
  | { action: 'ignore'; reason: string };

export interface ExpectedPayment {
  tranId: string;
  amount: number;
  currency: string;
}

/**
 * Decide what a gateway verification result means for one of OUR
 * transactions. Mirrors the billing U2 rules (billing.service.ts creditPayment):
 *  - unreachable gateway → ignore (a later IPN/redirect can still credit)
 *  - tran_id mismatch → ignore (a val_id/trxID for a different transaction
 *    says nothing about this one — never mark it FAILED)
 *  - invalid / amount mismatch / currency mismatch → fail
 */
export function decideVerification(expected: ExpectedPayment, got: GatewayVerifyResult): VerificationDecision {
  if (!got.reachable) {
    return { action: 'ignore', reason: 'Gateway verification could not be completed' };
  }
  // Strict match (undefined included): a junk/foreign reference whose
  // validation doesn't name OUR tran_id must not touch this transaction.
  if (got.tranId !== expected.tranId) {
    return { action: 'ignore', reason: `Gateway reference does not belong to this transaction (${got.tranId ?? 'none'})` };
  }
  if (!got.success) {
    return { action: 'fail', reason: got.message || `Gateway reported status ${got.status ?? 'NOT_COMPLETED'}` };
  }
  if (got.amount === undefined || !amountsMatch(got.amount, expected.amount)) {
    return { action: 'fail', reason: `Amount mismatch: expected ${expected.amount}, gateway reported ${got.amount}` };
  }
  if (got.currency && got.currency.toUpperCase() !== expected.currency.toUpperCase()) {
    return { action: 'fail', reason: `Currency mismatch: expected ${expected.currency}, gateway reported ${got.currency}` };
  }
  if (!got.gatewayRef) {
    return { action: 'ignore', reason: 'Gateway response did not include a unique payment reference' };
  }
  return { action: 'credit' };
}

export function amountsMatch(a: number, b: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.01;
}

/**
 * Our merchant transaction id. Alphanumeric only and <= 20 chars so it fits
 * every gateway's order-id rules (Nagad is the strictest).
 */
export function generateFeeTranId(now: number = Date.now(), random: () => string = defaultRandom): string {
  return `FEE${now.toString(36)}${random()}`.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
}

function defaultRandom(): string {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
}

// ── SSLCommerz IPN signature ────────────────────────────────────────────────

/**
 * Verifies SSLCommerz's `verify_sign` over the fields listed in `verify_key`
 * (md5 of the alphabetically-sorted `key=value&...` string, where the store
 * password is included as `store_passwd = md5(password)`). A payload without
 * verify_sign/verify_key returns null (unknown) — the validation API is still
 * the authoritative check either way.
 */
export function verifySslCommerzSignature(payload: Record<string, unknown>, storePassword: string): boolean | null {
  const verifySign = typeof payload.verify_sign === 'string' ? payload.verify_sign : undefined;
  const verifyKey = typeof payload.verify_key === 'string' ? payload.verify_key : undefined;
  if (!verifySign || !verifyKey) return null;

  const fields: Record<string, string> = {};
  for (const key of verifyKey.split(',').map((k) => k.trim()).filter(Boolean)) {
    const value = payload[key];
    fields[key] = value === undefined || value === null ? '' : String(value);
  }
  fields.store_passwd = md5(storePassword);

  const hashString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('&');
  return md5(hashString) === verifySign;
}

export function md5(value: string): string {
  return crypto.createHash('md5').update(value, 'utf8').digest('hex');
}

// ── Nagad crypto ────────────────────────────────────────────────────────────

/** Accepts either a full PEM or a bare base64 key body (as Nagad hands them out). */
export function toPem(key: string, kind: 'PUBLIC' | 'PRIVATE'): string {
  const trimmed = key.trim().replace(/\\n/g, '\n');
  if (trimmed.includes('-----BEGIN')) return trimmed;
  const body = trimmed.replace(/\s+/g, '');
  const lines = body.match(/.{1,64}/g) ?? [body];
  const label = kind === 'PUBLIC' ? 'PUBLIC KEY' : 'PRIVATE KEY';
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

/** RSA PKCS#1 v1.5 encrypt with Nagad's public key → base64. */
export function nagadEncrypt(plain: string, nagadPublicKey: string): string {
  return crypto
    .publicEncrypt({ key: toPem(nagadPublicKey, 'PUBLIC'), padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(plain, 'utf8'))
    .toString('base64');
}

/** RSA PKCS#1 v1.5 decrypt with the merchant private key. */
export function nagadDecrypt(cipherB64: string, merchantPrivateKey: string): string {
  return crypto
    .privateDecrypt({ key: toPem(merchantPrivateKey, 'PRIVATE'), padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(cipherB64, 'base64'))
    .toString('utf8');
}

/** SHA256withRSA signature by the merchant private key → base64. */
export function nagadSign(plain: string, merchantPrivateKey: string): string {
  return crypto.sign('sha256', Buffer.from(plain, 'utf8'), toPem(merchantPrivateKey, 'PRIVATE')).toString('base64');
}

/** Verifies a Nagad SHA256withRSA signature with Nagad's public key. */
export function nagadVerify(plain: string, signatureB64: string, nagadPublicKey: string): boolean {
  try {
    return crypto.verify('sha256', Buffer.from(plain, 'utf8'), toPem(nagadPublicKey, 'PUBLIC'), Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}

/** Nagad's `datetime` field: YYYYMMDDHHmmss in Bangladesh time (UTC+6, no DST). */
export function nagadDateTime(date: Date = new Date()): string {
  const bd = new Date(date.getTime() + 6 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${bd.getUTCFullYear()}${p(bd.getUTCMonth() + 1)}${p(bd.getUTCDate())}${p(bd.getUTCHours())}${p(bd.getUTCMinutes())}${p(bd.getUTCSeconds())}`;
}

/** 40-char random hex challenge for Nagad's initialize call. */
export function nagadChallenge(): string {
  return crypto.randomBytes(20).toString('hex');
}
