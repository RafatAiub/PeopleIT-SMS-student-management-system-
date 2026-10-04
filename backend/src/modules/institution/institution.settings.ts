import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { NotFoundError, ValidationError } from '../../utils/AppError';
import { successResponse } from '../../utils/response';
import { logger } from '../../utils/logger';
import { isMissingSchemaError } from '../saas/schemaGuard';

// =============================================================================
// Institution locale settings (Wave C columns on Institution):
//   timezone, dateFormat, numeralSystem, currency, defaultLanguage
//
//   GET /api/v1/institution/settings  every authenticated tenant user — the
//        frontend applies these as defaults for users who haven't picked their
//        own language/numerals/date format (non-sensitive, like /website).
//   PUT /api/v1/institution/settings  SUPER_ADMIN, ADMIN
//
// Before the Wave C migration is applied, GET returns the schema defaults with
// `persisted: false` and PUT answers 422 with a clear message instead of a raw
// database error.
// =============================================================================

export const DATE_FORMATS = ['D MMM YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const;
export const NUMERAL_SYSTEMS = ['latn', 'beng'] as const;
export const LANGUAGES = ['en', 'bn'] as const;

export const SETTINGS_DEFAULTS = {
  timezone: 'Asia/Dhaka',
  dateFormat: 'D MMM YYYY',
  numeralSystem: 'latn',
  currency: 'BDT',
  defaultLanguage: 'en',
} as const;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isValidCurrency(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat('en-US', { style: 'currency', currency: code });
    return true;
  } catch {
    return false;
  }
}

export const UpdateInstitutionSettingsDto = z
  .object({
    timezone: z.string().trim().max(64).refine(isValidTimeZone, 'Unknown time zone').optional(),
    dateFormat: z.enum(DATE_FORMATS).optional(),
    numeralSystem: z.enum(NUMERAL_SYSTEMS).optional(),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .refine(isValidCurrency, 'Use a 3-letter ISO currency code, e.g. BDT')
      .optional(),
    defaultLanguage: z.enum(LANGUAGES).optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'Nothing to update' });

export type UpdateInstitutionSettingsDtoType = z.infer<typeof UpdateInstitutionSettingsDto>;

const SELECT = {
  timezone: true,
  dateFormat: true,
  numeralSystem: true,
  currency: true,
  defaultLanguage: true,
} as const;

export async function getInstitutionSettings(institutionId: string) {
  try {
    const row = await prisma.institution.findUnique({ where: { id: institutionId }, select: SELECT });
    if (!row) throw new NotFoundError('Institution not found');
    return { ...row, persisted: true };
  } catch (error) {
    if (isMissingSchemaError(error)) return { ...SETTINGS_DEFAULTS, persisted: false };
    throw error;
  }
}

export async function updateInstitutionSettings(institutionId: string, data: UpdateInstitutionSettingsDtoType) {
  try {
    const row = await prisma.institution.update({ where: { id: institutionId }, data, select: SELECT });
    logger.info('Institution locale settings updated', { institutionId, fields: Object.keys(data) });
    return { ...row, persisted: true };
  } catch (error) {
    if (isMissingSchemaError(error)) {
      throw new ValidationError('Institution settings are not available yet — the database migration is pending.');
    }
    throw error;
  }
}

function tenantOf(req: Request): string {
  if (!req.tenantId) throw new ValidationError('Select an institution first — settings are tenant-scoped.');
  return req.tenantId;
}

export async function getSettingsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await getInstitutionSettings(tenantOf(req)));
  } catch (error) {
    next(error);
  }
}

export async function updateSettingsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await updateInstitutionSettings(tenantOf(req), req.body), 'Institution settings updated');
  } catch (error) {
    next(error);
  }
}
