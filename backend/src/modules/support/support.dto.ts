import { z } from 'zod';

export const TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

const pageParams = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const CreateTicketDto = z.object({
  subject: z.string().trim().min(4, 'Subject must be at least 4 characters').max(160),
  description: z.string().trim().min(10, 'Please describe the problem (at least 10 characters)').max(10_000),
  priority: z.enum(TICKET_PRIORITIES).default('NORMAL'),
});

export const TicketMessageDto = z.object({
  body: z.string().trim().min(1, 'Message cannot be empty').max(10_000),
});

export const UpdateTicketDto = z
  .object({
    status: z.enum(TICKET_STATUSES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
  })
  .refine((v) => v.status !== undefined || v.priority !== undefined, { message: 'Nothing to update' });

export const PlatformUpdateTicketDto = z
  .object({
    status: z.enum(TICKET_STATUSES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    assignedToUserId: z.string().min(1).max(64).nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.priority !== undefined || v.assignedToUserId !== undefined, {
    message: 'Nothing to update',
  });

export const ListTicketsQueryDto = z.object({
  ...pageParams,
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  search: z.string().trim().max(100).optional(),
  mine: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const PlatformListTicketsQueryDto = z.object({
  ...pageParams,
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  search: z.string().trim().max(100).optional(),
  institutionId: z.string().min(1).max(64).optional(),
  assignedToMe: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const TicketIdParamDto = z.object({ id: z.string().min(1).max(64) });

export type CreateTicketInput = z.infer<typeof CreateTicketDto>;
export type UpdateTicketInput = z.infer<typeof UpdateTicketDto>;
export type PlatformUpdateTicketInput = z.infer<typeof PlatformUpdateTicketDto>;
export type ListTicketsQuery = z.infer<typeof ListTicketsQueryDto>;
export type PlatformListTicketsQuery = z.infer<typeof PlatformListTicketsQueryDto>;
