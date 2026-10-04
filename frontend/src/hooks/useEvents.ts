import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { eventApi, type EventFilters, type EventInput } from '@/api/event.api';
import toast from 'react-hot-toast';

export const EVENTS_KEY = 'events';
const SESSION_YEARS_KEY = 'session-years'; // event counts shown on the Session Year page

function errorMessage(error: any, fallback: string) {
  return error.response?.data?.message || fallback;
}

export function useEvents(filters: EventFilters) {
  return useQuery({
    queryKey: [EVENTS_KEY, filters],
    queryFn: () => eventApi.list(filters),
  });
}

export function useUpcomingEvents(limit = 5) {
  return useQuery({
    queryKey: [EVENTS_KEY, 'upcoming', limit],
    queryFn: () => eventApi.upcoming(limit),
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: EventInput & { notify?: boolean }) => eventApi.create(dto),
    onSuccess: (event) => {
      qc.invalidateQueries({ queryKey: [EVENTS_KEY] });
      qc.invalidateQueries({ queryKey: [SESSION_YEARS_KEY] });
      toast.success(`Event "${event.title}" created.`);
    },
    onError: (error: any) => {
      toast.error(errorMessage(error, 'Failed to create event.'));
    },
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: EventInput }) => eventApi.update(id, data),
    onSuccess: (event) => {
      qc.invalidateQueries({ queryKey: [EVENTS_KEY] });
      qc.invalidateQueries({ queryKey: [SESSION_YEARS_KEY] });
      toast.success(`Event "${event.title}" updated.`);
    },
    onError: (error: any) => {
      toast.error(errorMessage(error, 'Failed to update event.'));
    },
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => eventApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [EVENTS_KEY] });
      qc.invalidateQueries({ queryKey: [SESSION_YEARS_KEY] });
      toast.success('Event deleted.');
    },
    onError: (error: any) => {
      toast.error(errorMessage(error, 'Failed to delete event.'));
    },
  });
}
