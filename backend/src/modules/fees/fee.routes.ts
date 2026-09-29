// ⚠️ APPROVAL GATE: This file contains billing & fee logic and needs review.
import { Router } from 'express';
import { FeeController } from './fee.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { UserRole } from '@prisma/client';
import {
  CreateFeeCategorySchema,
  UpdateFeeCategorySchema,
  CreateInvoiceSchema,
  RecordPaymentSchema,
  InitiateOnlinePaymentSchema,
  DemoConfirmSchema,
  TxnIdParamSchema,
  PaymentIdParamSchema,
} from './fee.dto';
import concessionRouter from './concessions/concession.routes';
import { BulkInvoiceDto, ListBatchesQueryDto } from './bulk/bulk.dto';
import { ReconciliationQueryDto } from './reconciliation/reconciliation.service';

const ALL_FEE_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.GUARDIAN, UserRole.STUDENT];
const STAFF_FEE_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT];

const router = Router();

// Secure all routes with authentication and tenant resolution
router.use(authenticate, setTenant, auditLog);

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

router.delete(
  '/categories/:id',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  FeeController.deleteCategory
);

// -- Wave C: concessions (sub-router inherits auth/tenant/audit above) --
router.use('/concessions', concessionRouter);

// -- Wave C: bulk invoicing, overdue sweep, batches --
// Registered before '/invoices/:id' so these literal paths are never
// captured as an invoice id.
router.post(
  '/invoices/bulk/preview',
  requireRole(...STAFF_FEE_ROLES),
  validate({ body: BulkInvoiceDto }),
  FeeController.previewBulkInvoices
);

router.post(
  '/invoices/bulk',
  requireRole(...STAFF_FEE_ROLES),
  validate({ body: BulkInvoiceDto }),
  FeeController.generateBulkInvoices
);

router.get(
  '/invoices/batches',
  requireRole(...STAFF_FEE_ROLES),
  validate({ query: ListBatchesQueryDto }),
  FeeController.listInvoiceBatches
);

router.post(
  '/invoices/mark-overdue',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  FeeController.markOverdue
);

// -- Wave C: online payment helpers, receipts, reconciliation --
router.get('/payments/gateways', requireRole(...ALL_FEE_ROLES), FeeController.listGateways);

router.get(
  '/payments/online/:txnId',
  requireRole(...ALL_FEE_ROLES),
  validate({ params: TxnIdParamSchema }),
  FeeController.getOnlineTransaction
);

// Demo-only: rejected (403) whenever the transaction's gateway has real
// credentials configured or the transaction is not a demo transaction.
router.post(
  '/payments/online/:txnId/demo-confirm',
  requireRole(...ALL_FEE_ROLES),
  validate({ params: TxnIdParamSchema, body: DemoConfirmSchema }),
  FeeController.confirmDemoTransaction
);

router.get(
  '/payments/:paymentId/receipt',
  requireRole(...ALL_FEE_ROLES),
  validate({ params: PaymentIdParamSchema }),
  FeeController.getReceipt
);

router.get(
  '/reconciliation',
  requireRole(...STAFF_FEE_ROLES),
  validate({ query: ReconciliationQueryDto }),
  FeeController.reconciliation
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
  validate({ body: InitiateOnlinePaymentSchema }),
  FeeController.initiateOnlinePayment
);

export default router;
