import apiClient from './client';

export type LeaveRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface LeaveType {
  id: string;
  institutionId: string;
  name: string;
  description?: string | null;
  isPaid: boolean;
  color?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveRequest {
  id: string;
  institutionId: string;
  applicantUserId: string;
  applicant: { firstName: string; lastName: string; email: string; role: string };
  // null for a Student Leave request — Student Leave has no leave-type concept.
  leaveTypeId: string | null;
  leaveType: { name: string; isPaid: boolean } | null;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: LeaveRequestStatus;
  reviewedByUserId: string | null;
  reviewedBy: { firstName: string; lastName: string } | null;
  reviewedAt: string | null;
  reviewerComment: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLeaveTypeDto {
  name: string;
  description?: string;
  isPaid: boolean;
  color?: string;
}

export interface UpdateLeaveTypeDto {
  name?: string;
  description?: string;
  isPaid?: boolean;
  color?: string;
  isActive?: boolean;
}

export interface CreateLeaveRequestDto {
  // Required for staff, omitted entirely for a Student Leave submission.
  leaveTypeId?: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export type LeaveAudience = 'STAFF' | 'STUDENT';

export interface LeaveRequestFilters {
  status?: LeaveRequestStatus;
  leaveTypeId?: string;
  applicantUserId?: string;
  audience?: LeaveAudience;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface LeaveReportMonth {
  month: number;
  monthLabel: string;
  allocatedDays: number;
  usedByType: { leaveTypeId: string; leaveTypeName: string; days: number }[];
  usedTotal: number;
  remainingDays: number;
}

export interface LeaveReport {
  year: number;
  months: LeaveReportMonth[];
}

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedLeaveRequests {
  data: LeaveRequest[];
  meta: PaginationMeta;
}

export const leaveApi = {
  listLeaveTypes: async (includeInactive = false): Promise<LeaveType[]> => {
    const { data } = await apiClient.get('/leave/types', { params: { includeInactive } });
    return data.data;
  },

  createLeaveType: async (dto: CreateLeaveTypeDto): Promise<LeaveType> => {
    const { data } = await apiClient.post('/leave/types', dto);
    return data.data;
  },

  updateLeaveType: async (id: string, dto: UpdateLeaveTypeDto): Promise<LeaveType> => {
    const { data } = await apiClient.patch(`/leave/types/${id}`, dto);
    return data.data;
  },

  deleteLeaveType: async (id: string): Promise<void> => {
    await apiClient.delete(`/leave/types/${id}`);
  },

  listAllLeaveRequests: async (filters: LeaveRequestFilters = {}): Promise<PaginatedLeaveRequests> => {
    const { data } = await apiClient.get('/leave/requests', { params: filters });
    return { data: data.data, meta: data.meta };
  },

  listMyLeaveRequests: async (filters: Omit<LeaveRequestFilters, 'applicantUserId'> = {}): Promise<PaginatedLeaveRequests> => {
    const { data } = await apiClient.get('/leave/requests/mine', { params: filters });
    return { data: data.data, meta: data.meta };
  },

  getLeaveRequest: async (id: string): Promise<LeaveRequest> => {
    const { data } = await apiClient.get(`/leave/requests/${id}`);
    return data.data;
  },

  createLeaveRequest: async (dto: CreateLeaveRequestDto): Promise<LeaveRequest> => {
    const { data } = await apiClient.post('/leave/requests', dto);
    return data.data;
  },

  deleteLeaveRequest: async (id: string): Promise<void> => {
    await apiClient.delete(`/leave/requests/${id}`);
  },

  cancelLeaveRequest: async (id: string): Promise<LeaveRequest> => {
    const { data } = await apiClient.post(`/leave/requests/${id}/cancel`);
    return data.data;
  },

  approveLeaveRequest: async (id: string, reviewerComment?: string): Promise<LeaveRequest> => {
    const { data } = await apiClient.post(`/leave/requests/${id}/approve`, { reviewerComment });
    return data.data;
  },

  rejectLeaveRequest: async (id: string, reviewerComment: string): Promise<LeaveRequest> => {
    const { data } = await apiClient.post(`/leave/requests/${id}/reject`, { reviewerComment });
    return data.data;
  },

  getLeaveReport: async (applicantUserId: string, year?: number): Promise<LeaveReport> => {
    const { data } = await apiClient.get('/leave/report', { params: { applicantUserId, year } });
    return data.data;
  },
};
