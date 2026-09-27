import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { QrScanDto, QrTokensQueryDto, QrCheckInsQueryDto } from './qr.dto';
import * as controller from './qr.controller';

const router = Router();
router.use(authenticate, setTenant, auditLog);

const ADMIN_ONLY = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);
const KIOSK = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER);
const SELF = requireRole(
  UserRole.ADMIN,
  UserRole.TEACHER,
  UserRole.ACCOUNTANT,
  UserRole.LIBRARIAN,
  UserRole.TRANSPORT_OFFICER,
  UserRole.MANAGEMENT,
  UserRole.STUDENT,
);

router.get('/tokens', ADMIN_ONLY, validate({ query: QrTokensQueryDto }), controller.listTokens);
router.get('/my-token', SELF, controller.getMyToken);
router.post('/scan', KIOSK, validate({ body: QrScanDto }), controller.scan);
router.get('/check-ins', KIOSK, validate({ query: QrCheckInsQueryDto }), controller.listCheckIns);

export default router;
