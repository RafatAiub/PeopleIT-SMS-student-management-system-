import http from 'http';
import { app } from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { closeRedis } from './config/redis';
import { logger } from './utils/logger';
import { feeReminderWorker } from './queues/reminderWorker';

const server = http.createServer(app);

const PORT = env.PORT || 3001;

async function startServer() {
  try {
    // Test Database connection
    await prisma.$connect();
    logger.info('Database connected successfully');

    // Worker is initialized on file import, make sure it is ready
    logger.info(`BullMQ Worker registered and listening on queue 'feeReminders'`);

    server.listen(PORT, () => {
      logger.info(`Server is running in ${env.NODE_ENV} mode on port ${PORT}`);
      logger.info(`Health check endpoint: ${env.APP_URL}/health`);
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
      // Shutdown BullMQ Worker
      await feeReminderWorker.close();
      logger.info('BullMQ worker closed');

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
