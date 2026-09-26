import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';
import {
  CreateHolidayDto,
  UpdateHolidayDto,
  HolidayQueryDto,
  HolidayIdParamDto,
  HolidayYearParamDto,
  UpdateHolidaySettingsDto,
  RestoreHolidayDefaultsDto,
} from './holiday.dto';
import * as holidayController from './holiday.controller';

const router = Router();

router.use(authenticate, setTenant, auditLog);

const ADMIN_ONLY = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);

// Everyone in the institution (staff, students, guardians) can view the
// holiday list; only admins change it.
router.get('/', validate({ query: HolidayQueryDto }), holidayController.listHolidays);
router.post('/', ADMIN_ONLY, validate({ body: CreateHolidayDto }), holidayController.createHoliday);

// Year-level routes are mounted before /:id so "settings"/"restore-defaults"/"sync-government"
// segments are never read as a holiday id.
router.put(
  '/settings/:year',
  ADMIN_ONLY,
  validate({ params: HolidayYearParamDto, body: UpdateHolidaySettingsDto }),
  holidayController.updateHolidaySettings,
);
router.post(
  '/restore-defaults/:year',
  ADMIN_ONLY,
  validate({ params: HolidayYearParamDto, body: RestoreHolidayDefaultsDto }),
  holidayController.restoreHolidayDefaults,
);

router.post(
  '/sync-government/:year',
  ADMIN_ONLY,
  validate({ params: HolidayYearParamDto }),
  holidayController.syncGovernmentHolidays,
);

router.patch(
  '/:id',
  ADMIN_ONLY,
  validate({ params: HolidayIdParamDto, body: UpdateHolidayDto }),
  holidayController.updateHoliday,
);
router.delete('/:id', ADMIN_ONLY, validate({ params: HolidayIdParamDto }), holidayController.deleteHoliday);

export default router;
