import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { notifySafe } from '../notifications/notifications.service';
import { canViewTenantTicket, isTenantTicketManager, statusAfterReply, tenantUpdateError } from './support.logic';
import type {
  CreateTicketInput,
  ListTicketsQuery,
  PlatformListTicketsQuery,
  PlatformUpdateTicketInput,
  UpdateTicketInput,
} from './support.dto';

// =============================================================================
// Support tickets.
//   Tenant side  — pinned to req.tenantId. Everyone can open tickets and reply
//                  to their own; SUPER_ADMIN/ADMIN see all of the institution's.
//   Platform side — SUPER_ADMIN without tenant context (same pattern as
//                  billing's superAdminBillingRouter): sees every institution.
// =============================================================================

export interface Viewer {
  userId: string;
  role: string;
}

const personSelect = { id: true, firstName: true, lastName: true, role: true } satisfies Prisma.UserSelect;

const listSelect = {
  id: true,
  subject: true,
  status: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
  institutionId: true,
  createdBy: { select: personSelect },
  assignedTo: { select: personSelect },
  _count: { select: { messages: true } },
} satisfies Prisma.SupportTicketSelect;

const detailSelect = {
  ...listSelect,
  description: true,
  institution: { select: { id: true, name: true } },
  messages: {
    orderBy: { createdAt: 'asc' },
    select: { id: true, body: true, createdAt: true, author: { select: personSelect } },
  },
} satisfies Prisma.SupportTicketSelect;

function searchFilter(search?: string): Prisma.SupportTicketWhereInput {
  if (!search) return {};
  return {
    OR: [
      { subject: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ],
  };
}

async function writeAudit(institutionId: string, userId: string, action: string, ticketId: string, metadata: Prisma.InputJsonObject) {
  await prisma.auditLog
    .create({ data: { institutionId, userId, action, resource: 'support-tickets', resourceId: ticketId, metadata } })
    .catch((err: Error) => logger.error('Support: audit log write failed', { error: err.message }));
}

// ── Notifications ────────────────────────────────────────────────────────────
// "requester + assigned staff" (both events below), minus whoever just
// triggered the event — a reply/status-change never notifies its own actor.
// The one exception is TICKET_CREATED, which is a receipt to the requester
// themselves (there is no assignee yet at creation).

type TicketForNotify = { id: string; institutionId: string; createdBy: { id: string }; assignedTo: { id: string } | null; subject: string };

function ticketRecipients(ticket: TicketForNotify, excludeUserId?: string): string[] {
  const ids = [ticket.createdBy.id, ticket.assignedTo?.id].filter((id): id is string => Boolean(id));
  return [...new Set(ids)].filter((id) => id !== excludeUserId);
}

function notifyTicketEvent(
  ticket: TicketForNotify,
  type: 'SUPPORT_TICKET_CREATED' | 'SUPPORT_TICKET_REPLIED' | 'SUPPORT_TICKET_STATUS_CHANGED',
  recipientUserIds: string[],
  contextId: string,
  vars: Record<string, string>,
): void {
  if (recipientUserIds.length === 0) return;
  notifySafe({
    institutionId: ticket.institutionId,
    type,
    recipientUserIds,
    contextId,
    data: { link: '/support' },
    vars: { ticketSubject: ticket.subject, ...vars },
  });
}

// ── Tenant side ────────────────────────────────────────────────────────────

export async function listTenantTickets(institutionId: string, viewer: Viewer, q: ListTicketsQuery) {
  const onlyMine = q.mine || !isTenantTicketManager(viewer.role);
  const where: Prisma.SupportTicketWhereInput = {
    institutionId,
    ...(onlyMine ? { createdByUserId: viewer.userId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.priority ? { priority: q.priority } : {}),
    ...searchFilter(q.search),
  };
  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      select: listSelect,
      orderBy: { updatedAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.supportTicket.count({ where }),
  ]);
  return { items, meta: { total, page: q.page, pageSize: q.pageSize } };
}

export async function createTicket(institutionId: string, viewer: Viewer, input: CreateTicketInput) {
  const ticket = await prisma.supportTicket.create({
    data: {
      institutionId,
      subject: input.subject,
      description: input.description,
      priority: input.priority,
      createdByUserId: viewer.userId,
    },
    select: detailSelect,
  });
  notifyTicketEvent(ticket, 'SUPPORT_TICKET_CREATED', [ticket.createdBy.id], ticket.id, { status: ticket.status });
  return ticket;
}

async function getTenantTicketOrThrow(institutionId: string, viewer: Viewer, id: string) {
  const ticket = await prisma.supportTicket.findFirst({ where: { id, institutionId }, select: detailSelect });
  if (!ticket || !canViewTenantTicket(viewer, { createdByUserId: ticket.createdBy.id })) {
    // 404 rather than 403 so ticket ids of colleagues are not confirmable.
    throw new NotFoundError('Ticket not found');
  }
  return ticket;
}

export async function getTenantTicket(institutionId: string, viewer: Viewer, id: string) {
  return getTenantTicketOrThrow(institutionId, viewer, id);
}

export async function replyTenantTicket(institutionId: string, viewer: Viewer, id: string, body: string) {
  const ticket = await getTenantTicketOrThrow(institutionId, viewer, id);
  const nextStatus = statusAfterReply(ticket.status, 'requester');
  const [message] = await prisma.$transaction([
    prisma.supportTicketMessage.create({ data: { ticketId: ticket.id, authorUserId: viewer.userId, body } }),
    prisma.supportTicket.updateMany({ where: { id: ticket.id, institutionId }, data: { status: nextStatus, updatedAt: new Date() } }),
  ]);
  notifyTicketEvent(ticket, 'SUPPORT_TICKET_REPLIED', ticketRecipients(ticket, viewer.userId), message.id, { status: nextStatus });
  return getTenantTicketOrThrow(institutionId, viewer, id);
}

export async function updateTenantTicket(institutionId: string, viewer: Viewer, id: string, input: UpdateTicketInput) {
  const ticket = await getTenantTicketOrThrow(institutionId, viewer, id);
  const error = tenantUpdateError(viewer, { createdByUserId: ticket.createdBy.id, status: ticket.status }, input);
  if (error) throw new ForbiddenError(error);
  await prisma.supportTicket.updateMany({
    where: { id: ticket.id, institutionId },
    data: {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
    },
  });
  if (input.status !== undefined && input.status !== ticket.status) {
    notifyTicketEvent(ticket, 'SUPPORT_TICKET_STATUS_CHANGED', ticketRecipients(ticket, viewer.userId), `${ticket.id}:${input.status}:${Date.now()}`, {
      status: input.status,
    });
  }
  return getTenantTicketOrThrow(institutionId, viewer, id);
}

// ── Platform side (SUPER_ADMIN, cross-tenant) ──────────────────────────────

export async function listPlatformTickets(viewer: Viewer, q: PlatformListTicketsQuery) {
  const where: Prisma.SupportTicketWhereInput = {
    ...(q.institutionId ? { institutionId: q.institutionId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.priority ? { priority: q.priority } : {}),
    ...(q.assignedToMe ? { assignedToUserId: viewer.userId } : {}),
    ...searchFilter(q.search),
  };
  const [items, total, byStatus] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      select: { ...listSelect, institution: { select: { id: true, name: true } } },
      orderBy: { updatedAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const counts = { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0 } as Record<string, number>;
  for (const row of byStatus) counts[row.status] = row._count._all;
  return { items, meta: { total, page: q.page, pageSize: q.pageSize }, counts };
}

async function getPlatformTicketOrThrow(id: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id }, select: detailSelect });
  if (!ticket) throw new NotFoundError('Ticket not found');
  return ticket;
}

export async function getPlatformTicket(id: string) {
  return getPlatformTicketOrThrow(id);
}

export async function replyPlatformTicket(viewer: Viewer, id: string, body: string) {
  const ticket = await getPlatformTicketOrThrow(id);
  const nextStatus = statusAfterReply(ticket.status, 'support');
  const [message] = await prisma.$transaction([
    prisma.supportTicketMessage.create({ data: { ticketId: ticket.id, authorUserId: viewer.userId, body } }),
    prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: nextStatus } }),
  ]);
  await writeAudit(ticket.institutionId, viewer.userId, 'SUPPORT_REPLY', ticket.id, { platform: true, status: nextStatus });
  notifyTicketEvent(ticket, 'SUPPORT_TICKET_REPLIED', ticketRecipients(ticket, viewer.userId), message.id, { status: nextStatus });
  return getPlatformTicketOrThrow(id);
}

export async function listPlatformAgents() {
  return prisma.user.findMany({
    where: { role: UserRole.SUPER_ADMIN, isActive: true },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: { firstName: 'asc' },
    take: 100,
  });
}

export async function updatePlatformTicket(viewer: Viewer, id: string, input: PlatformUpdateTicketInput) {
  const ticket = await getPlatformTicketOrThrow(id);
  if (input.assignedToUserId) {
    const agent = await prisma.user.findFirst({
      where: { id: input.assignedToUserId, role: UserRole.SUPER_ADMIN, isActive: true },
      select: { id: true },
    });
    if (!agent) throw new BadRequestError('Tickets can only be assigned to an active platform super admin');
  }
  await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.assignedToUserId !== undefined ? { assignedToUserId: input.assignedToUserId } : {}),
    },
  });
  await writeAudit(ticket.institutionId, viewer.userId, 'SUPPORT_UPDATE', ticket.id, { platform: true, ...input } as Prisma.InputJsonObject);
  if (input.status !== undefined && input.status !== ticket.status) {
    notifyTicketEvent(ticket, 'SUPPORT_TICKET_STATUS_CHANGED', ticketRecipients(ticket, viewer.userId), `${ticket.id}:${input.status}:${Date.now()}`, {
      status: input.status,
    });
  }
  return getPlatformTicketOrThrow(id);
}
