import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient from '@/api/client';
import type {
  EditStaffForm,
  NewStaffForm,
  PayrollBatchResult,
  PayrollRecord,
  PayrollReport,
  PayrollSummary,
  SalaryComponent,
  StaffComponents,
  StaffProfile,
  StaffSummary,
} from './hr.types';

export const STAFF_KEY = 'hr-staff';
export const PAYROLL_KEY = 'hr-payroll';

function errorMessage(error: any, fallback: string) {
  return error.response?.data?.message || fallback;
}

export interface StaffListParams {
  page: number;
  pageSize: number;
  search?: string;
}

export interface StaffListResult {
  staff: StaffProfile[];
  total: number;
  summary: StaffSummary | null;
}

export function useStaffList(params: StaffListParams) {
  return useQuery({
    queryKey: [STAFF_KEY, params],
    queryFn: async (): Promise<StaffListResult> => {
      const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) });
      if (params.search) query.append('search', params.search);
      const res = await apiClient.get(`/hr/staff?${query.toString()}`);
      return {
        staff: res.data.data?.staff || res.data.data || [],
        total: res.data.data?.total ?? res.data.meta?.total ?? 0,
        summary: res.data.summary || null,
      };
    },
  });
}

export function useCreateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: NewStaffForm) => apiClient.post('/hr/staff', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [STAFF_KEY] });
      toast.success('New staff profile created successfully.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to create staff profile.')),
  });
}

export function useUpdateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<EditStaffForm> }) => apiClient.patch(`/hr/staff/${id}`, data),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: [STAFF_KEY] });
      toast.success('Staff profile updated.');
      void vars;
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to update staff profile.')),
  });
}

export interface PayrollListParams {
  page: number;
  pageSize: number;
  payPeriod?: string;
}

export interface PayrollListResult {
  payrolls: PayrollRecord[];
  total: number;
  summary: PayrollSummary | null;
}

export function usePayrollList(params: PayrollListParams) {
  return useQuery({
    queryKey: [PAYROLL_KEY, params],
    queryFn: async (): Promise<PayrollListResult> => {
      const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) });
      if (params.payPeriod) query.append('payPeriod', params.payPeriod);
      const res = await apiClient.get(`/hr/payroll?${query.toString()}`);
      return {
        payrolls: res.data.data?.payrolls || res.data.data || [],
        total: res.data.data?.total ?? res.data.meta?.total ?? 0,
        summary: res.data.summary || null,
      };
    },
  });
}

// Unfiltered/small fetch used to check "already processed this period" and to
// populate the staff picker inside the payroll modal without paginating.
export function useAllStaffForPayroll(enabled: boolean) {
  return useQuery({
    queryKey: [STAFF_KEY, 'all-for-payroll'],
    queryFn: async (): Promise<StaffProfile[]> => {
      const res = await apiClient.get('/hr/staff?page=1&pageSize=100');
      return res.data.data?.staff || res.data.data || [];
    },
    enabled,
  });
}

export interface ProcessPayrollPayload {
  staffId: string;
  payPeriod: string;
  allowances: number;
  deductions: number;
}

export function useProcessPayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: ProcessPayrollPayload) => apiClient.post('/hr/payroll', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PAYROLL_KEY] });
      toast.success('Payroll processed — pending approval.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to process payroll.')),
  });
}

export function usePayPayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/hr/payroll/${id}/pay`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PAYROLL_KEY] });
      toast.success('Payroll marked as paid.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to mark payroll as paid.')),
  });
}

// ── Salary components (Wave C) ────────────────────────────────────────────

export const COMPONENTS_KEY = 'hr-salary-components';
export const PAYROLL_REPORT_KEY = 'hr-payroll-report';

export function useSalaryComponents() {
  return useQuery({
    queryKey: [COMPONENTS_KEY],
    queryFn: async (): Promise<SalaryComponent[]> =>
      (await apiClient.get('/payroll-components?page=1&pageSize=100')).data.data?.items ?? [],
  });
}

export type ComponentPayload = Omit<SalaryComponent, 'id' | 'assignedCount'>;

export function useSaveSalaryComponent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Partial<ComponentPayload> }) =>
      id ? apiClient.patch(`/payroll-components/${id}`, data) : apiClient.post('/payroll-components', data),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: [COMPONENTS_KEY] });
      toast.success(vars.id ? 'Salary component updated.' : 'Salary component created.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to save salary component.')),
  });
}

export function useDeleteSalaryComponent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/payroll-components/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [COMPONENTS_KEY] });
      toast.success('Salary component deleted.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to delete salary component.')),
  });
}

export function useStaffComponents(staffId: string | null) {
  return useQuery({
    queryKey: [COMPONENTS_KEY, 'staff', staffId],
    queryFn: async (): Promise<StaffComponents> => (await apiClient.get(`/payroll-components/staff/${staffId}`)).data.data,
    enabled: !!staffId,
  });
}

export function useAssignStaffComponents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ staffId, components }: { staffId: string; components: { componentId: string; overrideValue: number | null }[] }) =>
      apiClient.put(`/payroll-components/staff/${staffId}`, { components }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [COMPONENTS_KEY] });
      toast.success('Salary components updated.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to update salary components.')),
  });
}

export function usePayrollBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payPeriod: string): Promise<PayrollBatchResult> =>
      (await apiClient.post('/hr/payroll/batch', { payPeriod })).data.data,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [PAYROLL_KEY] });
      qc.invalidateQueries({ queryKey: [PAYROLL_REPORT_KEY] });
      toast.success(`Batch done: ${result.processed} processed, ${result.skipped} already processed.`);
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to run payroll batch.')),
  });
}

export function usePayrollReport(payPeriod: string) {
  return useQuery({
    queryKey: [PAYROLL_REPORT_KEY, payPeriod],
    queryFn: async (): Promise<PayrollReport> =>
      (await apiClient.get('/hr/payroll/report', { params: { payPeriod } })).data.data,
    enabled: !!payPeriod,
  });
}
