import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import {
  CreateNoticeDto,
  UpdateNoticeDto,
  NoticeQueryDto,
  NoticeIdParamDto,
} from './notices.dto';
import * as noticesController from './notices.controller';

const router = Router();

// Apply auth + tenant to all notice routes
router.use(authenticate, setTenant, auditLog);

const WRITE_ROLES = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER);

// Reads intentionally open to all authenticated roles in the tenant — everyone
// reads notices, per the README Role Permission Matrix.
router.post('/', WRITE_ROLES, validate({ body: CreateNoticeDto }), noticesController.createNotice);
router.get('/', validate({ query: NoticeQueryDto }), noticesController.listNotices);
router.get('/:id', validate({ params: NoticeIdParamDto }), noticesController.getNotice);
router.put('/:id', WRITE_ROLES, validate({ params: NoticeIdParamDto, body: UpdateNoticeDto }), noticesController.updateNotice);
router.delete('/:id', WRITE_ROLES, validate({ params: NoticeIdParamDto }), noticesController.deleteNotice);

export default router;
