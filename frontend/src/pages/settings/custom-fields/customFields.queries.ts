import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient from '@/api/client';
import type { CustomFieldDefinition, CustomFieldType } from './customFields.types';

export const CUSTOM_FIELDS_KEY = 'custom-fields';

function errorMessage(error: any, fallback: string): string {
  const data = error?.response?.data;
  const first = Array.isArray(data?.errors) ? data.errors[0]?.message : undefined;
  return first || data?.message || fallback;
}

/**
 * STUDENT custom field definitions. Readable by SUPER_ADMIN, ADMIN, TEACHER,
 * ACCOUNTANT, LIBRARIAN (the student-record readers).
 */
export function useCustomFieldDefinitions(enabled = true) {
  return useQuery({
    queryKey: [CUSTOM_FIELDS_KEY, 'STUDENT'],
    enabled,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CustomFieldDefinition[]> => {
      const res = await apiClient.get('/custom-fields', { params: { entity: 'STUDENT' } });
      return res.data.data || [];
    },
  });
}

export interface CustomFieldPayload {
  label: string;
  key?: string;
  type: CustomFieldType;
  options?: string[] | null;
  required: boolean;
  sortOrder?: number;
}

export function useCreateCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CustomFieldPayload) => apiClient.post('/custom-fields', { ...dto, entity: 'STUDENT' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CUSTOM_FIELDS_KEY] });
      toast.success('Custom field created.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to create custom field.')),
  });
}

export function useUpdateCustomField() {
  const qc = useQueryClient();
  return useMutation({
    // key is immutable server-side — never sent on update.
    mutationFn: ({ id, data }: { id: string; data: Omit<Partial<CustomFieldPayload>, 'key'> }) =>
      apiClient.put(`/custom-fields/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CUSTOM_FIELDS_KEY] });
      toast.success('Custom field updated.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to update custom field.')),
  });
}

export function useDeleteCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/custom-fields/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CUSTOM_FIELDS_KEY] });
      toast.success('Custom field deleted.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to delete custom field.')),
  });
}

export function useReorderCustomFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => apiClient.put('/custom-fields/reorder', { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CUSTOM_FIELDS_KEY] }),
    onError: (error: any) => {
      toast.error(errorMessage(error, 'Failed to save the new order.'));
      qc.invalidateQueries({ queryKey: [CUSTOM_FIELDS_KEY] });
    },
  });
}
