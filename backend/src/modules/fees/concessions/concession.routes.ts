import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireRole } from '../../../middleware/rbac.middleware';
import { validate } from '../../../middleware/validate.middleware';
import * as controller from './concession.controller';
import {
  AssignConcessionDto,
  CreateConcessionDto,
  IdParamDto,
  ListAssignmentsQueryDto,
  ListConcessionsQueryDto,
  StudentIdParamDto,
  UpdateConcessionDto,
} from './concession.dto';

// Mounted by fee.routes.ts at /fees/concessions — it inherits that router's
// authenticate + setTenant + auditLog, so no app.ts change is needed.
const router = Router();

const MANAGE = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);
const READ = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT);

// Assignments first so '/assignments' is never captured by '/:id'.
router.get('/assignments', READ, validate({ query: ListAssignmentsQueryDto }), controller.listAssignments);
router.post('/assignments', MANAGE, validate({ body: AssignConcessionDto }), controller.assignConcession);
router.delete('/assignments/:id', MANAGE, validate({ params: IdParamDto }), controller.unassignConcession);
router.get('/students/:studentId/active', READ, validate({ params: StudentIdParamDto }), controller.getStudentActiveConcessions);

router.get('/', READ, validate({ query: ListConcessionsQueryDto }), controller.listConcessions);
router.post('/', MANAGE, validate({ body: CreateConcessionDto }), controller.createConcession);
router.put('/:id', MANAGE, validate({ params: IdParamDto, body: UpdateConcessionDto }), controller.updateConcession);
router.delete('/:id', MANAGE, validate({ params: IdParamDto }), controller.deleteConcession);

export default router;
