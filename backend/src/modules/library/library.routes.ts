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

// STUDENT "own issues" self-service view is a future addition (needs
// ownership scoping); until then, library access is staff-only.
const STAFF_ROLES = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LIBRARIAN);

router.post('/books', STAFF_ROLES, validate({ body: CreateLibraryBookDto }), libraryController.createBook);
router.get('/books', STAFF_ROLES, libraryController.getBooks);

router.post('/issues', STAFF_ROLES, validate({ body: IssueBookDto }), libraryController.issueBook);
router.get('/issues', STAFF_ROLES, libraryController.getIssues);
router.put('/issues/:issueId/return', STAFF_ROLES, validate({ body: ReturnBookDto }), libraryController.returnBook);

export default router;
