import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import { CreateInstitutionDto, UpdateWebsiteConfigDto } from './institution.dto';
import * as institutionController from './institution.controller';

const router = Router();

// Create new institution and its admin (Super Admin only, no tenant set yet)
router.post(
  '/',
  authenticate,
  requireRole(UserRole.SUPER_ADMIN),
  validate({ body: CreateInstitutionDto }),
  institutionController.createInstitution
);

// List all institutions (Super Admin only, no tenant set yet)
router.get(
  '/',
  authenticate,
  requireRole(UserRole.SUPER_ADMIN),
  institutionController.listInstitutions
);

// Update sub-institute admin credentials (Super Admin only, no tenant set yet)
router.put(
  '/:id/admin',
  authenticate,
  requireRole(UserRole.SUPER_ADMIN),
  institutionController.updateInstitutionAdmin
);

// Apply auth + tenant + audit logging to other institution routes
router.use(authenticate, setTenant, auditLog);

router.get('/website', institutionController.getWebsiteConfig);
router.put('/website', validate({ body: UpdateWebsiteConfigDto }), institutionController.updateWebsiteConfig);

export default router;
