import { getRedis, closeRedis } from '../src/config/redis';
import { signResetToken, verifyResetToken, resetTokenUsedKey } from '../src/modules/sites/sites.commerce.service';

// Site-customer password reset has no dedicated DB column for single-use
// enforcement (schema owned by another engineer this cycle) — see the design
// note in sites.commerce.service.ts. This tests the two building blocks that
// replace it: a stateless HMAC-signed token (customerId + siteId + expiry)
// and a Redis SET-NX claim for "has this exact token already been consumed".

describe('site-customer reset token', () => {
  const customerId = 'cust_123';
  const siteId = 'site_abc';

  it('round-trips customerId when not expired', () => {
    const expiresAt = Date.now() + 60_000;
    const token = signResetToken(customerId, siteId, expiresAt);
    expect(verifyResetToken(token, siteId)).toEqual({ customerId, expiresAt });
  });

  it('rejects a token presented against a different site', () => {
    const token = signResetToken(customerId, siteId, Date.now() + 60_000);
    expect(verifyResetToken(token, 'a-different-site')).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = signResetToken(customerId, siteId, Date.now() - 1000);
    expect(verifyResetToken(token, siteId)).toBeNull();
  });

  it('rejects a tampered token', () => {
    const token = signResetToken(customerId, siteId, Date.now() + 60_000);
    const tampered = token.slice(0, -2) + 'zz';
    expect(verifyResetToken(tampered, siteId)).toBeNull();
  });

  it('rejects garbage input without throwing', () => {
    expect(verifyResetToken('', siteId)).toBeNull();
    expect(verifyResetToken('no-dot-here', siteId)).toBeNull();
  });
});

describe('site-customer reset — single-use claim (Redis SET NX)', () => {
  const token = 'sample-token-for-redis-claim-test';
  const key = resetTokenUsedKey(token);

  afterEach(async () => {
    await getRedis().del(key);
  });

  afterAll(async () => {
    await closeRedis();
  });

  it('the first claim succeeds, a second claim of the same token is rejected', async () => {
    const first = await getRedis().set(key, '1', 'EX', 60, 'NX');
    expect(first).toBe('OK');

    const second = await getRedis().set(key, '1', 'EX', 60, 'NX');
    expect(second).toBeNull();
  });

  it('different tokens hash to different keys (no accidental collision)', () => {
    expect(resetTokenUsedKey('token-a')).not.toBe(resetTokenUsedKey('token-b'));
  });
});
