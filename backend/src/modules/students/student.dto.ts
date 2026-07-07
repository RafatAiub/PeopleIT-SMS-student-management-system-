import { z } from 'zod';

// =============================================================================
// Student DTOs — Zod schemas for student endpoints
// =============================================================================

export const CreateStudentDto = z.object({
  branchId: z.string().cuid().optional(),
  classId: z.string().cuid().optional(),
  sectionId: z.string().cuid().optional(),
  academicYearId: z.string().cuid().optional(),
  studentId: z.string().min(1, 'Student ID is required'),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
  address: z.string().max(500).optional(),
  bloodGroup: z.string().max(5).optional(),
  religion: z.string().max(50).optional(),
  nationality: z.string().max(100).default('Bangladeshi'),
  admissionDate: z.coerce.date().optional(),
  rollNumber: z.string().max(50).optional(),
  avatarUrl: z.string().optional(),
});

export const UpdateStudentDto = CreateStudentDto.partial().extend({
  status: z.enum(['ACTIVE', 'INACTIVE', 'GRADUATED', 'TRANSFERRED']).optional(),
});

export const StudentQueryDto = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  classId: z.string().cuid().optional(),
  sectionId: z.string().cuid().optional(),
  branchId: z.string().cuid().optional(),
  academicYearId: z.string().cuid().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'GRADUATED', 'TRANSFERRED']).optional(),
});

export const StudentIdParamDto = z.object({
  id: z.string().cuid('Invalid student ID'),
});

export const CreateStudentDocumentDto = z.object({
  name: z.string().min(1, 'Document name is required'),
  type: z.string().min(1, 'Document type is required'),
  fileUrl: z.string().url('Invalid file URL'),
  fileSize: z.number().int().positive().optional(),
  mimeType: z.string().optional(),
});

export type CreateStudentDtoType = z.infer<typeof CreateStudentDto>;
export type UpdateStudentDtoType = z.infer<typeof UpdateStudentDto>;
export type StudentQueryDtoType = z.infer<typeof StudentQueryDto>;
export type CreateStudentDocumentDtoType = z.infer<typeof CreateStudentDocumentDto>;
