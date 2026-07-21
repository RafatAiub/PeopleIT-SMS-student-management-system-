import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import { CreateInstitutionDto, UpdateWebsiteConfigDto, UpdateInstitutionAdminDto } from './institution.dto';
import * as institutionController from './institution.controller';

const router = Router();

// Public list for dropdown login
router.get('/public/list', institutionController.listPublicInstitutions);

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
  validate({ body: UpdateInstitutionAdminDto }),
  institutionController.updateInstitutionAdmin
);

// Apply auth + tenant + audit logging to other institution routes
router.use(authenticate, setTenant, auditLog);

const WRITE_ROLES = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);

// Read intentionally open to all authenticated roles in the tenant — the
// selected fields (name, logo, phone, email, address, theme/hero/about,
// public contact email/phone) are non-sensitive branding/contact info that
// role-specific dashboards (e.g. GuardianDashboard) legitimately read to
// display the school's name and contact details. Writes are Admin-only.
router.get('/website', institutionController.getWebsiteConfig);
router.put('/website', WRITE_ROLES, validate({ body: UpdateWebsiteConfigDto }), institutionController.updateWebsiteConfig);

export default router;
