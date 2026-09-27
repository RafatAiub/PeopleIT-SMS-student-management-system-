import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { StaffRoleDto, IdParamDto, ListQueryDto, CreateStaffMemberDto, UpdateStaffMemberDto } from './staff.dto';
import * as staffController from './staff.controller';

// Staff Management — Roles & Permissions + Staff. Mounted at /api/v1/staff-management.
const router = Router();

router.use(authenticate, setTenant, auditLog, requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN));

router.get('/roles', staffController.listRoles);
router.get('/roles/:id', validate({ params: IdParamDto }), staffController.getRole);
router.post('/roles', validate({ body: StaffRoleDto }), staffController.createRole);
router.put('/roles/:id', validate({ params: IdParamDto, body: StaffRoleDto }), staffController.updateRole);
router.delete('/roles/:id', validate({ params: IdParamDto }), staffController.deleteRole);

router.get('/staff', validate({ query: ListQueryDto }), staffController.listStaff);
router.post('/staff', validate({ body: CreateStaffMemberDto }), staffController.createStaff);
router.put('/staff/:id', validate({ params: IdParamDto, body: UpdateStaffMemberDto }), staffController.updateStaff);
router.delete('/staff/:id', validate({ params: IdParamDto }), staffController.deleteStaff);

export default router;
