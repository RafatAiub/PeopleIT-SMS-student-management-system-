import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import { CreateSessionYearDto, UpdateSessionYearDto, SessionYearIdParamDto } from './session-year.dto';
import * as sessionYearController from './session-year.controller';

const router = Router();

router.use(authenticate, setTenant, auditLog);

const ADMIN_ONLY = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);

// Read is open to every role in the institution — session-year pickers
// (events, reports, ...) and "current session" labels need it.
router.get('/', sessionYearController.listSessionYears);
router.post('/', ADMIN_ONLY, validate({ body: CreateSessionYearDto }), sessionYearController.createSessionYear);
router.patch(
  '/:id',
  ADMIN_ONLY,
  validate({ params: SessionYearIdParamDto, body: UpdateSessionYearDto }),
  sessionYearController.updateSessionYear,
);
router.post(
  '/:id/set-default',
  ADMIN_ONLY,
  validate({ params: SessionYearIdParamDto }),
  sessionYearController.setDefaultSessionYear,
);
router.delete('/:id', ADMIN_ONLY, validate({ params: SessionYearIdParamDto }), sessionYearController.deleteSessionYear);

export default router;
