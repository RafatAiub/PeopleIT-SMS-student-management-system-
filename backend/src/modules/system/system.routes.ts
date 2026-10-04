import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { successResponse } from '../../utils/response';
import { prisma } from '../../config/prisma';

// System Update page. Code updates ship through git + CI deploys, and schema
// changes through `prisma migrate deploy` — there is deliberately no
// "upload a zip to update" endpoint, since executing uploaded code would be a
// remote-code-execution hole. This endpoint only reports what is running.
// Mounted at /api/v1/system.
const router = Router();

router.use(authenticate, requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN));

// Same relative depth from src/modules/system (ts-node) and dist/modules/system (build).
const PACKAGE_JSON_PATH = path.join(__dirname, '../../../package.json');

function readVersion(): string {
  try {
    return JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8')).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

const APP_VERSION = readVersion();
const STARTED_AT = new Date();

router.get('/info', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const migrations = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
      SELECT migration_name, finished_at FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY finished_at DESC`;

    successResponse(res, {
      version: APP_VERSION,
      environment: process.env.NODE_ENV ?? 'development',
      nodeVersion: process.version,
      startedAt: STARTED_AT,
      appliedMigrations: migrations.length,
      latestMigration: migrations[0]?.migration_name ?? null,
      latestMigrationAt: migrations[0]?.finished_at ?? null,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
