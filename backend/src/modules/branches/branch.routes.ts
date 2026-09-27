import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { checkLimit, requireFeature } from '../saas/entitlements.middleware';
import { BranchIdParamDto, BranchQueryDto, CreateBranchDto, UpdateBranchDto } from './branch.dto';
import * as controller from './branch.controller';

// =============================================================================
// Branches / campuses — /api/v1/branches (SUPER_ADMIN, ADMIN)
//   GET    /           paginated list with per-branch counts; echoes the
//                      validated X-Branch-Id as `selectedBranchId`
//   GET    /current    the branch named by X-Branch-Id (validated), or null
//   GET    /:id        one branch + counts
//   POST   /           create (feature "multi_branch" + plan limit "branches")
//   PATCH  /:id        update / activate / deactivate
//   DELETE /:id        hard delete, only when nothing references it
// =============================================================================

const router = Router();

router.use(authenticate, setTenant, auditLog);

const ADMINS = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);

router.get('/', ADMINS, validate({ query: BranchQueryDto }), controller.listBranches);
router.get('/current', ADMINS, controller.getCurrentBranch);
router.get('/:id', ADMINS, validate({ params: BranchIdParamDto }), controller.getBranch);
router.post(
  '/',
  ADMINS,
  validate({ body: CreateBranchDto }),
  requireFeature('multi_branch'),
  checkLimit('branches'),
  controller.createBranch,
);
router.patch(
  '/:id',
  ADMINS,
  validate({ params: BranchIdParamDto, body: UpdateBranchDto }),
  controller.updateBranch,
);
router.delete('/:id', ADMINS, validate({ params: BranchIdParamDto }), controller.deleteBranch);

export default router;
