// Pure-logic tests for the SaaS layer: entitlement resolution, limit math,
// user-agent parsing and onboarding checklist computation. None of these
// modules import prisma, so nothing here can touch a database.

import {
  allFeatureKeys,
  allLimitResources,
  evaluateLimit,
  limitExceededMessage,
  monthStartUtc,
  resolveFeature,
  resolveLimit,
  type EntitlementInput,
} from '../src/modules/saas/entitlements.logic';
import { clientIpFrom, parseUserAgent, sanitizeUserAgent } from '../src/modules/auth/sessions.logic';
import {
  computeChecklist,
  ONBOARDING_STEP_KEYS,
  updateSkipped,
  type OnboardingFacts,
} from '../src/modules/saas/onboarding.logic';

const base = (over: Partial<EntitlementInput> = {}): EntitlementInput => ({
  hasPlan: true,
  planStudentCap: null,
  flags: [],
  planFeatures: [],
  overrides: [],
  ...over,
});

describe('resolveFeature', () => {
  it('enables everything for a tenant with no plan', () => {
    const r = resolveFeature('library', base({ hasPlan: false, flags: [{ key: 'library', defaultEnabled: false }] }));
    expect(r.enabled).toBe(true);
    expect(r.source).toBe('no-plan');
  });

  it('lets a tenant override beat the plan, even with no plan', () => {
    const input = base({
      hasPlan: false,
      overrides: [{ featureKey: 'ai', enabled: false, limitValue: null }],
    });
    expect(resolveFeature('ai', input)).toMatchObject({ enabled: false, source: 'override' });
  });

  it('uses the plan row over the global default', () => {
    const input = base({
      flags: [{ key: 'hr', defaultEnabled: true }],
      planFeatures: [{ featureKey: 'hr', enabled: false, limitValue: null }],
    });
    expect(resolveFeature('hr', input)).toMatchObject({ enabled: false, source: 'plan' });
  });

  it('falls back to FeatureFlag.defaultEnabled, then to enabled', () => {
    const input = base({ flags: [{ key: 'transport', defaultEnabled: false }] });
    expect(resolveFeature('transport', input)).toMatchObject({ enabled: false, source: 'default' });
    expect(resolveFeature('library', input)).toMatchObject({ enabled: true, source: 'default' });
  });

  it('labels catalogue keys and unknown keys', () => {
    expect(resolveFeature('online_payments', base()).label).toBe('Online fee payments');
    expect(resolveFeature('something_new', base()).label).toBe('something_new');
  });
});

describe('resolveLimit', () => {
  it('is unlimited with no plan', () => {
    expect(resolveLimit('students', base({ hasPlan: false, planStudentCap: 10 }))).toMatchObject({
      limit: null,
      source: 'no-plan',
    });
  });

  it('uses Plan.studentCap for students when no PlanFeature row exists', () => {
    expect(resolveLimit('students', base({ planStudentCap: 300 }))).toMatchObject({ limit: 300, source: 'plan-cap' });
    expect(resolveLimit('staff', base({ planStudentCap: 300 }))).toMatchObject({ limit: null, source: 'default' });
  });

  it('prefers the PlanFeature row over studentCap', () => {
    const input = base({
      planStudentCap: 300,
      planFeatures: [{ featureKey: 'limit.students', enabled: true, limitValue: 500 }],
    });
    expect(resolveLimit('students', input)).toMatchObject({ limit: 500, source: 'plan' });
  });

  it('treats a disabled row as 0 and a null limitValue as unlimited', () => {
    const input = base({
      planFeatures: [
        { featureKey: 'limit.sms_per_month', enabled: false, limitValue: 1000 },
        { featureKey: 'limit.branches', enabled: true, limitValue: null },
      ],
    });
    expect(resolveLimit('sms_per_month', input).limit).toBe(0);
    expect(resolveLimit('branches', input).limit).toBeNull();
  });

  it('lets a tenant override raise a plan limit', () => {
    const input = base({
      planFeatures: [{ featureKey: 'limit.branches', enabled: true, limitValue: 1 }],
      overrides: [{ featureKey: 'limit.branches', enabled: true, limitValue: 5 }],
    });
    expect(resolveLimit('branches', input)).toMatchObject({ limit: 5, source: 'override' });
  });

  it('clamps negative configured limits to 0', () => {
    const input = base({ planFeatures: [{ featureKey: 'limit.staff', enabled: true, limitValue: -3 }] });
    expect(resolveLimit('staff', input).limit).toBe(0);
  });
});

describe('key discovery', () => {
  it('separates boolean features from limit keys and includes DB-only keys', () => {
    const input = base({
      flags: [{ key: 'limit.exams', defaultEnabled: true }, { key: 'report_builder', defaultEnabled: true }],
    });
    expect(allFeatureKeys(input)).toContain('report_builder');
    expect(allFeatureKeys(input)).not.toContain('limit.exams');
    expect(allLimitResources(input)).toContain('exams');
    expect(allLimitResources(input)).toContain('students');
  });
});

describe('evaluateLimit', () => {
  it('always allows when unlimited', () => {
    expect(evaluateLimit(null, 10_000, 1)).toMatchObject({ allowed: true, remaining: null, percent: null });
  });

  it('fails open when usage is unknown', () => {
    expect(evaluateLimit(5, null, 1)).toMatchObject({ allowed: true, used: null });
  });

  it('allows up to and including the limit', () => {
    expect(evaluateLimit(100, 99, 1).allowed).toBe(true);
    expect(evaluateLimit(100, 100, 1).allowed).toBe(false);
    expect(evaluateLimit(100, 95, 10).allowed).toBe(false);
  });

  it('reports remaining and a capped percentage', () => {
    expect(evaluateLimit(200, 50, 0)).toMatchObject({ remaining: 150, percent: 25 });
    expect(evaluateLimit(10, 25, 0)).toMatchObject({ remaining: 0, percent: 100 });
    expect(evaluateLimit(0, 0, 0)).toMatchObject({ allowed: true, percent: 100 });
    expect(evaluateLimit(0, 0, 1).allowed).toBe(false);
  });

  it('never lets a negative increment unlock anything', () => {
    expect(evaluateLimit(10, 12, -5).allowed).toBe(false);
  });
});

describe('limit helpers', () => {
  it('builds the month start in UTC', () => {
    expect(monthStartUtc(new Date('2026-09-27T18:30:00Z')).toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('words the limit message', () => {
    expect(limitExceededMessage('Active students', 300)).toBe(
      'Your plan allows 300 active students. Upgrade your plan to add more.',
    );
    expect(limitExceededMessage('Active branches', 0)).toMatch(/not included/);
  });
});

describe('parseUserAgent', () => {
  const cases: [string, string, string][] = [
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Chrome on Windows',
      'desktop',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0',
      'Edge on Windows',
      'desktop',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Safari on iPhone',
      'mobile',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
      'Samsung Internet on Android',
      'mobile',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0',
      'Firefox on macOS',
      'desktop',
    ],
    [
      'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0 Mobile/15E148 Safari/604.1',
      'Chrome on iPad',
      'tablet',
    ],
    ['PostmanRuntime/7.39.0', 'API client', 'unknown'],
  ];

  it.each(cases)('parses %s', (ua, label, deviceType) => {
    const d = parseUserAgent(ua);
    expect(d.label).toBe(label);
    expect(d.deviceType).toBe(deviceType);
  });

  it('handles missing user agents', () => {
    expect(parseUserAgent(null).label).toBe('Unknown device');
    expect(parseUserAgent('').label).toBe('Unknown device');
  });

  it('sanitises and truncates user agents', () => {
    expect(sanitizeUserAgent('   ')).toBeNull();
    expect(sanitizeUserAgent(42)).toBeNull();
    expect(sanitizeUserAgent('x'.repeat(2000))!.length).toBe(512);
  });

  it('extracts the client IP from X-Forwarded-For or the socket', () => {
    expect(clientIpFrom('203.0.113.7, 10.0.0.1', '127.0.0.1')).toBe('203.0.113.7');
    expect(clientIpFrom(undefined, '::ffff:192.168.1.20')).toBe('192.168.1.20');
    expect(clientIpFrom(undefined, undefined)).toBeNull();
  });
});

describe('computeChecklist', () => {
  const empty: OnboardingFacts = {
    profileComplete: false,
    hasLogo: false,
    academicYears: 0,
    classes: 0,
    sections: 0,
    subjects: 0,
    teachers: 0,
    students: 0,
    feeHeads: 0,
    gradingScales: 0,
    notices: 0,
  };
  const full: OnboardingFacts = {
    profileComplete: true,
    hasLogo: true,
    academicYears: 1,
    classes: 10,
    sections: 20,
    subjects: 12,
    teachers: 8,
    students: 400,
    feeHeads: 5,
    gradingScales: 1,
    notices: 3,
  };

  it('starts at zero for a brand-new institution', () => {
    const c = computeChecklist(empty, { skippedSteps: [], dismissed: false });
    expect(c.completed).toBe(0);
    expect(c.total).toBe(ONBOARDING_STEP_KEYS.length);
    expect(c.percent).toBe(0);
    expect(c.nextStep?.key).toBe('profile');
    expect(c.allDone).toBe(false);
  });

  it('is complete when all data exists', () => {
    const c = computeChecklist(full, { skippedSteps: [], dismissed: false });
    expect(c.allDone).toBe(true);
    expect(c.percent).toBe(100);
    expect(c.requiredRemaining).toBe(0);
    expect(c.nextStep).toBeNull();
    expect(c.items.find((i) => i.key === 'students')?.count).toBe(400);
  });

  it('counts skipped steps as complete, but done wins over skipped', () => {
    const c = computeChecklist(
      { ...full, gradingScales: 0, notices: 1 },
      { skippedSteps: ['grading_scale', 'notices'], dismissed: true },
    );
    const grading = c.items.find((i) => i.key === 'grading_scale')!;
    const notices = c.items.find((i) => i.key === 'notices')!;
    expect(grading).toMatchObject({ done: false, skipped: true });
    expect(notices).toMatchObject({ done: true, skipped: false });
    expect(c.allDone).toBe(true);
    expect(c.dismissed).toBe(true);
  });

  it('treats unknown grading data (migration pending) as not done', () => {
    const c = computeChecklist({ ...full, gradingScales: null }, { skippedSteps: [], dismissed: false });
    expect(c.items.find((i) => i.key === 'grading_scale')).toMatchObject({ done: false, count: null });
    expect(c.requiredRemaining).toBe(0); // grading is optional
  });
});

describe('updateSkipped', () => {
  it('adds, removes, de-duplicates and drops unknown keys, keeping step order', () => {
    expect(updateSkipped(['notices', 'bogus'], 'logo')).toEqual(['logo', 'notices']);
    expect(updateSkipped(['logo', 'notices'], undefined, 'logo')).toEqual(['notices']);
    expect(updateSkipped(['logo'], 'logo')).toEqual(['logo']);
    expect(updateSkipped([], 'not-a-step')).toEqual([]);
  });
});
