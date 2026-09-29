import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { holidayApi, type CreateHolidayDto, type UpdateHolidayDto } from '@/api/holiday.api';
import toast from 'react-hot-toast';

export const HOLIDAYS_KEY = 'holidays';

function errorMessage(error: any, fallback: string) {
  return error.response?.data?.message || fallback;
}

export function useHolidays(year: number) {
  return useQuery({
    queryKey: [HOLIDAYS_KEY, year],
    queryFn: () => holidayApi.list(year),
  });
}

export function useCreateHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateHolidayDto) => holidayApi.create(dto),
    onSuccess: ({ created }) => {
      qc.invalidateQueries({ queryKey: [HOLIDAYS_KEY] });
      toast.success(created === 1 ? 'Holiday added.' : `${created} holiday days added.`);
    },
    onError: (error: any) => {
      toast.error(errorMessage(error, 'Failed to add holiday.'));
    },
  });
}

export function useUpdateHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateHolidayDto }) => holidayApi.update(id, data),
    onSuccess: (holiday) => {
      qc.invalidateQueries({ queryKey: [HOLIDAYS_KEY] });
      toast.success(`"${holiday.title}" updated.`);
    },
    onError: (error: any) => {
      toast.error(errorMessage(error, 'Failed to update holiday.'));
    },
  });
}

export function useDeleteHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => holidayApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [HOLIDAYS_KEY] });
      toast.success('Holiday deleted.');
    },
    onError: (error: any) => {
      toast.error(errorMessage(error, 'Failed to delete holiday.'));
    },
  });
}

export function useUpdateWeeklyOffDays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ year, weeklyOffDays }: { year: number; weeklyOffDays: number[] }) =>
      holidayApi.updateWeeklyOffDays(year, weeklyOffDays),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [HOLIDAYS_KEY] });
      toast.success('Weekly holidays updated.');
    },
    onError: (error: any) => {
      toast.error(errorMessage(error, 'Failed to update weekly holidays.'));
    },
  });
}

export function useSyncGovernmentHolidays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (year: number) => holidayApi.syncGovernment(year),
    onSuccess: ({ source, added, updated, removed }) => {
      qc.invalidateQueries({ queryKey: [HOLIDAYS_KEY] });
      if (source === 'FALLBACK') {
        toast("This year's government holiday list isn't published yet — it will be added automatically once it is.");
      } else if (added + updated + removed === 0) {
        toast.success('Government holidays are already up to date.');
      } else {
        toast.success(`Government holidays synced: ${added} added, ${updated} updated, ${removed} removed.`);
      }
    },
    onError: (error: any) => {
      toast.error(errorMessage(error, 'Failed to sync government holidays.'));
    },
  });
}

export function useRestoreHolidayDefaults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (year: number) => holidayApi.restoreDefaults(year),
    onSuccess: ({ added }) => {
      qc.invalidateQueries({ queryKey: [HOLIDAYS_KEY] });
      toast.success(added === 0 ? 'Nothing to restore — all default holidays are already listed.' : `${added} default holidays restored.`);
    },
    onError: (error: any) => {
      toast.error(errorMessage(error, 'Failed to restore default holidays.'));
    },
  });
}
