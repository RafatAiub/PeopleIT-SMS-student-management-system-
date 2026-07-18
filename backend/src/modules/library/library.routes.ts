import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import { CreateLibraryBookDto, IssueBookDto, ReturnBookDto } from './library.dto';
import * as libraryController from './library.controller';

const router = Router();

router.use(authenticate, setTenant);

const STAFF_ROLES = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LIBRARIAN);

// Self-service — STUDENT/GUARDIAN view their own (or linked children's) book
// issues, scoped server-side. Must be declared before any ':id'-style routes.
router.get('/me/issues', requireRole(UserRole.STUDENT, UserRole.GUARDIAN), libraryController.getMyIssues);

router.post('/books', STAFF_ROLES, validate({ body: CreateLibraryBookDto }), libraryController.createBook);
router.get('/books', STAFF_ROLES, libraryController.getBooks);

router.post('/issues', STAFF_ROLES, validate({ body: IssueBookDto }), libraryController.issueBook);
router.get('/issues', STAFF_ROLES, libraryController.getIssues);
router.put('/issues/:issueId/return', STAFF_ROLES, validate({ body: ReturnBookDto }), libraryController.returnBook);

export default router;
