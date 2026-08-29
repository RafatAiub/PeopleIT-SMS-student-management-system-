import http from 'http';
import { app } from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { closeRedis } from './config/redis';
import { logger } from './utils/logger';
import { feeReminderWorker } from './queues/reminderWorker';
import { billingWorker } from './queues/billingWorker';
import { registerSubscriptionLifecycleJob } from './queues/billingQueue';

const server = http.createServer(app);

const PORT = env.PORT || 3001;

async function startServer() {
  try {
    // Test Database connection
    await prisma.$connect();
    logger.info('Database connected successfully');

    // Worker is initialized on file import, make sure it is ready
    logger.info(`BullMQ Worker registered and listening on queue 'feeReminders'`);
    logger.info(`BullMQ Worker registered and listening on queue 'subscriptionBilling'`);

    server.listen(PORT, () => {
      logger.info(`Server is running in ${env.NODE_ENV} mode on port ${PORT}`);
      logger.info(`Health check endpoint: ${env.APP_URL}/health`);
    });

    // Registers the repeatable subscription-lifecycle-scan job (fixed jobId,
    // safe to call on every restart — BullMQ won't duplicate it). Fired
    // AFTER the HTTP server is already listening, not awaited before it:
    // this call needs Redis (via billingQueue, configured per BullMQ's own
    // requirement with maxRetriesPerRequest: null), which means it retries
    // INDEFINITELY on connection trouble with no timeout. Blocking
    // server.listen() on it turns any transient Redis hiccup during boot
    // into an indefinite hang — which is exactly what previously made
    // Render's deploy health check time out and mark the deploy failed,
    // even though the HTTP server itself was otherwise fine. Registering
    // it after listen() means a slow/retrying Redis connection only delays
    // the repeatable job's registration, never the app's availability.
    registerSubscriptionLifecycleJob().catch((error) => {
      logger.error('Failed to register subscription-lifecycle-scan job', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// Graceful shutdown helper
async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}. Shutting down server gracefully...`);

  // Stop HTTP server from accepting new requests
  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      // Shutdown BullMQ Workers
      await feeReminderWorker.close();
      await billingWorker.close();
      logger.info('BullMQ workers closed');

      // Close Redis connection
      await closeRedis();

      // Disconnect Prisma client
      await prisma.$disconnect();
      logger.info('Prisma disconnected gracefully');

      process.exit(0);
    } catch (err) {
      logger.error('Error during graceful shutdown', {
        error: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
    }
  });

  // Force shutdown after 10s if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();
