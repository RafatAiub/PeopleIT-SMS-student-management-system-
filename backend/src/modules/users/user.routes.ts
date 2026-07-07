import { Router } from 'express';
import { UserController } from './user.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import { CreateUserSchema, UpdateUserSchema, ChangePasswordSchema } from './user.dto';

const router = Router();

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
