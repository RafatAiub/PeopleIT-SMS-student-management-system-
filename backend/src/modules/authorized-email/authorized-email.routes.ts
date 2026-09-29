import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import { AddAuthorizedEmailDto } from './authorized-email.dto';
import * as authorizedEmailController from './authorized-email.controller';

const router = Router();

// Super Admin manages the allowlist that gates the public institution
// application form — no route here is public.
router.use(authenticate, requireRole(UserRole.SUPER_ADMIN));

router.get('/', authorizedEmailController.listAuthorizedEmails);
router.post('/', validate({ body: AddAuthorizedEmailDto }), authorizedEmailController.addAuthorizedEmail);
router.delete('/:id', authorizedEmailController.removeAuthorizedEmail);

export default router;
