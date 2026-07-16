import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import {
  CreateStaffDto,
  StaffQueryDto,
  StaffIdParamDto,
  ProcessPayrollDto,
  PayrollQueryDto,
  PayrollIdParamDto,
} from './hr.dto';
import * as hrController from './hr.controller';

const router = Router();

// Apply auth + tenant + audit logging to all HR routes
router.use(authenticate, setTenant, auditLog);

const ADMIN_ONLY = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);
const ADMIN_AND_ACCOUNTANT_READ = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT);

// Staff endpoints
router.post('/staff', ADMIN_ONLY, validate({ body: CreateStaffDto }), hrController.createStaff);
router.get('/staff', ADMIN_AND_ACCOUNTANT_READ, validate({ query: StaffQueryDto }), hrController.listStaff);
router.get('/staff/:id', ADMIN_AND_ACCOUNTANT_READ, validate({ params: StaffIdParamDto }), hrController.getStaff);

// Payroll endpoints — salary data, kept tightly scoped
router.post('/payroll', ADMIN_ONLY, validate({ body: ProcessPayrollDto }), hrController.processPayroll);
router.get('/payroll', ADMIN_AND_ACCOUNTANT_READ, validate({ query: PayrollQueryDto }), hrController.listPayrolls);
router.get('/payroll/:id', ADMIN_AND_ACCOUNTANT_READ, validate({ params: PayrollIdParamDto }), hrController.getPayroll);
router.post('/payroll/:id/pay', ADMIN_ONLY, validate({ params: PayrollIdParamDto }), hrController.payPayroll);

export default router;
