import { Router } from 'express';
import { z } from 'zod';
import { UserController } from './user.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import { CreateUserSchema, UpdateUserSchema, ChangePasswordSchema } from './user.dto';

const router = Router();

/**
 * The approver may correct the role the applicant asked for. Restricted to the
 * same non-privileged subset registration allows — granting ADMIN or
 * ACCOUNTANT is a deliberate act that belongs in full user management, not in
 * a one-click approval queue.
 */
const ApproveRegistrationSchema = z.object({
  role: z.enum([UserRole.STUDENT, UserRole.GUARDIAN, UserRole.TEACHER]).optional(),
});

// Secure all endpoints
router.use(authenticate, setTenant);

// Search users (available to any authenticated user)
router.get(
  '/search',
  UserController.searchUsers
);

// Change password (available to any authenticated user)
router.post(
  '/change-password',
  validate({ body: ChangePasswordSchema }),
  UserController.changePassword
);

// Approval queue for self-registered users. Mounted before '/:id' so
// 'pending-registrations' is not swallowed by the id parameter.
router.get(
  '/pending-registrations',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  UserController.listPendingRegistrations
);

router.post(
  '/pending-registrations/:id/approve',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  validate({ body: ApproveRegistrationSchema }),
  UserController.approveRegistration
);

router.post(
  '/pending-registrations/:id/reject',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  UserController.rejectRegistration
);

// Admin-only user management
router.post(
  '/',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  validate({ body: CreateUserSchema }),
  UserController.createUser
);

router.get(
  '/:id',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  UserController.getUser
);

router.get(
  '/',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  UserController.listUsers
);

router.put(
  '/:id',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  validate({ body: UpdateUserSchema }),
  UserController.updateUser
);

router.delete(
  '/:id',
  requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN),
  UserController.deleteUser
);

export default router;
