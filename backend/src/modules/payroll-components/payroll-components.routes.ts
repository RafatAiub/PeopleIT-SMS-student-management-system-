import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import {
  AssignComponentsDto,
  ComponentQueryDto,
  CreateComponentDto,
  IdParamDto,
  StaffParamDto,
  UpdateComponentDto,
} from './payroll-components.dto';
import * as controller from './payroll-components.controller';

const router = Router();
router.use(authenticate, setTenant, auditLog);

// Same split as /hr: writes are admin-only, ACCOUNTANT may read.
const ADMIN_ONLY = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);
const ADMIN_AND_ACCOUNTANT_READ = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT);

router.get('/', ADMIN_AND_ACCOUNTANT_READ, validate({ query: ComponentQueryDto }), controller.list);
router.post('/', ADMIN_ONLY, validate({ body: CreateComponentDto }), controller.create);
router.get('/staff/:staffId', ADMIN_AND_ACCOUNTANT_READ, validate({ params: StaffParamDto }), controller.getStaffComponents);
router.put(
  '/staff/:staffId',
  ADMIN_ONLY,
  validate({ params: StaffParamDto, body: AssignComponentsDto }),
  controller.assignStaffComponents,
);
router.patch('/:id', ADMIN_ONLY, validate({ params: IdParamDto, body: UpdateComponentDto }), controller.update);
router.delete('/:id', ADMIN_ONLY, validate({ params: IdParamDto }), controller.remove);

export default router;
