import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient from '@/api/client';
import type {
  AddUserFormValues,
  ClassOption,
  EditUserFormValues,
  PendingRegistration,
  PendingRole,
  SectionOption,
  StudentOption,
  UserRow,
} from './users.types';

export const USERS_KEY = 'users';
export const CLASSES_META_KEY = 'users-classes-meta';
export const SECTIONS_META_KEY = 'users-sections-meta';
export const PENDING_REGISTRATIONS_KEY = 'pending-registrations';
export const STUDENT_SEARCH_KEY = 'users-student-search';

function errorMessage(error: any, fallback: string) {
  return error.response?.data?.message || fallback;
}

export interface UsersListParams {
  page: number;
  pageSize: number;
  search?: string;
  role?: string;
}

export interface UsersListResult {
  users: UserRow[];
  total: number;
}

export function useUsersList(params: UsersListParams) {
  return useQuery({
    queryKey: [USERS_KEY, params],
    queryFn: async (): Promise<UsersListResult> => {
      const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) });
      if (params.search) query.append('search', params.search);
      if (params.role) query.append('role', params.role);
      const res = await apiClient.get(`/users?${query.toString()}`);
      return { users: res.data.data || [], total: res.data.meta?.total ?? 0 };
    },
  });
}

export interface CreateUserPayload extends AddUserFormValues {
  studentIds?: string[];
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateUserPayload) => apiClient.post('/users', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [USERS_KEY] });
      toast.success('User created successfully');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to create user')),
  });
}

export interface UpdateUserPayload extends EditUserFormValues {
  studentIds?: string[];
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserPayload }) => apiClient.put(`/users/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [USERS_KEY] });
      toast.success('User updated successfully');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to update user')),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [USERS_KEY] });
      toast.success('User deleted successfully');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to delete user')),
  });
}

export function useClassesMeta() {
  return useQuery({
    queryKey: [CLASSES_META_KEY],
    queryFn: async (): Promise<ClassOption[]> => {
      const res = await apiClient.get('/students/meta/classes');
      return res.data.data || [];
    },
  });
}

export function useSectionsMeta(classId: string) {
  return useQuery({
    queryKey: [SECTIONS_META_KEY, classId],
    queryFn: async (): Promise<SectionOption[]> => {
      const res = await apiClient.get(`/students/meta/sections?classId=${classId}`);
      return res.data.data || [];
    },
    enabled: !!classId,
  });
}

export function useStudentSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: [STUDENT_SEARCH_KEY, trimmed],
    queryFn: async (): Promise<StudentOption[]> => {
      const res = await apiClient.get('/students', { params: { search: trimmed, pageSize: 8 } });
      return res.data.data || [];
    },
    enabled: trimmed.length > 0,
  });
}

// ── Pending self-registrations ──────────────────────────────────────────────

export function usePendingRegistrations() {
  return useQuery({
    queryKey: [PENDING_REGISTRATIONS_KEY],
    queryFn: async (): Promise<PendingRegistration[]> => {
      const res = await apiClient.get('/users/pending-registrations');
      return res.data.data || [];
    },
  });
}

export function useApproveRegistration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role?: PendingRole }) =>
      apiClient.post(`/users/pending-registrations/${id}/approve`, role ? { role } : {}),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: [PENDING_REGISTRATIONS_KEY] });
      qc.invalidateQueries({ queryKey: [USERS_KEY] });
      toast.success(res.data.message || 'Registration approved');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Could not approve this registration.')),
  });
}

export function useRejectRegistration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/users/pending-registrations/${id}/reject`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: [PENDING_REGISTRATIONS_KEY] });
      toast.success(res.data.message || 'Registration rejected');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Could not reject this registration.')),
  });
}
