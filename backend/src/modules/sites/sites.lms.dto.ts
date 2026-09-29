import { z } from 'zod';
import { httpUrl } from '../../utils/url';
import { PAGE_SLUG_PATTERN } from './sites.logic';
import { id, optionalText, optionalUrl, pagination } from './sites.dto';

// =============================================================================
// Website Builder v2 — LMS DTOs (courses, lessons, enrollments, learning).
// =============================================================================

const email = z.string().trim().toLowerCase().email().max(200);
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .max(100)
  .regex(PAGE_SLUG_PATTERN, 'Use lowercase letters, digits and hyphens');

// ── Admin: courses ───────────────────────────────────────────────────────────

export const CourseQueryDto = z.object({
  ...pagination,
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  q: z.string().trim().max(100).optional(),
});

export const CreateCourseDto = z.object({
  slug: slug.optional(),
  title: z.string().trim().min(1).max(200),
  titleBn: optionalText(200),
  summary: optionalText(500),
  description: z.string().max(20_000).default(''),
  coverUrl: optionalUrl,
  price: z.coerce.number().nonnegative().max(10_000_000).default(0),
  compareAtPrice: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().nonnegative().max(10_000_000).nullable().optional()),
  level: optionalText(60),
  language: optionalText(60),
  category: optionalText(80),
  instructorName: optionalText(150),
  instructorBio: optionalText(1000),
  instructorPhoto: optionalUrl,
  durationText: optionalText(60),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
});

export const UpdateCourseDto = CreateCourseDto.partial().refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

// ── Admin: lessons ───────────────────────────────────────────────────────────

export const CreateLessonDto = z.object({
  module: optionalText(150),
  title: z.string().trim().min(1).max(200),
  kind: z.enum(['VIDEO', 'TEXT', 'FILE', 'EMBED']).default('VIDEO'),
  videoUrl: optionalUrl,
  body: z.string().max(50_000).optional(),
  fileUrl: optionalUrl,
  durationMin: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().nonnegative().max(1000).nullable().optional()),
  isFreePreview: z.boolean().default(false),
});

export const UpdateLessonDto = CreateLessonDto.partial().refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const LessonOrderDto = z.object({ ids: z.array(id).min(1).max(500) });

// ── Admin: enrollments ───────────────────────────────────────────────────────

export const EnrollmentQueryDto = z.object(pagination);

export const GrantEnrollmentDto = z.object({
  email,
  name: z.string().trim().max(150).optional(),
});

// ── Public ───────────────────────────────────────────────────────────────────

export const PublicCourseQueryDto = z.object({
  category: z.string().trim().max(80).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
  preview: z.string().max(2000).optional(),
});

export const PublicCourseParamDto = z.object({ siteId: id, slug: z.string().trim().toLowerCase().max(100) });
export const LearnParamDto = z.object({ siteId: id, courseSlug: z.string().trim().toLowerCase().max(100) });
export const LearnLessonParamDto = LearnParamDto.extend({ lessonId: id });

export type CourseQueryDtoType = z.infer<typeof CourseQueryDto>;
export type CreateCourseDtoType = z.infer<typeof CreateCourseDto>;
export type UpdateCourseDtoType = z.infer<typeof UpdateCourseDto>;
export type CreateLessonDtoType = z.infer<typeof CreateLessonDto>;
export type UpdateLessonDtoType = z.infer<typeof UpdateLessonDto>;
export type EnrollmentQueryDtoType = z.infer<typeof EnrollmentQueryDto>;
export type GrantEnrollmentDtoType = z.infer<typeof GrantEnrollmentDto>;
export type PublicCourseQueryDtoType = z.infer<typeof PublicCourseQueryDto>;
