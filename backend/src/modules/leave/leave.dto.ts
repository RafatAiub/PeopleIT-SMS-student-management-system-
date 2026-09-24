import { z } from 'zod';

export const LeaveStatusEnum = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']);

// --- Leave Types ---

export const CreateLeaveTypeDto = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  isPaid: z.boolean().default(true),
  color: z.string().max(20).optional(),
});

export const UpdateLeaveTypeDto = CreateLeaveTypeDto.partial().extend({
  isActive: z.boolean().optional(),
});

export const LeaveTypeQueryDto = z.object({
  includeInactive: z.coerce.boolean().default(false),
});

// --- Leave Requests ---

// leaveTypeId is optional at the schema level and enforced by role in the
// service: required for STAFF applicants, ignored entirely for STUDENT
// applicants (Student Leave has no leave-type concept — see leave.service.ts
// createLeaveRequest).
export const CreateLeaveRequestDto = z
  .object({
    leaveTypeId: z.string().min(1).optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    reason: z.string().min(10, 'Reason must be at least 10 characters').max(1000),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  });

// 'STAFF' = every applicant whose role isn't STUDENT (admin/teacher/etc.);
// 'STUDENT' = only STUDENT applicants. Omitted = no audience filter (every
// applicant), used internally by listMyLeaveRequests where ownership already
// pins the result to a single caller regardless of role.
export const LeaveAudienceEnum = z.enum(['STAFF', 'STUDENT']);

export const LeaveRequestQueryDto = z.object({
  status: LeaveStatusEnum.optional(),
  leaveTypeId: z.string().optional(),
  applicantUserId: z.string().optional(),
  audience: LeaveAudienceEnum.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const MyLeaveRequestQueryDto = LeaveRequestQueryDto.omit({ applicantUserId: true, audience: true });

export const LeaveReportQueryDto = z.object({
  applicantUserId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const LeaveIdParamDto = z.object({
  id: z.string().min(1),
});

export const ApproveLeaveRequestDto = z.object({
  reviewerComment: z.string().max(1000).optional(),
});

export const RejectLeaveRequestDto = z.object({
  reviewerComment: z.string().min(3, 'A rejection reason is required').max(1000),
});

export type CreateLeaveTypeDtoType = z.infer<typeof CreateLeaveTypeDto>;
export type UpdateLeaveTypeDtoType = z.infer<typeof UpdateLeaveTypeDto>;
export type LeaveTypeQueryDtoType = z.infer<typeof LeaveTypeQueryDto>;
export type CreateLeaveRequestDtoType = z.infer<typeof CreateLeaveRequestDto>;
export type LeaveRequestQueryDtoType = z.infer<typeof LeaveRequestQueryDto>;
export type MyLeaveRequestQueryDtoType = z.infer<typeof MyLeaveRequestQueryDto>;
export type LeaveIdParamDtoType = z.infer<typeof LeaveIdParamDto>;
export type ApproveLeaveRequestDtoType = z.infer<typeof ApproveLeaveRequestDto>;
export type RejectLeaveRequestDtoType = z.infer<typeof RejectLeaveRequestDto>;
export type LeaveReportQueryDtoType = z.infer<typeof LeaveReportQueryDto>;
