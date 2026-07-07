import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

// =============================================================================
// Redis Singleton — Graceful error handling, no crash on disconnect
// =============================================================================

let redisClient: Redis | null = null;

function createRedisClient(): Redis {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    reconnectOnError: (err) => {
      logger.warn('Redis reconnect triggered by error', { error: err.message });
      return true; // Always reconnect
    },
  });

  client.on('connect', () => {
    logger.info('Redis connected successfully');
  });

  client.on('ready', () => {
    logger.info('Redis client ready');
  });

  client.on('error', (err: Error) => {
    logger.error('Redis client error', { error: err.message });
    // Do NOT throw — let ioredis handle reconnection
  });

  client.on('close', () => {
    logger.warn('Redis connection closed');
  });

  client.on('reconnecting', (delay: number) => {
    logger.info(`Redis reconnecting in ${delay}ms`);
  });

  return client;
}

export function getRedis(): Redis {
  if (!redisClient) {
    redisClient = createRedisClient();
  }
  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed gracefully');
  }
}

// Export a default instance for convenience
export const redis = getRedis();
export default redis;
