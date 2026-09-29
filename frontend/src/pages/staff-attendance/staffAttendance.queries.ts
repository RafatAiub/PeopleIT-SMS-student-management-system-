import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient from '@/api/client';

export type StaffStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE' | 'HALF_DAY';

export interface StaffRegisterRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  designation: string | null;
  employeeId: string | null;
  status: StaffStatus | null;
  checkIn: string | null;
  checkOut: string | null;
  note: string | null;
  suggestedStatus: 'LEAVE' | null;
  leaveType: string | null;
}

export interface StaffCounts {
  present: number;
  absent: number;
  late: number;
  leave: number;
  halfDay: number;
  total: number;
}

export interface StaffRegister {
  date: string;
  staff: StaffRegisterRow[];
  counts: StaffCounts;
  unmarked: number;
}

export interface StaffReportRow extends StaffCounts {
  id: string;
  userId: string;
  name: string;
  role: string;
  department: string | null;
  designation: string | null;
  percentage: number | null;
}

export interface StaffReport {
  month: string;
  rows: StaffReportRow[];
  totals: StaffCounts & { percentage: number | null; staffCount: number };
}

export interface StaffDetail {
  month: string;
  staffUserId: string;
  days: { date: string; status: StaffStatus; checkIn: string | null; checkOut: string | null; note: string | null }[];
  approvedLeaves: { startDate: string; endDate: string; leaveType: string | null }[];
  counts: StaffCounts;
  percentage: number | null;
}

const KEY = 'staff-attendance';

function errorMessage(error: any, fallback: string) {
  return error?.response?.data?.message || fallback;
}

export function useStaffRegister(date: string) {
  return useQuery({
    queryKey: [KEY, 'register', date],
    queryFn: async (): Promise<StaffRegister> =>
      (await apiClient.get(`/staff-attendance/register?date=${date}`)).data.data,
    enabled: !!date,
  });
}

export function useSubmitStaffAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { date: string; records: { staffUserId: string; status: StaffStatus; note?: string | null }[] }) =>
      apiClient.post('/staff-attendance/bulk', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success('Staff attendance saved.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to save staff attendance.')),
  });
}

export function useStaffReport(month: string) {
  return useQuery({
    queryKey: [KEY, 'report', month],
    queryFn: async (): Promise<StaffReport> => {
      const data: StaffReport = (await apiClient.get(`/staff-attendance/report?month=${month}`)).data.data;
      return { ...data, rows: data.rows.map((r) => ({ ...r, id: r.userId })) };
    },
    enabled: !!month,
  });
}

export function useStaffDetail(staffUserId: string | null, month: string) {
  return useQuery({
    queryKey: [KEY, 'detail', staffUserId, month],
    queryFn: async (): Promise<StaffDetail> =>
      (await apiClient.get(`/staff-attendance/report/${staffUserId}?month=${month}`)).data.data,
    enabled: !!staffUserId && !!month,
  });
}

export function useMyStaffAttendance(month: string) {
  return useQuery({
    queryKey: [KEY, 'me', month],
    queryFn: async (): Promise<StaffDetail> => (await apiClient.get(`/staff-attendance/me?month=${month}`)).data.data,
    enabled: !!month,
  });
}

export const currentMonth = () => new Date().toISOString().slice(0, 7);
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
