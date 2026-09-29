import { z } from 'zod';
import { httpUrl } from '../../utils/url';
import { id, optionalText, optionalUrl, pagination } from './sites.dto';

// =============================================================================
// Sites portal DTOs (zod) — Track B: institution profile, committee, albums,
// downloads, admission circulars, staff visibility, and the public data
// query/param shapes. See docs/redesign/WEBSITE_V3_PLAN.md §7 for the
// contract these enforce.
// =============================================================================

const optionalDate = z.preprocess((v) => (v === '' ? null : v), z.coerce.date().nullable().optional());

// ── Admin: profile (B1) ─────────────────────────────────────────────────────

export const HeadOfInstitutionDto = z
  .object({
    // Either an existing staff user...
    userId: id.optional(),
    // ...or a free-typed name (used when there's no matching User account).
    name: optionalText(150),
    photoUrl: optionalUrl,
    designation: optionalText(150),
  })
  .refine((v) => Boolean(v.userId || v.name), { message: 'Pick a staff member or enter a name' });

export const OfficerDto = z.object({
  name: optionalText(150),
  designation: optionalText(150),
  phone: optionalText(25),
  email: z.preprocess((v) => (v === '' ? null : v), z.string().trim().toLowerCase().email().max(200).nullable().optional()),
});

export const UpdateProfileDto = z
  .object({
    nameBn: optionalText(150),
    eiin: optionalText(20),
    establishedYear: z.coerce.number().int().min(1800).max(2100).nullable().optional(),
    mpoInfo: optionalText(2000),
    recognitionInfo: optionalText(2000),
    headOfInstitution: HeadOfInstitutionDto.nullable().optional(),
    informationOfficer: OfficerDto.nullable().optional(),
    complaintsOfficer: OfficerDto.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

// ── Admin: staff visibility (B2, owner decision 3) ──────────────────────────

export const StaffVisibilityQueryDto = z.object({
  ...pagination,
  role: z.enum(['TEACHER', 'STAFF']).optional(),
  q: z.string().trim().max(100).optional(),
});

export const ToggleStaffVisibilityDto = z.object({
  userIds: z.array(id).min(1).max(200),
  showOnWebsite: z.boolean(),
});

// ── Admin: committee (B2) ────────────────────────────────────────────────────

export const CreateCommitteeMemberDto = z.object({
  name: z.string().trim().min(1).max(150),
  nameBn: optionalText(150),
  role: z.string().trim().min(1).max(100),
  roleBn: optionalText(100),
  photoUrl: optionalUrl,
  phone: optionalText(25),
  showPhone: z.boolean().default(false),
  sortOrder: z.coerce.number().int().optional(),
});

export const UpdateCommitteeMemberDto = CreateCommitteeMemberDto.partial().refine((v) => Object.keys(v).length > 0, {
  message: 'Nothing to update',
});

export const CommitteeQueryDto = z.object(pagination);

// ── Admin: albums (B2) ───────────────────────────────────────────────────────

export const CreateAlbumDto = z.object({
  title: z.string().trim().min(1).max(150),
  titleBn: optionalText(150),
  coverUrl: optionalUrl,
  description: optionalText(2000),
  eventDate: optionalDate,
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  sortOrder: z.coerce.number().int().optional(),
});

export const UpdateAlbumDto = CreateAlbumDto.partial().refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export const AlbumQueryDto = z.object({ ...pagination, status: z.enum(['DRAFT', 'PUBLISHED']).optional() });

export const CreateAlbumPhotoDto = z.object({
  url: httpUrl(),
  caption: optionalText(300),
});
export const UpdateAlbumPhotoDto = z
  .object({ caption: optionalText(300), sortOrder: z.coerce.number().int().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export const AlbumPhotoOrderDto = z.object({ ids: z.array(id).min(1).max(500) });
export const AlbumPhotoParamDto = z.object({ id, photoId: id });

// ── Admin: downloads (B2) ────────────────────────────────────────────────────

export const CreateDownloadDto = z.object({
  title: z.string().trim().min(1).max(200),
  titleBn: optionalText(200),
  category: z.string().trim().min(1).max(60),
  fileUrl: httpUrl(),
  publishedAt: optionalDate,
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  sortOrder: z.coerce.number().int().optional(),
});
export const UpdateDownloadDto = CreateDownloadDto.partial().refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export const DownloadQueryDto = z.object({
  ...pagination,
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  category: z.string().trim().max(60).optional(),
});

// ── Admin: admission circulars (B2) ─────────────────────────────────────────

export const CreateAdmissionDto = z.object({
  session: z.string().trim().min(1).max(20),
  classNames: z.array(z.string().trim().min(1).max(60)).min(1).max(50),
  title: z.string().trim().min(1).max(200),
  titleBn: optionalText(200),
  body: z.string().trim().min(1).max(20_000),
  startDate: optionalDate,
  endDate: optionalDate,
  fee: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().nonnegative().max(10_000_000).nullable().optional()),
  pdfUrl: optionalUrl,
  applyUrl: optionalUrl,
  formId: optionalText(64),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  sortOrder: z.coerce.number().int().optional(),
});
export const UpdateAdmissionDto = CreateAdmissionDto.partial().refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export const AdmissionQueryDto = z.object({ ...pagination, status: z.enum(['DRAFT', 'PUBLISHED']).optional() });

// ── Public: data query / param DTOs (B3/B4) ─────────────────────────────────

export const PublicPreview = { preview: z.string().max(2000).optional() };

export const DataStaffQueryDto = z.object({ category: z.enum(['head', 'teachers', 'staff']).default('teachers'), ...PublicPreview });
export const DataProfileQueryDto = z.object({ ...PublicPreview });
export const DataClassStatsQueryDto = z.object({ ...PublicPreview });
export const DataSubjectsQueryDto = z.object({ class: z.string().trim().max(60).optional(), ...PublicPreview });
export const DataExamRoutineQueryDto = z.object({
  examId: id.optional(),
  class: z.string().trim().max(60).optional(),
  ...PublicPreview,
});
export const DataResultSummaryQueryDto = z.object({ examId: id.optional(), ...PublicPreview });
export const DataResultsArchiveQueryDto = z.object({ ...PublicPreview });
export const DataFeeChartQueryDto = z.object({ ...PublicPreview });
export const DataHolidaysQueryDto = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  ...PublicPreview,
});
export const DataLibraryQueryDto = z.object({
  ...pagination,
  pageSize: z.coerce.number().int().positive().max(50).default(20),
  q: z.string().trim().max(100).optional(),
  ...PublicPreview,
});
export const DataTransportQueryDto = z.object({ ...PublicPreview });
export const DataBranchesQueryDto = z.object({ ...PublicPreview });
export const DataCommitteeQueryDto = z.object({ ...PublicPreview });
export const DataAlbumsQueryDto = z.object({ ...pagination, ...PublicPreview });
export const DataAlbumParamDto = z.object({ siteId: id, id });
export const DataDownloadsQueryDto = z.object({ category: z.string().trim().max(60).optional(), ...PublicPreview });
export const DataAdmissionsQueryDto = z.object({ ...pagination, ...PublicPreview });
export const DataAdmissionParamDto = z.object({ siteId: id, id });
export const DataNoticeParamDto = z.object({ siteId: id, id });

export type UpdateProfileDtoType = z.infer<typeof UpdateProfileDto>;
export type ToggleStaffVisibilityDtoType = z.infer<typeof ToggleStaffVisibilityDto>;
export type StaffVisibilityQueryDtoType = z.infer<typeof StaffVisibilityQueryDto>;
export type CreateCommitteeMemberDtoType = z.infer<typeof CreateCommitteeMemberDto>;
export type UpdateCommitteeMemberDtoType = z.infer<typeof UpdateCommitteeMemberDto>;
export type CreateAlbumDtoType = z.infer<typeof CreateAlbumDto>;
export type UpdateAlbumDtoType = z.infer<typeof UpdateAlbumDto>;
export type AlbumQueryDtoType = z.infer<typeof AlbumQueryDto>;
export type CreateAlbumPhotoDtoType = z.infer<typeof CreateAlbumPhotoDto>;
export type UpdateAlbumPhotoDtoType = z.infer<typeof UpdateAlbumPhotoDto>;
export type CreateDownloadDtoType = z.infer<typeof CreateDownloadDto>;
export type UpdateDownloadDtoType = z.infer<typeof UpdateDownloadDto>;
export type DownloadQueryDtoType = z.infer<typeof DownloadQueryDto>;
export type CreateAdmissionDtoType = z.infer<typeof CreateAdmissionDto>;
export type UpdateAdmissionDtoType = z.infer<typeof UpdateAdmissionDto>;
export type AdmissionQueryDtoType = z.infer<typeof AdmissionQueryDto>;
