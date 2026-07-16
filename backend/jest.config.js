// Set before anything else loads env.ts — dotenv (loaded via setupFiles
// below) does not override an already-set process.env var by default, so
// this reliably wins over NODE_ENV=development in .env, cross-platform,
// without adding a cross-env dependency.
process.env.NODE_ENV = 'test';

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  testTimeout: 30000,
  // The app's Redis client (rate limiting / invoice numbering) auto-reconnects
  // forever if Redis isn't reachable, which is expected in a plain test run
  // without docker-compose up. That keeps the process alive after tests
  // finish, so force the runner to exit once results are in.
  forceExit: true,
  // These tests hit a real Postgres via Prisma (no mocking) — see
  // tests/helpers/fixtures.ts. Point DATABASE_URL at a disposable test
  // database before running `npm test`; never point it at production data.
  setupFiles: ['dotenv/config'],
};
