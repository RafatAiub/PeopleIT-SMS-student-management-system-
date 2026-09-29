import { Router } from 'express';
import { validate } from '../../middleware/validate.middleware';
import { PublicStudentApplicationDto } from './student.dto';
import * as studentController from './student.controller';

// =============================================================================
// Public Student Application Routes — mounted at /api/v1/student-applications
// GET  /classes?institutionSlug= — class picker for the registration form
// POST /apply                    — submit an Online Registration
//
// Deliberately PUBLIC (no authenticate/setTenant/auditLog) — a prospective
// student's guardian fills this in before ever having an account. Rate
// limited in app.ts, same tier as institution-applications/apply. The
// institution is always resolved server-side from institutionSlug — a
// client never supplies or infers an institutionId directly.
// =============================================================================

const router = Router();

router.get('/classes', studentController.listPublicClasses);
router.post('/apply', validate({ body: PublicStudentApplicationDto }), studentController.applyForAdmission);

export default router;
