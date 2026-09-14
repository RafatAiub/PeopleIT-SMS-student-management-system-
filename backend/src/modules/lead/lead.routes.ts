import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import { SubmitLeadDto, UpdateLeadDto } from './lead.dto';
import * as leadController from './lead.controller';

const router = Router();

// Public, unauthenticated, zero-friction lead capture for ad-driven traffic —
// no allowlist gate, no CAPTCHA. Rate-limited at the general public-endpoint
// tier in app.ts, same as institution-applications/apply.
router.post('/', validate({ body: SubmitLeadDto }), leadController.submitLead);

// Review/management — Super Admin only.
router.get('/', authenticate, requireRole(UserRole.SUPER_ADMIN), leadController.listLeads);
router.get('/:id', authenticate, requireRole(UserRole.SUPER_ADMIN), leadController.getLead);
router.patch(
  '/:id',
  authenticate,
  requireRole(UserRole.SUPER_ADMIN),
  validate({ body: UpdateLeadDto }),
  leadController.updateLead,
);

export default router;
