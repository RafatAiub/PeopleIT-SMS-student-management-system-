import Redis, { RedisOptions } from 'ioredis';
import type { ConnectionOptions } from 'bullmq';
import { env } from './env';
import { logger } from '../utils/logger';

// bullmq pins its own exact copy of ioredis, so an instance created from this
// package's ioredis is structurally the same API but a different declared type.
// Handing it to bullmq is correct at runtime; this alias documents the one
// place that mismatch is bridged.
type BullConnection = ConnectionOptions;

// =============================================================================
// Redis connection management
//
// One place that (a) forces TLS for providers that require it, (b) hands out a
// small, fixed set of connections instead of one-per-Queue/Worker, and (c)
// logs state *changes* only — a flapping managed Redis otherwise fills the log
// with identical "connected/closed" lines every second.
// =============================================================================

// Managed Redis hosts that only accept TLS. A URL copied from a provider's
// dashboard often reads `redis://…` next to a separate `--tls` CLI flag; used
// verbatim, ioredis connects in plaintext, the host resets the socket, and the
// client reconnect-loops forever (ECONNRESET / "max retries per request").
const TLS_ONLY_HOST = /\.(upstash\.io|redis-cloud\.com|redislabs\.com|rediss?\.cloud)$/i;

/** Upgrade `redis://` → `rediss://` when the host mandates TLS. */
export function normalizeRedisUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.protocol === 'redis:' && TLS_ONLY_HOST.test(u.hostname)) {
      u.protocol = 'rediss:';
      logger.warn(
        `REDIS_URL host "${u.hostname}" requires TLS — scheme upgraded redis:// → rediss://. ` +
          'Set REDIS_URL with rediss:// to silence this.',
      );
      return u.toString();
    }
  } catch {
    logger.error('REDIS_URL is not a valid URL — connecting with it verbatim');
  }
  return raw;
}

const REDIS_URL = normalizeRedisUrl(env.REDIS_URL);
export const REDIS_IS_TLS = REDIS_URL.startsWith('rediss://');
export const REDIS_HOST = (() => {
  try {
    return new URL(REDIS_URL).hostname;
  } catch {
    return 'unknown';
  }
})();

// Shared reconnect behaviour: capped backoff so a provider outage never
// stretches to minute-long gaps, and reconnect on the transient errors a
// managed Redis throws during failover.
const baseOptions: RedisOptions = {
  retryStrategy: (times) => Math.min(times * 200, 2000),
  reconnectOnError: (err) => /READONLY|ECONNRESET|ETIMEDOUT|EPIPE/i.test(err.message),
  keepAlive: 30_000,
  connectTimeout: 15_000,
};

// Every client created here is tracked so closeRedis() can drain them all on
// graceful shutdown (BullMQ does not own connections it is handed).
const clients: Redis[] = [];

function makeClient(label: string, overrides: RedisOptions): Redis {
  const client = new Redis(REDIS_URL, { ...baseOptions, ...overrides });
  clients.push(client);

  let lastState = '';
  const mark = (state: string, level: 'info' | 'warn' = 'info') => {
    if (state === lastState) return;
    lastState = state;
    logger[level](`Redis[${label}] ${state}`);
  };
  client.on('ready', () => mark('ready'));
  client.on('end', () => mark('disconnected', 'warn'));
  client.on('error', (err: Error) => mark(`error: ${err.message}`, 'warn'));

  return client;
}

// ── App singleton ────────────────────────────────────────────────────────
// Request-path use only (invoice counter, health probe). Bounded per-command
// retries so a Redis outage fails a call fast instead of hanging a request —
// callers already have fallbacks.
let appClient: Redis | null = null;
export function getRedis(): Redis {
  if (!appClient) {
    appClient = makeClient('app', {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: true,
    });
  }
  return appClient;
}

// ── BullMQ: one shared connection for every Queue ────────────────────────
// Producers only issue short commands, so sharing one connection across all
// queues is the documented BullMQ pattern and keeps the socket count low
// enough for a managed / free Redis tier.
let queueConn: Redis | null = null;
export function getBullQueueConnection(): BullConnection {
  if (!queueConn) {
    queueConn = makeClient('bullmq:queues', {
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: false,
    });
  }
  return queueConn as unknown as BullConnection;
}

// ── BullMQ: one dedicated connection per Worker ──────────────────────────
// A Worker holds a blocking command (BRPOPLPUSH); multiplexing anything else
// onto that socket would stall it, so each Worker gets its own.
export function createBullWorkerConnection(name: string): BullConnection {
  return makeClient(`bullmq:worker:${name}`, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  }) as unknown as BullConnection;
}

/** Bounded connectivity probe for startup logging. Never throws. */
export async function pingRedis(timeoutMs = 5000): Promise<boolean> {
  try {
    const pong = await Promise.race([
      getRedis().ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('ping timeout')), timeoutMs),
      ),
    ]);
    return pong === 'PONG';
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  await Promise.allSettled(
    clients.map((c) => c.quit().catch(() => c.disconnect())),
  );
  clients.length = 0;
  appClient = null;
  queueConn = null;
  logger.info('Redis connections closed');
}

// Eagerly create the app singleton (preserves the previous module contract).
export const redis = getRedis();
export default redis;
