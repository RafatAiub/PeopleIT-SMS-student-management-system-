import { PrismaClient } from '@prisma/client';
import { env } from './env';

// =============================================================================
// Prisma Singleton — Connection pooling, query logging in dev only
// =============================================================================

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'error' },
            { emit: 'stdout', level: 'warn' },
          ]
        : [{ emit: 'stdout', level: 'error' }],
    errorFormat: 'colorless',
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Attach query timing logger in development
if (env.NODE_ENV === 'development') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (prisma as any).$on('query', (e: { query: string; duration: number }) => {
    if (e.duration > 500) {
      // Log slow queries (>500ms)
      console.warn(`🐢 Slow query (${e.duration}ms): ${e.query}`);
    }
  });
}

export default prisma;
