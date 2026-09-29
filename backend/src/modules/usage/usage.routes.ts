import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { requireTenant } from '../../middleware/requireTenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UsageSummaryQueryDto } from './usage.dto';
import * as controller from './usage.controller';

// =============================================================================
// /api/v1/usage  (read-only; costs are estimates from COST_PER_*_BDT env vars)
//   GET /platform/summary?month=YYYY-MM   SUPER_ADMIN (cross-tenant, no tenant context)
//   GET /summary?month=YYYY-MM            SUPER_ADMIN (with X-Institution-Id), ADMIN — own institution
// =============================================================================

const router = Router();

router.get(
  '/platform/summary',
  authenticate,
  requireRole(UserRole.SUPER_ADMIN),
  validate({ query: UsageSummaryQueryDto }),
  controller.platformSummary,
);

router.get(
  '/summary',
  authenticate,
  setTenant,
  requireTenant,
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  validate({ query: UsageSummaryQueryDto }),
  controller.tenantSummary,
);

export default router;
