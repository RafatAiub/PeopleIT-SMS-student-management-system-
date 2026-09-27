import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UpdateOnboardingDto } from './saas.dto';
import * as controller from './saas.controller';

// =============================================================================
// SaaS layer — /api/v1/saas
//   GET   /entitlements   every authenticated tenant user (plan, features, limits, usage)
//   GET   /onboarding     SUPER_ADMIN, ADMIN — computed setup checklist
//   PATCH /onboarding     SUPER_ADMIN, ADMIN — { dismissed?, skip?, unskip? }
// =============================================================================

const router = Router();

router.use(authenticate, setTenant, auditLog);

const ADMINS = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);

router.get('/entitlements', controller.getEntitlements);
router.get('/onboarding', ADMINS, controller.getOnboarding);
router.patch('/onboarding', ADMINS, validate({ body: UpdateOnboardingDto }), controller.updateOnboarding);

export default router;
