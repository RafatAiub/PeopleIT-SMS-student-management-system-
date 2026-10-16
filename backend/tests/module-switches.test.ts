import express from 'express';
import request from 'supertest';
import app from '../src/app';
import { authenticate } from '../src/middleware/auth.middleware';
import { setTenant } from '../src/middleware/tenant.middleware';
import { requireModule } from '../src/middleware/requireModule.middleware';
import { globalErrorHandler } from '../src/middleware/error.middleware';
import { clearModuleCache } from '../src/modules/institution/modules.service';
import {
  MODULE_KEYS,
  MODULE_REGISTRY,
  ModuleUpdateError,
  mergeModuleUpdate,
  parseStoredModules,
  resolveModules,
  resolveSwitches,
} from '../src/modules/institution/modules.registry';
import { createTestInstitution, cleanupInstitution, disconnectFixtures, prisma, type InstitutionFixture } from './helpers/fixtures';

// =============================================================================
// T0 module switches — pure registry logic, the GET/PUT API, plan
// entitlements (with super-admin override) and the requireModule() gate.
// Hits a real Postgres (DATABASE_URL must point at a disposable copy DB).
// =============================================================================

describe('module registry (pure)', () => {
  it('has the brief’s keys and defaults: Islamic off, optional on', () => {
    expect(MODULE_KEYS).toEqual(['islamic.donations', 'islamic.character', 'islamic.hifz', 'tutor_payouts', 'appointments', 'mailbox']);
    for (const m of MODULE_REGISTRY) {
      expect(m.defaultEnabled).toBe(m.group === 'optional');
      expect(m.labelBn.length).toBeGreaterThan(0);
      expect(m.descriptionBn.length).toBeGreaterThan(0);
    }
  });

  it('drops unknown keys and non-boolean values from storage', () => {
    expect(parseStoredModules({ 'islamic.donations': true, bogus: true, mailbox: 'yes' })).toEqual({ 'islamic.donations': true });
    expect(parseStoredModules(null)).toEqual({});
    expect(parseStoredModules([1, 2])).toEqual({});
  });

  it('falls back to defaults for absent keys', () => {
    const s = resolveSwitches({ mailbox: false });
    expect(s.mailbox).toBe(false);
    expect(s.appointments).toBe(true);
    expect(s['islamic.donations']).toBe(false);
  });

  it('enabled = switched on AND entitled', () => {
    const r = resolveModules({ 'islamic.donations': true, 'islamic.hifz': true }, (k) => k !== 'islamic.hifz');
    const by = Object.fromEntries(r.map((m) => [m.key, m]));
    expect(by['islamic.donations'].enabled).toBe(true);
    expect(by['islamic.hifz'].switchedOn).toBe(true);
    expect(by['islamic.hifz'].enabled).toBe(false);
  });

  it('rejects unknown keys and unentitled switch-ons; allows switching off; super admin needs an override', () => {
    expect(() => mergeModuleUpdate(null, { nope: true }, () => true, false)).toThrow(ModuleUpdateError);
    expect(() => mergeModuleUpdate(null, { mailbox: 'on' }, () => true, false)).toThrow(ModuleUpdateError);
    expect(() => mergeModuleUpdate(null, { 'islamic.hifz': true }, () => false, false)).toThrow(/Not included in your current plan/);
    expect(mergeModuleUpdate(null, { 'islamic.hifz': false }, () => false, false).next).toEqual({ 'islamic.hifz': false });
    const sa = mergeModuleUpdate(null, { 'islamic.hifz': true }, () => false, true);
    expect(sa.needsOverride).toEqual(['islamic.hifz']);
    expect(sa.changed).toEqual(['islamic.hifz']);
  });
});

describe('/api/v1/institution/modules + requireModule()', () => {
  let a: InstitutionFixture;
  let b: InstitutionFixture;
  let planId: string | null = null;

  // A tiny app with one route behind the real auth → tenant → module chain.
  const gated = express();
  gated.get('/probe', authenticate, setTenant, requireModule('islamic.donations'), (_req, res) => {
    res.json({ success: true });
  });
  gated.use(globalErrorHandler);

  beforeAll(async () => {
    a = await createTestInstitution('modsw-a');
    b = await createTestInstitution('modsw-b');
  }, 60_000);

  afterAll(async () => {
    for (const f of [a, b]) {
      await prisma.institutionFeatureOverride.deleteMany({ where: { institutionId: f.institutionId } }).catch(() => undefined);
      await prisma.subscription.deleteMany({ where: { institutionId: f.institutionId } }).catch(() => undefined);
    }
    if (planId) {
      await prisma.planFeature.deleteMany({ where: { planId } }).catch(() => undefined);
      await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    }
    await cleanupInstitution(a);
    await cleanupInstitution(b);
    await disconnectFixtures();
  });

  const get = (f: InstitutionFixture, role: keyof InstitutionFixture['usersByRole'] = 'ADMIN') =>
    request(app).get('/api/v1/institution/modules').set('Authorization', `Bearer ${f.usersByRole[role].token}`);
  const put = (f: InstitutionFixture, modules: Record<string, unknown>, role: keyof InstitutionFixture['usersByRole'] = 'ADMIN') =>
    request(app).put('/api/v1/institution/modules').set('Authorization', `Bearer ${f.usersByRole[role].token}`).send({ modules });

  it('every signed-in role can read the switches; defaults apply', async () => {
    for (const role of ['ADMIN', 'TEACHER', 'GUARDIAN', 'STUDENT'] as const) {
      const res = await get(a, role);
      expect(res.status).toBe(200);
      expect(res.body.data.enabled['islamic.donations']).toBe(false);
      expect(res.body.data.enabled.mailbox).toBe(true);
      expect(res.body.data.modules).toHaveLength(MODULE_KEYS.length);
    }
  });

  it('gate returns 403 MODULE_DISABLED while the module is off', async () => {
    const res = await request(gated).get('/probe').set('Authorization', `Bearer ${a.usersByRole.ADMIN.token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MODULE_DISABLED');
    expect(res.body.module).toBe('islamic.donations');
  });

  it('only ADMIN (or super admin) may write', async () => {
    expect((await put(a, { 'islamic.donations': true }, 'TEACHER')).status).toBe(403);
    expect((await put(a, { 'islamic.donations': true }, 'ACCOUNTANT')).status).toBe(403);
  });

  it('validates keys and values', async () => {
    expect((await put(a, { 'not.a.module': true })).status).toBe(422);
    expect((await put(a, { mailbox: 'yes' })).status).toBe(422);
    expect((await put(a, {})).status).toBe(422);
  });

  it('ADMIN switches a module on → gate opens, and the change is audit-logged', async () => {
    const res = await put(a, { 'islamic.donations': true, mailbox: false });
    expect(res.status).toBe(200);
    expect(res.body.data.enabled['islamic.donations']).toBe(true);
    expect(res.body.data.enabled.mailbox).toBe(false);

    const probe = await request(gated).get('/probe').set('Authorization', `Bearer ${a.usersByRole.TEACHER.token}`);
    expect(probe.status).toBe(200);

    const audit = await prisma.auditLog.findFirst({ where: { institutionId: a.institutionId, action: 'MODULES_UPDATED' } });
    expect(audit).not.toBeNull();
    expect((audit!.metadata as { changed: string[] }).changed.sort()).toEqual(['islamic.donations', 'mailbox']);
  });

  it('is tenant-isolated: school B is unaffected by school A', async () => {
    const res = await get(b);
    expect(res.body.data.enabled['islamic.donations']).toBe(false);
    expect(res.body.data.enabled.mailbox).toBe(true);
    const probe = await request(gated).get('/probe').set('Authorization', `Bearer ${b.usersByRole.ADMIN.token}`);
    expect(probe.status).toBe(403);
  });

  it('a plan without the module blocks ADMIN; a super admin can override for that school only', async () => {
    await prisma.featureFlag.upsert({
      where: { key: 'islamic.hifz' },
      create: { key: 'islamic.hifz', defaultEnabled: true },
      update: {},
    });
    const plan = await prisma.plan.create({ data: { name: 'T0 test plan', slug: `t0-test-${Date.now()}` } });
    planId = plan.id;
    await prisma.planFeature.create({ data: { planId: plan.id, featureKey: 'islamic.hifz', enabled: false } });
    await prisma.subscription.create({
      data: {
        institutionId: b.institutionId,
        planId: plan.id,
        billingCycle: 'MONTHLY',
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    clearModuleCache(b.institutionId);

    const read = await get(b);
    const hifz = read.body.data.modules.find((m: { key: string }) => m.key === 'islamic.hifz');
    expect(hifz.entitled).toBe(false);

    const blocked = await put(b, { 'islamic.hifz': true });
    expect(blocked.status).toBe(422);
    expect(blocked.body.message).toMatch(/plan/i);

    const sa = await request(app)
      .put('/api/v1/institution/modules')
      .set('Authorization', `Bearer ${b.usersByRole.SUPER_ADMIN.token}`)
      .set('X-Institution-Id', b.institutionId)
      .send({ modules: { 'islamic.hifz': true } });
    expect(sa.status).toBe(200);
    expect(sa.body.data.enabled['islamic.hifz']).toBe(true);
    const override = await prisma.institutionFeatureOverride.findUnique({
      where: { institutionId_featureKey: { institutionId: b.institutionId, featureKey: 'islamic.hifz' } },
    });
    expect(override?.enabled).toBe(true);
  });
});
