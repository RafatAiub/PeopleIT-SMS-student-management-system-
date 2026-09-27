// Promotion / year rollover. Contract: backend/src/modules/promotion
// (promotion.routes.ts) — mounted at /api/v1/promotion, SUPER_ADMIN/ADMIN.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';

export type PromotionStatus = 'PROMOTED' | 'RETAINED' | 'GRADUATED' | 'TRANSFERRED';
export const PROMOTION_STATUSES: PromotionStatus[] = ['PROMOTED', 'RETAINED', 'GRADUATED', 'TRANSFERRED'];

export interface Candidate {
  id: string;
  studentCode: string;
  name: string;
  rollNumber: string | null;
  section: { id: string; name: string } | null;
  yearUnassigned: boolean;
  result: {
    subjects: number;
    totalObtained: number;
    totalMax: number;
    percent: number;
    gpa: number;
    failedSubjects: string[];
    passed: boolean;
    grade: string;
  } | null;
  suggestedStatus: PromotionStatus | null;
  alreadyProcessed: { status: PromotionStatus; createdAt: string } | null;
}

export interface CandidateParams {
  fromAcademicYearId: string;
  fromClassId: string;
  fromSectionId?: string;
  examId?: string;
  toAcademicYearId?: string;
}

export interface PromotionDecision {
  studentId: string;
  status: PromotionStatus;
  toClassId?: string | null;
  toSectionId?: string | null;
  note?: string | null;
}

export interface PromotionRequest {
  fromAcademicYearId: string;
  fromClassId: string;
  fromSectionId?: string | null;
  toAcademicYearId: string;
  toClassId?: string | null;
  toSectionId?: string | null;
  note?: string | null;
  decisions: PromotionDecision[];
}

export interface PlanRow {
  studentId: string;
  studentCode: string | null;
  name: string;
  rollNumber: string | null;
  status: PromotionStatus;
  fromClass: string | null;
  fromSection: string | null;
  toClass: string | null;
  toSection: string | null;
  note: string | null;
}

export interface PlanResult {
  fromSession?: string | null;
  toSession?: string | null;
  actions: PlanRow[];
  skipped: Array<{ studentId: string; reason: string; name: string; studentCode: string | null }>;
  counts: Record<PromotionStatus, number>;
}

export interface ExecuteResult extends PlanResult {
  batchId: string | null;
  processed: number;
}

export interface PromotionBatch {
  id: string;
  batchId: string;
  createdAt: string;
  promotedBy: string | null;
  fromClass: string | null;
  toClasses: string[];
  fromSession: string | null;
  toSession: string | null;
  total: number;
  counts: Record<PromotionStatus, number>;
  canUndo: boolean;
}

export interface PromotionRecordRow {
  id: string;
  batchId: string;
  status: PromotionStatus;
  note: string | null;
  createdAt: string;
  student: { id: string; studentId: string; firstName: string; lastName: string; rollNumber: string | null };
  fromAcademicYear: { label: string } | null;
  toAcademicYear: { label: string } | null;
  fromClass: { name: string } | null;
  toClass: { name: string } | null;
  fromSection: { name: string } | null;
  toSection: { name: string } | null;
  promotedBy: { firstName: string; lastName: string } | null;
}

export interface Paginated<T> {
  items: T[];
  meta: { total: number; page: number; pageSize: number };
}

const KEYS = { candidates: 'promotion-candidates', batches: 'promotion-batches', history: 'promotion-history' };

export function useCandidates(params: CandidateParams, enabled: boolean) {
  return useQuery({
    queryKey: [KEYS.candidates, params],
    queryFn: async (): Promise<Paginated<Candidate>> => {
      const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v));
      return (await apiClient.get('/promotion/candidates', { params: clean })).data.data;
    },
    enabled,
  });
}

export function usePreviewPromotion() {
  return useMutation({
    mutationFn: async (body: PromotionRequest): Promise<PlanResult> => (await apiClient.post('/promotion/preview', body)).data.data,
  });
}

export function useExecutePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: PromotionRequest): Promise<ExecuteResult> => (await apiClient.post('/promotion/execute', body)).data.data,
    onSuccess: () => {
      Object.values(KEYS).forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
  });
}

export function useBatches(page: number, pageSize: number) {
  return useQuery({
    queryKey: [KEYS.batches, page, pageSize],
    queryFn: async (): Promise<Paginated<PromotionBatch>> => (await apiClient.get('/promotion/batches', { params: { page, pageSize } })).data.data,
  });
}

export function useHistory(params: { page: number; pageSize: number; batchId?: string; status?: string }) {
  return useQuery({
    queryKey: [KEYS.history, params],
    queryFn: async (): Promise<Paginated<PromotionRecordRow>> => {
      const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
      return (await apiClient.get('/promotion/history', { params: clean })).data.data;
    },
  });
}

export function useUndoBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (batchId: string): Promise<{ reverted: number; conflicts: Array<{ studentId: string; reason: string }> }> =>
      (await apiClient.post(`/promotion/batches/${encodeURIComponent(batchId)}/undo`)).data.data,
    onSuccess: () => {
      Object.values(KEYS).forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
  });
}
