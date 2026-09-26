import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionYearApi, type SessionYearInput } from '@/api/sessionYear.api';
import { EVENTS_KEY } from './useEvents';
import toast from 'react-hot-toast';

export const SESSION_YEARS_KEY = 'session-years';

function errorMessage(error: any, fallback: string) {
  return error.response?.data?.message || fallback;
}

export function useSessionYears() {
  return useQuery({
    queryKey: [SESSION_YEARS_KEY],
    queryFn: () => sessionYearApi.list(),
  });
}

export function useCreateSessionYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: SessionYearInput & { isDefault?: boolean }) => sessionYearApi.create(dto),
    onSuccess: (year) => {
      qc.invalidateQueries({ queryKey: [SESSION_YEARS_KEY] });
      toast.success(`Session year "${year.label}" created.`);
    },
    onError: (error: any) => {
      toast.error(errorMessage(error, 'Failed to create session year.'));
    },
  });
}

export function useUpdateSessionYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SessionYearInput> }) => sessionYearApi.update(id, data),
    onSuccess: (year) => {
      qc.invalidateQueries({ queryKey: [SESSION_YEARS_KEY] });
      toast.success(`Session year "${year.label}" updated.`);
    },
    onError: (error: any) => {
      toast.error(errorMessage(error, 'Failed to update session year.'));
    },
  });
}

export function useSetDefaultSessionYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sessionYearApi.setDefault(id),
    onSuccess: (year) => {
      qc.invalidateQueries({ queryKey: [SESSION_YEARS_KEY] });
      // The events page follows the default session.
      qc.invalidateQueries({ queryKey: [EVENTS_KEY] });
      toast.success(`"${year.label}" is now the default session year.`);
    },
    onError: (error: any) => {
      toast.error(errorMessage(error, 'Failed to change the default session year.'));
    },
  });
}

export function useDeleteSessionYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sessionYearApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [SESSION_YEARS_KEY] });
      toast.success('Session year deleted.');
    },
    onError: (error: any) => {
      toast.error(errorMessage(error, 'Failed to delete session year.'));
    },
  });
}
