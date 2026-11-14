// Runs before every test file (jest setupFiles). Tests never read backend/.env:
// it points at PRODUCTION (database, Redis, SMTP, gateways). Everything a test
// needs must come from the shell or from the safe local defaults below.
process.env.SKIP_DOTENV = 'true';
process.env.NODE_ENV = 'test';

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('../../src/config/blockProdDotenv');

const localDefaults: Record<string, string> = {
  REDIS_URL: 'redis://:sms_redis_pass@localhost:6379',
  JWT_ACCESS_SECRET: 'test-access-secret-not-for-production-000000001',
  JWT_REFRESH_SECRET: 'test-refresh-secret-not-for-production-00000002',
  BACKGROUND_JOBS: 'false',
};
for (const [name, value] of Object.entries(localDefaults)) {
  if (!process.env[name]) process.env[name] = value;
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    'Set DATABASE_URL to a local test database (e.g. postgresql://sms_user:sms_pass@localhost:5433/sms_track_x). ' +
      'Tests never fall back to backend/.env.',
  );
}
