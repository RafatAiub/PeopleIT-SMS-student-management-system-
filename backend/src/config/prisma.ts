import { PrismaClient } from '@prisma/client';
import { env } from './env';
import { softDeleteMiddleware } from './softDelete';

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

// T5: hide trashed rows from every read (see softDelete.ts). Registered once
// even when the dev server reuses the global client across reloads.
const registered = globalThis as unknown as { __softDeleteRegistered?: boolean };
if (!registered.__softDeleteRegistered) {
  prisma.$use(softDeleteMiddleware);
  registered.__softDeleteRegistered = true;
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
