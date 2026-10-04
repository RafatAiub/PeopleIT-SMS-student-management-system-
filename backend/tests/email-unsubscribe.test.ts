import { prisma } from '../src/config/prisma';
import { signUnsubscribeToken, verifyUnsubscribeToken, applyUnsubscribe, unsubscribeUrl } from '../src/modules/email/unsubscribe';

describe('unsubscribe token', () => {
  const email = `unsub-token-${Date.now()}@example.com`;

  afterAll(async () => {
    await prisma.emailSuppression.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('round-trips email + institutionId', () => {
    const token = signUnsubscribeToken({ email, institutionId: 'inst_123' });
    const decoded = verifyUnsubscribeToken(token);
    expect(decoded).toEqual({ email, institutionId: 'inst_123' });
  });

  it('rejects a tampered token', () => {
    const token = signUnsubscribeToken({ email });
    const [body] = token.split('.');
    const tampered = `${body}.deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef`;
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it('rejects garbage input without throwing', () => {
    expect(verifyUnsubscribeToken('')).toBeNull();
    expect(verifyUnsubscribeToken('not-a-token')).toBeNull();
    expect(verifyUnsubscribeToken('a.b')).toBeNull();
  });

  it('unsubscribeUrl() embeds a verifiable token', () => {
    const url = unsubscribeUrl({ email });
    const token = new URL(url).searchParams.get('token');
    expect(token).toBeTruthy();
    expect(verifyUnsubscribeToken(token!)?.email).toBe(email);
  });

  it('applyUnsubscribe() suppresses BULK scope only, and is idempotent', async () => {
    const token = signUnsubscribeToken({ email });
    const first = await applyUnsubscribe(token, 'test');
    expect(first).toEqual({ ok: true, email });

    const rows = await prisma.emailSuppression.findMany({ where: { email } });
    expect(rows).toHaveLength(1);
    expect(rows[0].scope).toBe('BULK');

    // Clicking the link twice must not create a second row or error.
    const second = await applyUnsubscribe(token, 'test');
    expect(second.ok).toBe(true);
    expect(await prisma.emailSuppression.count({ where: { email } })).toBe(1);
  });

  it('applyUnsubscribe() with an invalid token reports failure without touching the DB', async () => {
    const result = await applyUnsubscribe('garbage', 'test');
    expect(result).toEqual({ ok: false });
  });
});
