import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
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

// Staff endpoints
router.post('/staff', validate({ body: CreateStaffDto }), hrController.createStaff);
router.get('/staff', validate({ query: StaffQueryDto }), hrController.listStaff);
router.get('/staff/:id', validate({ params: StaffIdParamDto }), hrController.getStaff);

// Payroll endpoints
router.post('/payroll', validate({ body: ProcessPayrollDto }), hrController.processPayroll);
router.get('/payroll', validate({ query: PayrollQueryDto }), hrController.listPayrolls);
router.get('/payroll/:id', validate({ params: PayrollIdParamDto }), hrController.getPayroll);
router.post('/payroll/:id/pay', validate({ params: PayrollIdParamDto }), hrController.payPayroll);

export default router;
