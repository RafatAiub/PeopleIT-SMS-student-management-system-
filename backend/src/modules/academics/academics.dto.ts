import { z } from 'zod';

// Generic Id param validator — reused across every academics sub-resource
// (mediums/streams/shifts/semesters/classes/sections).
export const AcademicsIdParamDto = z.object({
  id: z.string().min(1, 'Invalid ID'),
});
export type AcademicsIdParamDtoType = z.infer<typeof AcademicsIdParamDto>;

// Medium / Stream / Shift / Semester are identical, institution-scoped
// name-only lookups — one DTO pair reused for all four.
export const CreateLookupDto = z.object({
  name: z.string().min(1, 'Name is required').max(100),
});
export type CreateLookupDtoType = z.infer<typeof CreateLookupDto>;

export const UpdateLookupDto = CreateLookupDto.partial();
export type UpdateLookupDtoType = z.infer<typeof UpdateLookupDto>;

export const CreateClassDto = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  level: z.number().int().min(1, 'Level must be at least 1'),
  mediumId: z.string().min(1).optional(),
  streamId: z.string().min(1).optional(),
  shiftId: z.string().min(1).optional(),
  semesterId: z.string().min(1).optional(),
});
export type CreateClassDtoType = z.infer<typeof CreateClassDto>;

export const UpdateClassDto = CreateClassDto.partial();
export type UpdateClassDtoType = z.infer<typeof UpdateClassDto>;

export const CreateSectionDto = z.object({
  name: z.string().min(1, 'Name is required').max(50),
  classId: z.string().min(1, 'classId is required'),
  classTeacherId: z.string().min(1).optional(),
});
export type CreateSectionDtoType = z.infer<typeof CreateSectionDto>;

export const UpdateSectionDto = CreateSectionDto.partial();
export type UpdateSectionDtoType = z.infer<typeof UpdateSectionDto>;

// classId is required on the list endpoint — matches the existing
// GET /students/meta/sections?classId= convention.
export const SectionQueryDto = z.object({
  classId: z.string().min(1, 'classId query parameter is required'),
});
export type SectionQueryDtoType = z.infer<typeof SectionQueryDto>;
