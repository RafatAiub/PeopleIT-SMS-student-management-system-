import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  leaveApi,
  type LeaveRequestFilters,
  type CreateLeaveRequestDto,
  type CreateLeaveTypeDto,
  type UpdateLeaveTypeDto,
} from '@/api/leave.api';
import toast from 'react-hot-toast';

export const LEAVE_TYPES_KEY = 'leave-types';
export const LEAVE_REQUESTS_KEY = 'leave-requests';
export const MY_LEAVE_REQUESTS_KEY = 'my-leave-requests';
export const LEAVE_REPORT_KEY = 'leave-report';

export function useLeaveTypes(includeInactive = false, enabled = true) {
  return useQuery({
    queryKey: [LEAVE_TYPES_KEY, includeInactive],
    queryFn: () => leaveApi.listLeaveTypes(includeInactive),
    enabled,
  });
}

export function useCreateLeaveType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateLeaveTypeDto) => leaveApi.createLeaveType(dto),
    onSuccess: (leaveType) => {
      qc.invalidateQueries({ queryKey: [LEAVE_TYPES_KEY] });
      toast.success(`Leave type "${leaveType.name}" created.`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create leave type.');
    },
  });
}

export function useUpdateLeaveType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateLeaveTypeDto }) => leaveApi.updateLeaveType(id, data),
    onSuccess: (leaveType) => {
      qc.invalidateQueries({ queryKey: [LEAVE_TYPES_KEY] });
      toast.success(`Leave type "${leaveType.name}" updated.`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update leave type.');
    },
  });
}

export function useDeleteLeaveType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leaveApi.deleteLeaveType(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [LEAVE_TYPES_KEY] });
      toast.success('Leave type deleted.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete leave type.');
    },
  });
}

export function useAllLeaveRequests(filters: LeaveRequestFilters = {}) {
  return useQuery({
    queryKey: [LEAVE_REQUESTS_KEY, filters],
    queryFn: () => leaveApi.listAllLeaveRequests(filters),
  });
}

export function useMyLeaveRequests(filters: Omit<LeaveRequestFilters, 'applicantUserId'> = {}) {
  return useQuery({
    queryKey: [MY_LEAVE_REQUESTS_KEY, filters],
    queryFn: () => leaveApi.listMyLeaveRequests(filters),
  });
}

export function useCreateLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateLeaveRequestDto) => leaveApi.createLeaveRequest(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [MY_LEAVE_REQUESTS_KEY] });
      qc.invalidateQueries({ queryKey: [LEAVE_REQUESTS_KEY] });
      toast.success('Leave request submitted.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to submit leave request.');
    },
  });
}

export function useCancelLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leaveApi.cancelLeaveRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [MY_LEAVE_REQUESTS_KEY] });
      qc.invalidateQueries({ queryKey: [LEAVE_REQUESTS_KEY] });
      toast.success('Leave request cancelled.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to cancel leave request.');
    },
  });
}

export function useDeleteLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leaveApi.deleteLeaveRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [LEAVE_REQUESTS_KEY] });
      qc.invalidateQueries({ queryKey: [MY_LEAVE_REQUESTS_KEY] });
      toast.success('Leave request deleted.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete leave request.');
    },
  });
}

export function useApproveLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) => leaveApi.approveLeaveRequest(id, comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [LEAVE_REQUESTS_KEY] });
      toast.success('Leave request approved.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to approve leave request.');
    },
  });
}

export function useLeaveReport(applicantUserId: string | undefined, year: number) {
  return useQuery({
    queryKey: [LEAVE_REPORT_KEY, applicantUserId, year],
    queryFn: () => leaveApi.getLeaveReport(applicantUserId as string, year),
    enabled: !!applicantUserId,
  });
}

export function useRejectLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) => leaveApi.rejectLeaveRequest(id, comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [LEAVE_REQUESTS_KEY] });
      toast.success('Leave request rejected.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to reject leave request.');
    },
  });
}
