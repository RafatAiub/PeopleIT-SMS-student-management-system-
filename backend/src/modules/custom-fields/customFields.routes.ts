import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import {
  CreateCustomFieldDto,
  CustomFieldQueryDto,
  IdParamDto,
  ReorderCustomFieldsDto,
  UpdateCustomFieldDto,
} from './customFields.dto';
import * as controller from './customFields.controller';

// =============================================================================
// Custom field definitions — mounted at /api/v1/custom-fields
// Read: the roles that can read student records (to render the fields).
// Write: SUPER_ADMIN, ADMIN.
// =============================================================================

const READERS = requireRole(
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.TEACHER,
  UserRole.ACCOUNTANT,
  UserRole.LIBRARIAN,
);
const MANAGERS = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);

const router = Router();
router.use(authenticate, setTenant, auditLog);

router.get('/', READERS, validate({ query: CustomFieldQueryDto }), controller.list);
router.post('/', MANAGERS, validate({ body: CreateCustomFieldDto }), controller.create);
router.put('/reorder', MANAGERS, validate({ body: ReorderCustomFieldsDto }), controller.reorder);
router.put('/:id', MANAGERS, validate({ params: IdParamDto, body: UpdateCustomFieldDto }), controller.update);
router.delete('/:id', MANAGERS, validate({ params: IdParamDto }), controller.remove);

export default router;
