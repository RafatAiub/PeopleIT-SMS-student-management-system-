// ⚠️ APPROVAL GATE: billing & fee logic (P2 student fees).
import { Router, Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { requireRole } from '../../../middleware/rbac.middleware';
import { validate } from '../../../middleware/validate.middleware';
import { successResponse } from '../../../utils/response';
import {
  BulkProfileDto,
  CancelInvoiceDto,
  CollectDto,
  CounterSearchQueryDto,
  EndProfileDto,
  FineParamDto,
  FineRuleDto,
  FineRuleUpdateDto,
  IdParamDto,
  ListProfilesQueryDto,
  MonthlyRunDto,
  PaymentIdParamDto,
  ProfileDto,
  RefundDto,
  ReversePaymentDto,
  SettingsDto,
  StudentIdParamDto,
  WaiveFineDto,
} from './studentFees.dto';
import * as settings from './studentFees.settings';
import * as profiles from './studentFees.profiles';
import * as monthly from './studentFees.monthly';
import * as counter from './studentFees.counter';
import * as adjust from './studentFees.adjust';
import type { FeeCtx } from './studentFees.shared';

// Mounted by fee.routes.ts at /fees — inherits authenticate + setTenant +
// auditLog from that router, so no app.ts change is needed.
const router = Router();

const STAFF = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT);
const ADMIN = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);

const ctxOf = (req: Request): FeeCtx => ({ institutionId: req.tenantId!, userId: req.user!.sub, role: req.user!.role });

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };

// ── Settings → Fees ──
router.get('/settings/monthly', STAFF, wrap(async (req, res) => successResponse(res, await settings.getSettingsView(req.tenantId!))));
router.put(
  '/settings/monthly',
  ADMIN,
  validate({ body: SettingsDto }),
  wrap(async (req, res) => successResponse(res, await settings.updateSettings(ctxOf(req), req.body), 'Fee settings saved')),
);

router.get('/fine-rules', STAFF, wrap(async (req, res) => successResponse(res, await settings.listFineRules(req.tenantId!))));
router.post(
  '/fine-rules',
  ADMIN,
  validate({ body: FineRuleDto }),
  wrap(async (req, res) => successResponse(res, await settings.createFineRule(ctxOf(req), req.body), 'Fine rule added', 201)),
);
router.put(
  '/fine-rules/:id',
  ADMIN,
  validate({ params: IdParamDto, body: FineRuleUpdateDto }),
  wrap(async (req, res) => successResponse(res, await settings.updateFineRule(ctxOf(req), req.params.id, req.body), 'Fine rule saved')),
);
router.delete(
  '/fine-rules/:id',
  ADMIN,
  validate({ params: IdParamDto }),
  wrap(async (req, res) => {
    await settings.deleteFineRule(ctxOf(req), req.params.id);
    successResponse(res, null, 'Fine rule removed');
  }),
);

// ── Student fee profile ──
router.get(
  '/profiles',
  STAFF,
  validate({ query: ListProfilesQueryDto }),
  wrap(async (req, res) => successResponse(res, await profiles.listProfiles(req.tenantId!, req.query as never))),
);
router.get(
  '/profiles/students/:studentId',
  STAFF,
  validate({ params: StudentIdParamDto }),
  wrap(async (req, res) => successResponse(res, await profiles.studentProfiles(req.tenantId!, req.params.studentId))),
);
router.post(
  '/profiles/bulk',
  STAFF,
  validate({ body: BulkProfileDto }),
  wrap(async (req, res) => {
    const r = await profiles.bulkCreateProfiles(ctxOf(req), req.body);
    successResponse(res, r, `Custom fee set for ${r.created} student(s)`, 201);
  }),
);
router.post(
  '/profiles',
  STAFF,
  validate({ body: ProfileDto }),
  wrap(async (req, res) => successResponse(res, await profiles.createProfile(ctxOf(req), req.body), 'Custom fee saved', 201)),
);
router.post(
  '/profiles/:id/end',
  STAFF,
  validate({ params: IdParamDto, body: EndProfileDto }),
  wrap(async (req, res) => successResponse(res, await profiles.endProfile(ctxOf(req), req.params.id, req.body), 'Custom fee updated')),
);

// ── Monthly invoices ──
router.post(
  '/monthly/preview',
  STAFF,
  validate({ body: MonthlyRunDto }),
  wrap(async (req, res) => successResponse(res, await monthly.previewMonthly(req.tenantId!, req.body.period, { classId: req.body.classId }))),
);
router.post(
  '/monthly/generate',
  STAFF,
  validate({ body: MonthlyRunDto }),
  wrap(async (req, res) => {
    const r = await monthly.generateMonthly(req.tenantId!, req.body.period, { classId: req.body.classId, userId: req.user!.sub, source: 'MANUAL' });
    successResponse(res, r, `${r.createdCount} invoice(s) generated`, 201);
  }),
);

// ── Collect-fee counter ──
router.get(
  '/counter/search',
  STAFF,
  validate({ query: CounterSearchQueryDto }),
  wrap(async (req, res) => successResponse(res, await counter.searchStudents(req.tenantId!, String(req.query.q)))),
);
router.get('/counter/today', STAFF, wrap(async (req, res) => successResponse(res, await counter.myCollectionsToday(ctxOf(req)))));
router.get(
  '/counter/students/:studentId',
  STAFF,
  validate({ params: StudentIdParamDto }),
  wrap(async (req, res) => successResponse(res, await counter.studentDues(req.tenantId!, req.params.studentId))),
);
router.post(
  '/counter/collect',
  STAFF,
  validate({ body: CollectDto }),
  wrap(async (req, res) => successResponse(res, await counter.collect(ctxOf(req), req.body), 'Payment recorded', 201)),
);

// ── Cancel / reverse / refund / fine waiver ──
router.post(
  '/invoices/:id/cancel',
  STAFF,
  validate({ params: IdParamDto, body: CancelInvoiceDto }),
  wrap(async (req, res) => successResponse(res, await adjust.cancelInvoice(ctxOf(req), req.params.id, req.body.reason), 'Invoice cancelled')),
);
router.get(
  '/invoices/:id/history',
  STAFF,
  validate({ params: IdParamDto }),
  wrap(async (req, res) => successResponse(res, await adjust.invoiceHistory(req.tenantId!, req.params.id))),
);
router.post(
  '/invoices/:id/fines/:fineId/waive',
  ADMIN,
  validate({ params: FineParamDto, body: WaiveFineDto }),
  wrap(async (req, res) => successResponse(res, await adjust.waiveFine(ctxOf(req), req.params.id, req.params.fineId, req.body), 'Fine waived')),
);
router.post(
  '/payments/:paymentId/reverse',
  ADMIN,
  validate({ params: PaymentIdParamDto, body: ReversePaymentDto }),
  wrap(async (req, res) => successResponse(res, await adjust.reversePayment(ctxOf(req), req.params.paymentId, req.body.reason), 'Payment reversed')),
);
router.get(
  '/payments/:paymentId/refunds',
  STAFF,
  validate({ params: PaymentIdParamDto }),
  wrap(async (req, res) => successResponse(res, await adjust.refundInfo(req.tenantId!, req.params.paymentId))),
);
router.post(
  '/payments/:paymentId/refunds',
  STAFF,
  validate({ params: PaymentIdParamDto, body: RefundDto }),
  wrap(async (req, res) => successResponse(res, await adjust.recordRefund(ctxOf(req), req.params.paymentId, req.body), 'Refund recorded', 201)),
);

export default router;
