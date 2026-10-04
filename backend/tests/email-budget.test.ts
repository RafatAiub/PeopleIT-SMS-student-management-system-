// Real Redis (see SAFETY: run with the local-test REDIS_URL prefix, never
// production). Each scenario mocks env fresh via jest.doMock + resetModules
// (same pattern as email-transport-mode.test.ts) so EMAIL_DAILY_LIMIT /
// EMAIL_P1_HEADROOM can vary per test without one real .env.

function todayKey(): string {
  return `email:budget:${new Date().toISOString().slice(0, 10)}`;
}

describe('reserveBudgetSlot()', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let redisModule: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let budgetModule: any;

  afterEach(async () => {
    if (redisModule) {
      await redisModule.getRedis().del(todayKey()).catch(() => undefined);
      await redisModule.closeRedis().catch(() => undefined);
    }
    redisModule = undefined;
    budgetModule = undefined;
  });

  function load(overrides: Record<string, unknown> = {}) {
    jest.resetModules();
    jest.doMock('../src/config/env', () => ({
      env: {
        EMAIL_DAILY_LIMIT: 10,
        EMAIL_P1_HEADROOM: 50,
        NODE_ENV: 'test',
        REDIS_URL: process.env.REDIS_URL,
        ...overrides,
      },
    }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    redisModule = require('../src/config/redis');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    budgetModule = require('../src/modules/email/budget');
    return budgetModule;
  }

  it('P0_SECURITY is always allowed, even past the nominal limit', async () => {
    const { reserveBudgetSlot } = load();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { EmailPriority } = require('@prisma/client');
    for (let i = 0; i < 15; i++) {
      const decision = await reserveBudgetSlot(EmailPriority.P0_SECURITY);
      expect(decision.allowed).toBe(true);
    }
  });

  it('P1/P2 share a pool of (limit - 50 reserved) — with limit=10 that pool is 0, so the very first P2 send is deferred to next UTC midnight', async () => {
    const { reserveBudgetSlot } = load();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { EmailPriority } = require('@prisma/client');
    const decision = await reserveBudgetSlot(EmailPriority.P2_BULK);
    expect(decision.allowed).toBe(false);
    expect(decision.notBefore).toBeInstanceOf(Date);
    expect(decision.notBefore!.getTime()).toBeGreaterThan(Date.now());
  });

  it('does not leak a reserved-but-denied slot — a denied attempt does not count against the budget snapshot', async () => {
    const { reserveBudgetSlot, budgetSnapshot } = load();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { EmailPriority } = require('@prisma/client');
    await reserveBudgetSlot(EmailPriority.P2_BULK).catch(() => undefined);
    const snapshot = await budgetSnapshot();
    expect(snapshot.usedToday).toBe(0);
  });

  it('nextUtcMidnight() is always in the future and always at 00:00:00 UTC', () => {
    const { nextUtcMidnight } = load();
    const next = nextUtcMidnight();
    expect(next.getUTCHours()).toBe(0);
    expect(next.getUTCMinutes()).toBe(0);
    expect(next.getUTCSeconds()).toBe(0);
    expect(next.getTime()).toBeGreaterThan(Date.now());
  });

  // ── P1-over-P2 headroom (this round's fix) ─────────────────────────────
  // limit=110, P0 reserve=50 (hardcoded) => pooled=60. P1_HEADROOM=10 =>
  // P2 threshold=50, P1 threshold=60. So sends 51-60 must go through for P1
  // but be deferred for P2.
  describe('P1 gets priority over P2 within the shared pool (EMAIL_P1_HEADROOM)', () => {
    it('P2 is allowed while under its lower threshold (limit - P0reserve - headroom)', async () => {
      const { reserveBudgetSlot } = load({ EMAIL_DAILY_LIMIT: 110, EMAIL_P1_HEADROOM: 10 });
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { EmailPriority } = require('@prisma/client');
      for (let i = 0; i < 50; i++) {
        const decision = await reserveBudgetSlot(EmailPriority.P2_BULK);
        expect(decision.allowed).toBe(true);
      }
    });

    it('once usedToday is in the P1 headroom band, P2 defers but P1 still sends', async () => {
      const { reserveBudgetSlot } = load({ EMAIL_DAILY_LIMIT: 110, EMAIL_P1_HEADROOM: 10 });
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { EmailPriority } = require('@prisma/client');

      // Burn the first 50 slots with P1 sends (fills the shared pool up to
      // the edge of the P2-exclusive threshold).
      for (let i = 0; i < 50; i++) {
        const decision = await reserveBudgetSlot(EmailPriority.P1_TRANSACTIONAL);
        expect(decision.allowed).toBe(true);
      }

      // usedToday is now 50 == P2's threshold — the NEXT P2 send is denied...
      const p2Decision = await reserveBudgetSlot(EmailPriority.P2_BULK);
      expect(p2Decision.allowed).toBe(false);

      // ...but P1 has 10 more slots of headroom before it, too, is denied.
      for (let i = 0; i < 10; i++) {
        const decision = await reserveBudgetSlot(EmailPriority.P1_TRANSACTIONAL);
        expect(decision.allowed).toBe(true);
      }
      const p1Exhausted = await reserveBudgetSlot(EmailPriority.P1_TRANSACTIONAL);
      expect(p1Exhausted.allowed).toBe(false);
    });

    it('budgetSnapshot() reports p2RemainingBeforeDefer separately from the overall remaining', async () => {
      const { reserveBudgetSlot, budgetSnapshot } = load({ EMAIL_DAILY_LIMIT: 110, EMAIL_P1_HEADROOM: 10 });
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { EmailPriority } = require('@prisma/client');
      for (let i = 0; i < 45; i++) {
        await reserveBudgetSlot(EmailPriority.P1_TRANSACTIONAL);
      }
      const snapshot = await budgetSnapshot();
      expect(snapshot.usedToday).toBe(45);
      expect(snapshot.p1HeadroomOverP2).toBe(10);
      // P2 threshold is 50 (110 - 50 - 10) — 5 slots left before P2 defers.
      expect(snapshot.p2RemainingBeforeDefer).toBe(5);
      // Overall remaining (against the full 110) is much larger.
      expect(snapshot.remaining).toBe(65);
    });
  });
});
