import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { rateLimit } from 'express-rate-limit';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { env } from '../../config/env';
import {
  ApplicationStatusQueryDto,
  BoardQueryDto,
  ConvertEnquiryDto,
  CreateEnquiryDto,
  EnquiryQueryDto,
  FunnelQueryDto,
  IdParamDto,
  PublicEnquiryDto,
  UpdateEnquiryDto,
  UpdateEnquiryStatusDto,
} from './enquiries.dto';
import * as controller from './enquiries.controller';

// =============================================================================
// Admissions CRM — mounted at /api/v1/enquiries (SUPER_ADMIN, ADMIN)
// =============================================================================

const MANAGERS = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);

export const enquiriesRouter = Router();
enquiriesRouter.use(authenticate, setTenant, auditLog);

// Literal paths first so they never match '/:id'.
enquiriesRouter.get('/board', MANAGERS, validate({ query: BoardQueryDto }), controller.board);
enquiriesRouter.get('/funnel', MANAGERS, validate({ query: FunnelQueryDto }), controller.funnel);
enquiriesRouter.get('/assignees', MANAGERS, controller.assignees);
enquiriesRouter.get('/', MANAGERS, validate({ query: EnquiryQueryDto }), controller.list);
enquiriesRouter.post('/', MANAGERS, validate({ body: CreateEnquiryDto }), controller.create);
enquiriesRouter.get('/:id', MANAGERS, validate({ params: IdParamDto }), controller.get);
enquiriesRouter.put('/:id', MANAGERS, validate({ params: IdParamDto, body: UpdateEnquiryDto }), controller.update);
enquiriesRouter.patch(
  '/:id/status',
  MANAGERS,
  validate({ params: IdParamDto, body: UpdateEnquiryStatusDto }),
  controller.updateStatus,
);
enquiriesRouter.post(
  '/:id/convert',
  MANAGERS,
  validate({ params: IdParamDto, body: ConvertEnquiryDto }),
  controller.convert,
);
enquiriesRouter.delete('/:id', MANAGERS, validate({ params: IdParamDto }), controller.remove);

// =============================================================================
// Public admissions — mounted at /api/v1/admissions-public (NO auth)
// POST /enquiries          — website enquiry form (per institution slug)
// GET  /application-status — applicant checks status with reference + phone
//
// Rate limits live here rather than in app.ts so mounting is one line. Both
// are per-IP; the status check is also an enumeration surface, hence a cap.
// =============================================================================

const isDev = env.NODE_ENV === 'development';

const enquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 1000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many enquiries from this IP, please try again later' },
  skip: () => env.NODE_ENV === 'test',
});

const statusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many status checks from this IP, please try again later' },
  skip: () => env.NODE_ENV === 'test',
});

export const admissionsPublicRouter = Router();

admissionsPublicRouter.post(
  '/enquiries',
  enquiryLimiter,
  validate({ body: PublicEnquiryDto }),
  controller.publicCapture,
);
admissionsPublicRouter.get(
  '/application-status',
  statusLimiter,
  validate({ query: ApplicationStatusQueryDto }),
  controller.publicApplicationStatus,
);

export default enquiriesRouter;
