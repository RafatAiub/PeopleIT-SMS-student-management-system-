import { z } from 'zod';

export const HolidayTypeEnum = z.enum(['WEEKLY', 'GOVERNMENT', 'SCHOOL']);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');
const sessionYear = z.coerce.number().int().min(2000).max(2100);
const weeklyOffDays = z.array(z.number().int().min(0).max(6)).max(7);

// endDate is optional — when set, one holiday row is created for every day
// from date to endDate (e.g. a 10-day winter vacation).
export const CreateHolidayDto = z
  .object({
    date: isoDate,
    endDate: isoDate.optional(),
    title: z.string().trim().min(2).max(150),
    description: z.string().trim().max(1000).optional(),
    type: HolidayTypeEnum.default('SCHOOL'),
  })
  .refine((d) => !d.endDate || d.endDate >= d.date, {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  })
  .refine((d) => !d.endDate || d.endDate.slice(0, 4) === d.date.slice(0, 4), {
    message: 'A holiday range must stay within one session year',
    path: ['endDate'],
  });

export const UpdateHolidayDto = z.object({
  date: isoDate.optional(),
  title: z.string().trim().min(2).max(150).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  type: HolidayTypeEnum.optional(),
});

export const HolidayQueryDto = z.object({
  year: sessionYear,
});

export const HolidayIdParamDto = z.object({
  id: z.string().min(1),
});

export const HolidayYearParamDto = z.object({
  year: sessionYear,
});

export const UpdateHolidaySettingsDto = z.object({
  weeklyOffDays,
});

export const RestoreHolidayDefaultsDto = z.object({
  includeWeekly: z.boolean().default(true),
  includeGovernment: z.boolean().default(true),
});

export type CreateHolidayDtoType = z.infer<typeof CreateHolidayDto>;
export type UpdateHolidayDtoType = z.infer<typeof UpdateHolidayDto>;
export type UpdateHolidaySettingsDtoType = z.infer<typeof UpdateHolidaySettingsDto>;
export type RestoreHolidayDefaultsDtoType = z.infer<typeof RestoreHolidayDefaultsDto>;
