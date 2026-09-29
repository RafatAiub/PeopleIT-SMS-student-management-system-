import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  AddSuppressionDto,
  EmailLogsQueryDto,
  RemoveSuppressionDto,
  SuppressionQueryDto,
  TestSendDto,
} from './email.admin.dto';
import * as controller from './email.admin.controller';

// =============================================================================
// Platform console (SUPER_ADMIN, cross-tenant, no setTenant — mirrors
// support.routes.ts's `platform` router / billing's superAdminBillingRouter).
// Mounted at /api/v1/email/admin in app.ts.
// =============================================================================

const router = Router();

router.use(authenticate, requireRole(UserRole.SUPER_ADMIN));

router.get('/status', controller.getStatus);
router.get('/logs', validate({ query: EmailLogsQueryDto }), controller.listLogs);

router.get('/suppressions', validate({ query: SuppressionQueryDto }), controller.listSuppressions);
router.post('/suppressions', validate({ body: AddSuppressionDto }), controller.addSuppression);
router.delete('/suppressions', validate({ query: RemoveSuppressionDto }), controller.removeSuppression);

router.post('/test-send', validate({ body: TestSendDto }), controller.testSend);

router.get('/templates', controller.listTemplates);
router.get('/templates/preview', controller.previewTemplate);

export default router;
