import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { successResponse, paginatedResponse } from '../../utils/response';
import * as service from './fee-setup.service';

// Fees > Assign Fees Classes and Fees > Fees Transactions Logs. Kept out of
// fee.routes.ts (approval-gated billing logic): these endpoints never create
// invoices or move money — class-fee assignment is configuration and the
// transaction log is read-only.
const router = Router();

router.use(authenticate, setTenant, auditLog);

const ADMIN = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);
const FINANCE_READ = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT);

const IdParam = z.object({ id: z.string().min(1) });
const ClassFeeBody = z.object({
  classId: z.string().min(1, 'Class is required'),
  items: z
    .array(
      z.object({
        feeCategoryId: z.string().min(1, 'Fee type is required'),
        amount: z.coerce.number().positive('Amount must be positive'),
      }),
    )
    .min(1, 'Add at least one fee type'),
});
const PaymentsQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().optional(),
  method: z.string().optional(),
});

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };

router.get(
  '/class-fees',
  FINANCE_READ,
  wrap(async (req, res) => successResponse(res, await service.listClassFees(req.tenantId!))),
);

router.put(
  '/class-fees',
  ADMIN,
  validate({ body: ClassFeeBody }),
  wrap(async (req, res) =>
    successResponse(res, await service.setClassFees(req.tenantId!, req.body), 'Class fees saved successfully'),
  ),
);

router.delete(
  '/class-fees/:id',
  ADMIN,
  validate({ params: IdParam }),
  wrap(async (req, res) => {
    await service.deleteClassFee(req.tenantId!, req.params.id);
    successResponse(res, null, 'Class fee removed');
  }),
);

router.get(
  '/payments',
  FINANCE_READ,
  validate({ query: PaymentsQuery }),
  wrap(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof PaymentsQuery>;
    const { payments, total } = await service.listPayments(req.tenantId!, query);
    paginatedResponse(res, payments, total, query.page, query.pageSize);
  }),
);

export default router;
