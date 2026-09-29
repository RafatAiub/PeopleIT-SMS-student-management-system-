// DB-free unit tests for the fee gateway verification helpers, adapters'
// pure response mappers, the overdue cutoff and reconciliation flags (Wave C).

jest.mock('../src/config/prisma', () => ({ prisma: {} }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import crypto from 'crypto';
import {
  decideVerification,
  generateFeeTranId,
  md5,
  nagadDateTime,
  nagadDecrypt,
  nagadEncrypt,
  nagadSign,
  nagadVerify,
  toPem,
  verifySslCommerzSignature,
} from '../src/modules/fees/gateways/verify';
import { mapBkashPaymentResponse } from '../src/modules/fees/gateways/bkash.adapter';
import { mapNagadVerifyResponse } from '../src/modules/fees/gateways/nagad.adapter';
import { isGatewayLive } from '../src/modules/fees/gateways/config';
import { startOfTodayAt } from '../src/modules/fees/overdue/overdue.service';
import { reconciliationFlags } from '../src/modules/fees/reconciliation/reconciliation.service';

const expected = { tranId: 'FEEABC123', amount: 1500, currency: 'BDT' };
const ok = { reachable: true, success: true, tranId: 'FEEABC123', amount: 1500, currency: 'BDT', gatewayRef: 'VAL-1', raw: {} };

describe('decideVerification', () => {
  it('credits a valid, matching payment', () => {
    expect(decideVerification(expected, ok)).toEqual({ action: 'credit' });
  });

  it('ignores (never fails) when the gateway was unreachable', () => {
    expect(decideVerification(expected, { reachable: false, success: false, raw: null }).action).toBe('ignore');
  });

  it('ignores a reference that belongs to a different or unknown tran_id', () => {
    expect(decideVerification(expected, { ...ok, tranId: 'FEEOTHER' }).action).toBe('ignore');
    expect(decideVerification(expected, { ...ok, tranId: undefined, success: false }).action).toBe('ignore');
  });

  it('fails an invalid payment or an amount/currency mismatch', () => {
    expect(decideVerification(expected, { ...ok, success: false, status: 'INVALID_TRANSACTION' }).action).toBe('fail');
    expect(decideVerification(expected, { ...ok, amount: 1 }).action).toBe('fail');
    expect(decideVerification(expected, { ...ok, amount: undefined }).action).toBe('fail');
    expect(decideVerification(expected, { ...ok, currency: 'USD' }).action).toBe('fail');
  });

  it('tolerates sub-paisa float noise in the amount', () => {
    expect(decideVerification(expected, { ...ok, amount: 1500.004 }).action).toBe('credit');
  });

  it('requires a unique gateway reference for replay protection', () => {
    expect(decideVerification(expected, { ...ok, gatewayRef: undefined }).action).toBe('ignore');
  });
});

describe('generateFeeTranId', () => {
  it('is alphanumeric, <= 20 chars and prefixed', () => {
    const id = generateFeeTranId();
    expect(id).toMatch(/^FEE[A-Z0-9]+$/);
    expect(id.length).toBeLessThanOrEqual(20);
  });
  it('is deterministic given time and randomness', () => {
    expect(generateFeeTranId(0, () => 'ab12')).toBe('FEE0AB12');
  });
});

describe('verifySslCommerzSignature', () => {
  const password = 'store-secret';
  const build = (payload: Record<string, string>) => {
    const keys = Object.keys(payload);
    const fields: Record<string, string> = { ...payload, store_passwd: md5(password) };
    const str = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('&');
    return { ...payload, verify_key: keys.join(','), verify_sign: md5(str) };
  };

  it('accepts a correctly signed payload', () => {
    const signed = build({ tran_id: 'FEEABC123', val_id: 'V1', amount: '1500.00', status: 'VALID' });
    expect(verifySslCommerzSignature(signed, password)).toBe(true);
  });

  it('rejects a tampered payload or wrong password', () => {
    const signed = build({ tran_id: 'FEEABC123', val_id: 'V1', amount: '1500.00', status: 'VALID' });
    expect(verifySslCommerzSignature({ ...signed, amount: '1.00' }, password)).toBe(false);
    expect(verifySslCommerzSignature(signed, 'other')).toBe(false);
  });

  it('returns null when the payload carries no signature', () => {
    expect(verifySslCommerzSignature({ tran_id: 'x' }, password)).toBeNull();
  });
});

describe('Nagad crypto helpers', () => {
  const merchant = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const nagad = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = (k: crypto.KeyObject, type: 'spki' | 'pkcs8') => k.export({ type, format: 'pem' }).toString();
  const bare = (p: string) => p.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');

  it('toPem wraps a bare base64 key body and leaves PEMs alone', () => {
    const full = pem(nagad.publicKey, 'spki');
    expect(toPem(full, 'PUBLIC')).toBe(full.trim());
    const wrapped = toPem(bare(full), 'PUBLIC');
    expect(wrapped.startsWith('-----BEGIN PUBLIC KEY-----')).toBe(true);
    expect(() => crypto.createPublicKey(wrapped)).not.toThrow();
  });

  it('encrypt with the public key / decrypt with the private key round-trips', () => {
    const plain = JSON.stringify({ merchantId: 'M1', orderId: 'FEEABC123', challenge: 'abc' });
    const cipher = nagadEncrypt(plain, bare(pem(merchant.publicKey, 'spki')));
    expect(nagadDecrypt(cipher, bare(pem(merchant.privateKey, 'pkcs8')))).toBe(plain);
  });

  it('sign/verify round-trips and rejects tampering or the wrong key', () => {
    const plain = '{"a":1}';
    const sig = nagadSign(plain, pem(merchant.privateKey, 'pkcs8'));
    expect(nagadVerify(plain, sig, pem(merchant.publicKey, 'spki'))).toBe(true);
    expect(nagadVerify('{"a":2}', sig, pem(merchant.publicKey, 'spki'))).toBe(false);
    expect(nagadVerify(plain, sig, pem(nagad.publicKey, 'spki'))).toBe(false);
  });

  it('formats datetime as YYYYMMDDHHmmss in Bangladesh time', () => {
    expect(nagadDateTime(new Date('2026-09-26T20:30:05Z'))).toBe('20260927023005');
  });
});

describe('gateway response mappers', () => {
  it('maps a completed bKash execute response', () => {
    const r = mapBkashPaymentResponse({
      statusCode: '0000',
      transactionStatus: 'Completed',
      amount: '1500.00',
      currency: 'BDT',
      merchantInvoiceNumber: 'FEEABC123',
      trxID: 'TRX9',
      paymentID: 'P1',
    });
    expect(r).toMatchObject({ success: true, amount: 1500, tranId: 'FEEABC123', gatewayRef: 'TRX9', gatewayPaymentId: 'P1' });
  });

  it('treats an initiated/failed bKash status as not successful', () => {
    expect(mapBkashPaymentResponse({ statusCode: '2056', statusMessage: 'Invalid Payment State' }).success).toBe(false);
    expect(mapBkashPaymentResponse({ transactionStatus: 'Initiated' }).success).toBe(false);
  });

  it('maps a successful Nagad verify response', () => {
    const r = mapNagadVerifyResponse({ status: 'Success', amount: '1500', orderId: 'FEEABC123', issuerPaymentRefNo: 'ISS1', paymentRefId: 'REF1' });
    expect(r).toMatchObject({ success: true, amount: 1500, tranId: 'FEEABC123', gatewayRef: 'ISS1', currency: 'BDT' });
    expect(mapNagadVerifyResponse({ status: 'Aborted' }).success).toBe(false);
  });
});

describe('isGatewayLive (demo-mode switch)', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('is demo when keys are missing or blank', () => {
    delete process.env.SSLCOMMERZ_STORE_ID;
    process.env.SSLCOMMERZ_STORE_PASSWORD = '  ';
    delete process.env.BKASH_APP_KEY;
    delete process.env.NAGAD_MERCHANT_ID;
    expect(isGatewayLive('SSLCOMMERZ')).toBe(false);
    expect(isGatewayLive('BKASH')).toBe(false);
    expect(isGatewayLive('NAGAD')).toBe(false);
  });

  it('is live only when every credential is present', () => {
    process.env.SSLCOMMERZ_STORE_ID = 'id';
    process.env.SSLCOMMERZ_STORE_PASSWORD = 'pw';
    Object.assign(process.env, { BKASH_APP_KEY: 'k', BKASH_APP_SECRET: 's', BKASH_USERNAME: 'u' });
    delete process.env.BKASH_PASSWORD;
    Object.assign(process.env, { NAGAD_MERCHANT_ID: 'm', NAGAD_PUBLIC_KEY: 'pub', NAGAD_MERCHANT_PRIVATE_KEY: 'priv' });
    expect(isGatewayLive('SSLCOMMERZ')).toBe(true);
    expect(isGatewayLive('BKASH')).toBe(false);
    expect(isGatewayLive('NAGAD')).toBe(true);
  });
});

describe('startOfTodayAt (overdue cutoff)', () => {
  it('returns Bangladesh midnight as a UTC instant', () => {
    // 2026-09-27 03:00 in Dhaka == 2026-09-26T21:00Z → cutoff is 2026-09-26T18:00Z
    expect(startOfTodayAt(new Date('2026-09-26T21:00:00Z')).toISOString()).toBe('2026-09-26T18:00:00.000Z');
    // 2026-09-26 23:00 in Dhaka == 17:00Z → cutoff is 2026-09-25T18:00Z
    expect(startOfTodayAt(new Date('2026-09-26T17:00:00Z')).toISOString()).toBe('2026-09-25T18:00:00.000Z');
  });
});

describe('reconciliationFlags', () => {
  const now = new Date('2026-09-27T12:00:00Z');
  const base = { status: 'SUCCESS', amount: 1500, createdAt: new Date('2026-09-27T10:00:00Z'), payment: { amount: 1500 } };

  it('has no flags for a clean success', () => {
    expect(reconciliationFlags(base, now)).toEqual([]);
  });
  it('flags amount mismatches and missing/unexpected payments', () => {
    expect(reconciliationFlags({ ...base, payment: { amount: 1000 } }, now)).toContain('AMOUNT_MISMATCH');
    expect(reconciliationFlags({ ...base, payment: null }, now)).toContain('SUCCESS_WITHOUT_PAYMENT');
    expect(reconciliationFlags({ ...base, status: 'FAILED' }, now)).toContain('PAYMENT_WITHOUT_SUCCESS');
  });
  it('flags pending transactions older than 24h', () => {
    expect(reconciliationFlags({ ...base, status: 'PENDING', payment: null, createdAt: new Date('2026-09-25T00:00:00Z') }, now)).toEqual(['STALE_PENDING']);
  });
});
