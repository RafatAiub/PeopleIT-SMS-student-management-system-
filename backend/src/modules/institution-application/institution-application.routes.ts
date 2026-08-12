import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import { SubmitApplicationDto, RejectApplicationDto } from './institution-application.dto';
import * as applicationController from './institution-application.controller';

const router = Router();

// Public self-service application form — the link Super Admin shares.
// TODO: no CAPTCHA/bot-protection here beyond the IP rate limit applied in
// app.ts (5 req/15min on this path) — known gap, acceptable for MVP.
router.post(
  '/apply',
  validate({ body: SubmitApplicationDto }),
  applicationController.submitApplication
);

// Review queue — Super Admin only
router.get('/', authenticate, requireRole(UserRole.SUPER_ADMIN), applicationController.listApplications);
router.get('/:id', authenticate, requireRole(UserRole.SUPER_ADMIN), applicationController.getApplication);
router.post('/:id/approve', authenticate, requireRole(UserRole.SUPER_ADMIN), applicationController.approveApplication);
router.post(
  '/:id/reject',
  authenticate,
  requireRole(UserRole.SUPER_ADMIN),
  validate({ body: RejectApplicationDto }),
  applicationController.rejectApplication
);

export default router;
