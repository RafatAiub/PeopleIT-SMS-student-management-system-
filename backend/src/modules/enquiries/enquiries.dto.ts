import { z } from 'zod';

// =============================================================================
// Admission Enquiry (CRM) DTOs
// =============================================================================

export const EnquiryStatusEnum = z.enum(['NEW', 'CONTACTED', 'VISITED', 'APPLIED', 'ENROLLED', 'LOST']);
export const ENQUIRY_STATUSES = EnquiryStatusEnum.options;

const phone = z
  .string()
  .trim()
  .min(6, 'A valid phone number is required')
  .max(20)
  .regex(/^[+\d][\d\s-]{5,19}$/, 'A valid phone number is required');
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const emptyToNull = (v: unknown) => (v === '' ? null : v);

export const CreateEnquiryDto = z.object({
  studentName: z.string().trim().min(1, 'Student name is required').max(150),
  guardianName: optionalText(150),
  phone,
  email: z.preprocess(emptyToNull, z.string().trim().email('Invalid email').max(200).optional().nullable()),
  classInterested: optionalText(100),
  source: optionalText(60),
  status: EnquiryStatusEnum.default('NEW'),
  notes: optionalText(5000),
  assignedToUserId: z.preprocess(emptyToNull, z.string().min(1).optional().nullable()),
  followUpAt: z.preprocess(emptyToNull, z.coerce.date().optional().nullable()),
});

export const UpdateEnquiryDto = CreateEnquiryDto.partial();

export const UpdateEnquiryStatusDto = z.object({
  status: EnquiryStatusEnum,
  /** Optional note appended to the enquiry's notes with a timestamp. */
  note: z.string().trim().max(1000).optional(),
});

export const EnquiryQueryDto = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: EnquiryStatusEnum.optional(),
  assignedToUserId: z.string().min(1).optional(),
  source: z.string().trim().max(60).optional(),
  search: z.string().trim().max(100).optional(),
  /** "due" = follow-up date today or earlier and not closed. */
  followUp: z.enum(['due', 'upcoming']).optional(),
});

export const BoardQueryDto = z.object({
  search: z.string().trim().max(100).optional(),
  assignedToUserId: z.string().min(1).optional(),
  /** Cards per column (newest first). */
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const FunnelQueryDto = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const ConvertEnquiryDto = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  classId: z.preprocess(emptyToNull, z.string().min(1).optional().nullable()),
  dateOfBirth: z.preprocess(emptyToNull, z.coerce.date().optional().nullable()),
  gender: z.preprocess(
    (v) => (typeof v === 'string' && v ? v.toUpperCase() : v === '' ? null : v),
    z.enum(['MALE', 'FEMALE', 'OTHER']).optional().nullable(),
  ),
  guardianFirstName: z.string().trim().min(1, 'Guardian first name is required').max(100),
  guardianLastName: z.string().trim().min(1, 'Guardian last name is required').max(100),
  guardianPhone: phone,
  guardianEmail: z.preprocess(emptyToNull, z.string().trim().email().max(200).optional().nullable()),
});

export const IdParamDto = z.object({ id: z.string().min(1, 'Invalid ID') });

// ── Public (unauthenticated) ────────────────────────────────────────────────

export const PublicEnquiryDto = z.object({
  institutionSlug: z.string().trim().min(1, 'institutionSlug is required').max(100),
  studentName: z.string().trim().min(1, 'Student name is required').max(150),
  guardianName: optionalText(150),
  phone,
  email: z.preprocess(emptyToNull, z.string().trim().email('Invalid email').max(200).optional().nullable()),
  classInterested: optionalText(100),
  message: optionalText(1000),
  /** Honeypot — real users never fill this hidden field. */
  website: z.string().max(200).optional(),
});

export const ApplicationStatusQueryDto = z.object({
  institutionSlug: z.string().trim().min(1, 'institutionSlug is required').max(100),
  reference: z.string().trim().min(1, 'Application reference is required').max(60),
  phone: z.string().trim().min(6, 'Phone is required').max(20),
});

export type CreateEnquiryDtoType = z.infer<typeof CreateEnquiryDto>;
export type UpdateEnquiryDtoType = z.infer<typeof UpdateEnquiryDto>;
export type EnquiryQueryDtoType = z.infer<typeof EnquiryQueryDto>;
export type BoardQueryDtoType = z.infer<typeof BoardQueryDto>;
export type FunnelQueryDtoType = z.infer<typeof FunnelQueryDto>;
export type ConvertEnquiryDtoType = z.infer<typeof ConvertEnquiryDto>;
export type PublicEnquiryDtoType = z.infer<typeof PublicEnquiryDto>;
export type ApplicationStatusQueryDtoType = z.infer<typeof ApplicationStatusQueryDto>;
