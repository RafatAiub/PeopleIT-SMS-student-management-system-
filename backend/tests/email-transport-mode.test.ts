// Transport selection is pure and only depends on env — mock env per
// scenario via jest.doMock + resetModules so each case gets a fresh module
// instance (real env.ts freezes its parsed object at import time).
describe('currentTransportMode()', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  function loadWithEnv(overrides: Record<string, string | boolean | undefined>) {
    jest.doMock('../src/config/env', () => ({
      env: {
        BREVO_API_KEY: undefined,
        EMAIL_ENABLED: false,
        SMTP_HOST: undefined,
        EMAIL_TIMEOUT_MS: 15000,
        NODE_ENV: 'test',
        ...overrides,
      },
    }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../src/modules/email/transport');
  }

  it('picks brevo-api when BREVO_API_KEY is set, regardless of SMTP config', () => {
    const { currentTransportMode } = loadWithEnv({ BREVO_API_KEY: 'xkeysib-test', EMAIL_ENABLED: true, SMTP_HOST: 'smtp.example.com' });
    expect(currentTransportMode()).toBe('brevo-api');
  });

  it('falls back to smtp when EMAIL_ENABLED + SMTP_HOST are set and no Brevo key', () => {
    const { currentTransportMode } = loadWithEnv({ EMAIL_ENABLED: true, SMTP_HOST: 'smtp.example.com' });
    expect(currentTransportMode()).toBe('smtp');
  });

  it('falls back to demo when neither is configured — the "honest demo mode" case', () => {
    const { currentTransportMode } = loadWithEnv({});
    expect(currentTransportMode()).toBe('demo');
  });

  it('is demo when EMAIL_ENABLED is true but SMTP_HOST is missing (half-configured)', () => {
    const { currentTransportMode } = loadWithEnv({ EMAIL_ENABLED: true });
    expect(currentTransportMode()).toBe('demo');
  });
});
