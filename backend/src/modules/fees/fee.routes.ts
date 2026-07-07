// ⚠️ APPROVAL GATE: This file contains billing & fee logic and needs review.
import { Router } from 'express';
import { FeeController } from './fee.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import {
  CreateFeeCategorySchema,
  UpdateFeeCategorySchema,
  CreateInvoiceSchema,
  RecordPaymentSchema,
} from './fee.dto';

const router = Router();

// Secure all routes with authentication and tenant resolution
router.use(authenticate, setTenant);

// Fee Categories CRUD
router.post(
  '/categories',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  validate({ body: CreateFeeCategorySchema }),
  FeeController.createCategory
);

router.put(
  '/categories/:id',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  validate({ body: UpdateFeeCategorySchema }),
  FeeController.updateCategory
);

router.get(
  '/categories',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT),
  FeeController.listCategories
);

// Invoices CRUD
router.post(
  '/invoices',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT),
  validate({ body: CreateInvoiceSchema }),
  FeeController.createInvoice
);

router.get(
  '/invoices/:id',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.GUARDIAN, UserRole.STUDENT),
  FeeController.getInvoice
);

router.get(
  '/invoices',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.GUARDIAN, UserRole.STUDENT),
  FeeController.listInvoices
);

// Payments (Offline entry and online generation)
router.post(
  '/invoices/:id/payments/offline',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT),
  validate({ body: RecordPaymentSchema }),
  FeeController.recordOfflinePayment
);

router.post(
  '/invoices/:id/payments/online',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.GUARDIAN, UserRole.STUDENT),
  FeeController.initiateOnlinePayment
);

export default router;
