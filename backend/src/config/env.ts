import dotenv from 'dotenv';
import path from 'path';

// Load env file from current CWD or subfolder fallback
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env') });

import { z } from 'zod';


// =============================================================================
// Environment Variable Schema — Validated at startup
// Any missing/invalid var will crash the app immediately with a clear message.
// =============================================================================

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  APP_NAME: z.string().default('PeopleIT SMS'),
  APP_URL: z.string().url().default('http://localhost:3001'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  // Comma-separated list of additional allowed CORS origins (e.g. Vercel preview URLs).
  // Must be explicit hosts — no wildcard domain suffixes are honored.
  ALLOWED_ORIGINS: z.string().optional(),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // Authentication
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),

  // Payment Gateways
  BKASH_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  BKASH_APP_KEY: z.string().optional(),
  BKASH_APP_SECRET: z.string().optional(),
  BKASH_USERNAME: z.string().optional(),
  BKASH_PASSWORD: z.string().optional(),
  BKASH_BASE_URL: z.string().url().optional(),

  NAGAD_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  NAGAD_MERCHANT_ID: z.string().optional(),
  NAGAD_MERCHANT_PRIVATE_KEY: z.string().optional(),
  NAGAD_MERCHANT_PUBLIC_KEY: z.string().optional(),
  NAGAD_BASE_URL: z.string().url().optional(),

  SSLCOMMERZ_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  SSLCOMMERZ_STORE_ID: z.string().optional(),
  SSLCOMMERZ_STORE_PASSWORD: z.string().optional(),
  SSLCOMMERZ_BASE_URL: z.string().url().optional(),

  // SMS
  SMS_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  SMS_PROVIDER: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  // Greenweb — the Bangladesh SMS gateway named in reminderWorker.ts as the
  // intended provider. Gated behind SMS_ENABLED, same as Twilio above.
  GREENWEB_API_TOKEN: z.string().optional(),
  GREENWEB_BASE_URL: z.string().url().default('https://api.greenweb.com.bd/api.php'),

  // Email — SMTP via nodemailer. Disabled by default: with EMAIL_ENABLED=false
  // the channel still renders and "sends" every message through nodemailer's
  // jsonTransport (recorded SENT, no network call, no real delivery) until a
  // real provider is configured — see modules/notifications/channels/email.channel.ts.
  EMAIL_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  EMAIL_FROM: z.string().default('PeopleIT SMS <noreply@peopleit.com>'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['pretty', 'json']).default('json'),
}).superRefine((data, ctx) => {
  // Fail fast at startup: if the SSLCommerz platform-billing gateway is
  // enabled, its credentials must be fully present — a partially-configured
  // gateway would otherwise only fail at first checkout, in production.
  if (data.SSLCOMMERZ_ENABLED) {
    if (!data.SSLCOMMERZ_STORE_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SSLCOMMERZ_STORE_ID is required when SSLCOMMERZ_ENABLED=true',
        path: ['SSLCOMMERZ_STORE_ID'],
      });
    }
    if (!data.SSLCOMMERZ_STORE_PASSWORD) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SSLCOMMERZ_STORE_PASSWORD is required when SSLCOMMERZ_ENABLED=true',
        path: ['SSLCOMMERZ_STORE_PASSWORD'],
      });
    }
    if (!data.SSLCOMMERZ_BASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SSLCOMMERZ_BASE_URL is required when SSLCOMMERZ_ENABLED=true',
        path: ['SSLCOMMERZ_BASE_URL'],
      });
    }
  }

  // Same fail-fast contract as the gateway above: a half-configured mail
  // transport must crash at boot, not at the first invoice email in production.
  if (data.EMAIL_ENABLED) {
    for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'] as const) {
      if (!data[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${key} is required when EMAIL_ENABLED=true`,
          path: [key],
        });
      }
    }
  }
});

// Validate at module load time — throws on startup if env is invalid
const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parseResult.error.format());
  process.exit(1);
}

export const env = parseResult.data;
export type Env = z.infer<typeof envSchema>;
