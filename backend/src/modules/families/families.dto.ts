import { z } from 'zod';

// =============================================================================
// Family profile (T3) — request schemas. Ids are re-checked against
// req.tenantId in the service.
// =============================================================================

const id = z.string().trim().min(1).max(64);
const money = z.coerce
  .number()
  .positive('Amount must be greater than zero')
  .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, 'At most 2 decimals');

export const IdParamDto = z.object({ id });
export const StudentParamDto = z.object({ studentId: id });
export const GuardianParamDto = z.object({ guardianId: id });
export const NoteParamDto = z.object({ id, noteId: id });
export const MemberParamDto = z.object({ id, memberId: id });

export const ListQueryDto = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListQueryDtoType = z.infer<typeof ListQueryDto>;

export const SearchQueryDto = z.object({ q: z.string().trim().min(2).max(100) });

export const CreateFamilyDto = z.object({
  name: z.string().trim().min(1).max(120),
  studentIds: z.array(id).max(30).default([]),
  guardianIds: z.array(id).max(10).default([]),
  primaryGuardianId: id.optional().nullable(),
});
export type CreateFamilyDtoType = z.infer<typeof CreateFamilyDto>;

export const UpdateFamilyDto = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  primaryGuardianId: id.optional().nullable(),
});
export type UpdateFamilyDtoType = z.infer<typeof UpdateFamilyDto>;

export const AddMembersDto = z
  .object({ studentIds: z.array(id).max(30).default([]), guardianIds: z.array(id).max(10).default([]) })
  .refine((v) => v.studentIds.length + v.guardianIds.length > 0, 'Choose at least one student or guardian');
export type AddMembersDtoType = z.infer<typeof AddMembersDto>;

export const MergeDto = z.object({ otherFamilyId: id });

export const NoteDto = z.object({ body: z.string().trim().min(1).max(4000) });

export const SiblingConcessionDto = z.object({
  concessionId: id,
  studentIds: z.array(id).min(1).max(30),
  note: z.string().trim().max(300).optional(),
});
export type SiblingConcessionDtoType = z.infer<typeof SiblingConcessionDto>;

export const PayOnlineDto = z.object({
  method: z.enum(['BKASH', 'NAGAD', 'SSLCOMMERZ']),
  // Optional subset; default = every payable invoice of every child.
  invoiceIds: z.array(id).max(100).optional(),
});
export type PayOnlineDtoType = z.infer<typeof PayOnlineDto>;

export const DemoConfirmDto = z.object({ outcome: z.enum(['success', 'failure']) });

export const OfflinePaymentDto = z.object({
  amount: money,
  method: z.enum(['CASH', 'BANK_TRANSFER']),
  transactionRef: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  // Optional explicit split; default = oldest due first.
  allocations: z.array(z.object({ invoiceId: id, amount: money })).max(100).optional(),
});
export type OfflinePaymentDtoType = z.infer<typeof OfflinePaymentDto>;

export const GatewayCallbackParamDto = z.object({
  gateway: z.enum(['sslcommerz', 'bkash', 'nagad']),
  kind: z.enum(['ipn', 'success', 'fail', 'cancel', 'callback']),
});
