import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { CreateLibraryBookDto, IssueBookDto, ReturnBookDto } from './library.dto';
import * as libraryController from './library.controller';

const router = Router();

router.use(authenticate, setTenant);

router.post('/books', validate({ body: CreateLibraryBookDto }), libraryController.createBook);
router.get('/books', libraryController.getBooks);

router.post('/issues', validate({ body: IssueBookDto }), libraryController.issueBook);
router.get('/issues', libraryController.getIssues);
router.put('/issues/:issueId/return', validate({ body: ReturnBookDto }), libraryController.returnBook);

export default router;
