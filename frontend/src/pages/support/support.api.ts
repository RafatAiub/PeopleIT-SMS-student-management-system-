// React Query hooks for support tickets.
// Contract: backend/src/modules/support (mounted /api/v1/support).
//   tenant:   /support/tickets…
//   platform: /support/platform/tickets… (SUPER_ADMIN, cross-tenant)
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export const TICKET_STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
export const TICKET_PRIORITIES: TicketPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

export interface TicketPerson {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface TicketSummary {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
  institutionId: string;
  createdBy: TicketPerson;
  assignedTo: TicketPerson | null;
  institution?: { id: string; name: string };
  _count: { messages: number };
}

export interface TicketMessage {
  id: string;
  body: string;
  createdAt: string;
  author: TicketPerson;
}

export interface TicketDetail extends TicketSummary {
  description: string;
  institution: { id: string; name: string };
  messages: TicketMessage[];
}

export interface Paged<T> {
  items: T[];
  meta: { total: number; page: number; pageSize: number };
}

export interface TicketFilters {
  page: number;
  pageSize: number;
  status?: string;
  priority?: string;
  search?: string;
}

const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));

// ── Tenant ─────────────────────────────────────────────────────────────────

export function useTickets(filters: TicketFilters & { mine?: boolean }) {
  return useQuery({
    queryKey: ['support', 'tickets', filters],
    queryFn: async (): Promise<Paged<TicketSummary>> =>
      (await apiClient.get('/support/tickets', { params: clean({ ...filters, mine: filters.mine ? 'true' : undefined }) })).data.data,
    placeholderData: keepPreviousData,
  });
}

export function useTicket(id: string | null) {
  return useQuery({
    queryKey: ['support', 'ticket', id],
    queryFn: async (): Promise<TicketDetail> => (await apiClient.get(`/support/tickets/${id}`)).data.data,
    enabled: !!id,
  });
}

export function useTicketMutations() {
  const qc = useQueryClient();
  const done = (ticket: TicketDetail) => {
    qc.setQueryData(['support', 'ticket', ticket.id], ticket);
    qc.invalidateQueries({ queryKey: ['support', 'tickets'] });
  };
  return {
    create: useMutation({
      mutationFn: async (body: { subject: string; description: string; priority: TicketPriority }): Promise<TicketDetail> =>
        (await apiClient.post('/support/tickets', body)).data.data,
      onSuccess: done,
    }),
    reply: useMutation({
      mutationFn: async ({ id, body }: { id: string; body: string }): Promise<TicketDetail> => (await apiClient.post(`/support/tickets/${id}/messages`, { body })).data.data,
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: async ({ id, ...body }: { id: string; status?: TicketStatus; priority?: TicketPriority }): Promise<TicketDetail> =>
        (await apiClient.patch(`/support/tickets/${id}`, body)).data.data,
      onSuccess: done,
    }),
  };
}

// ── Platform (SUPER_ADMIN) ─────────────────────────────────────────────────

export function usePlatformTickets(filters: TicketFilters & { institutionId?: string; assignedToMe?: boolean }) {
  return useQuery({
    queryKey: ['support', 'platform', 'tickets', filters],
    queryFn: async (): Promise<Paged<TicketSummary> & { counts: Record<TicketStatus, number> }> =>
      (await apiClient.get('/support/platform/tickets', { params: clean({ ...filters, assignedToMe: filters.assignedToMe ? 'true' : undefined }) })).data.data,
    placeholderData: keepPreviousData,
  });
}

export function usePlatformTicket(id: string | null) {
  return useQuery({
    queryKey: ['support', 'platform', 'ticket', id],
    queryFn: async (): Promise<TicketDetail> => (await apiClient.get(`/support/platform/tickets/${id}`)).data.data,
    enabled: !!id,
  });
}

export function usePlatformAgents() {
  return useQuery({
    queryKey: ['support', 'platform', 'agents'],
    queryFn: async (): Promise<Array<{ id: string; firstName: string; lastName: string; email: string }>> => (await apiClient.get('/support/platform/agents')).data.data,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePlatformTicketMutations() {
  const qc = useQueryClient();
  const done = (ticket: TicketDetail) => {
    qc.setQueryData(['support', 'platform', 'ticket', ticket.id], ticket);
    qc.invalidateQueries({ queryKey: ['support', 'platform', 'tickets'] });
  };
  return {
    reply: useMutation({
      mutationFn: async ({ id, body }: { id: string; body: string }): Promise<TicketDetail> =>
        (await apiClient.post(`/support/platform/tickets/${id}/messages`, { body })).data.data,
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: async ({ id, ...body }: { id: string; status?: TicketStatus; priority?: TicketPriority; assignedToUserId?: string | null }): Promise<TicketDetail> =>
        (await apiClient.patch(`/support/platform/tickets/${id}`, body)).data.data,
      onSuccess: done,
    }),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

export const STATUS_VARIANT: Record<TicketStatus, 'info' | 'warning' | 'success' | 'neutral'> = {
  OPEN: 'info',
  IN_PROGRESS: 'warning',
  RESOLVED: 'success',
  CLOSED: 'neutral',
};

export const PRIORITY_VARIANT: Record<TicketPriority, 'neutral' | 'info' | 'warning' | 'danger'> = {
  LOW: 'neutral',
  NORMAL: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
};

export const STATUS_LABEL: Record<TicketStatus, string> = { OPEN: 'Open', IN_PROGRESS: 'In progress', RESOLVED: 'Resolved', CLOSED: 'Closed' };
export const PRIORITY_LABEL: Record<TicketPriority, string> = { LOW: 'Low', NORMAL: 'Normal', HIGH: 'High', URGENT: 'Urgent' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const errMsg = (e: any, fallback: string): string => e?.response?.data?.message || fallback;
export const personName = (u?: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');
