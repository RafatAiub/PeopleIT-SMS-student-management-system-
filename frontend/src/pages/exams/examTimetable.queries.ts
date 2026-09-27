// Exam timetable. Contract: backend/src/modules/exam-timetable
// (examTimetable.routes.ts) — mounted at /api/v1/exam-timetable.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';

export interface ExamSlot {
  id: string;
  examId: string;
  className: string;
  sectionName: string | null;
  subjectName: string;
  /** YYYY-MM-DD */
  date: string;
  startTime: string;
  endTime: string;
  room: string | null;
  exam: { id: string; name: string; startDate: string; endDate: string };
}

export interface SlotPayload {
  examId: string;
  className: string;
  sectionName?: string | null;
  subjectName: string;
  date: string;
  startTime: string;
  endTime: string;
  room?: string | null;
}

export interface SlotConflict {
  type: 'CLASS' | 'ROOM';
  slotId: string | null;
  message: string;
}

const KEY = 'exam-timetable';

export function useExamSlots(params: { examId?: string; className?: string }, enabled = true) {
  return useQuery({
    queryKey: [KEY, params],
    queryFn: async (): Promise<{ items: ExamSlot[]; meta: { total: number; page: number; pageSize: number } }> => {
      const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v));
      return (await apiClient.get('/exam-timetable', { params: { ...clean, page: 1, pageSize: 100 } })).data.data;
    },
    enabled,
  });
}

export async function checkSlotConflicts(payload: SlotPayload & { id?: string }): Promise<SlotConflict[]> {
  const { data } = await apiClient.post('/exam-timetable/check-conflicts', payload);
  return data.data.conflicts ?? [];
}

export function useSaveSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id?: string; payload: SlotPayload }) =>
      id ? (await apiClient.put(`/exam-timetable/${id}`, payload)).data.data : (await apiClient.post('/exam-timetable', payload)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/exam-timetable/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
