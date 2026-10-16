import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { isModuleOn, type ModulesResponse } from '@/lib/modules';

// =============================================================================
// T0 module switches — one cached query per school (GET /institution/modules).
//   useModules()            → the resolved list + enabled map
//   useModuleEnabled(key)   → boolean (registry default while loading)
//   useUpdateModules()      → Settings → Modules writes
// =============================================================================

export const MODULES_KEY = ['institution-modules'] as const;

export function useModules() {
  const user = useAuthStore((s) => s.user);
  // A bare Super Admin has no school selected — nothing to fetch.
  const hasTenant = Boolean(user?.institutionId);
  return useQuery({
    queryKey: [...MODULES_KEY, user?.institutionId ?? null],
    enabled: hasTenant,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async (): Promise<ModulesResponse> => {
      const { data } = await apiClient.get('/institution/modules');
      return data?.data ?? { modules: [], enabled: {} };
    },
  });
}

/** Is this module on for the signed-in user's school? */
export function useModuleEnabled(key: string | undefined): boolean {
  const { data } = useModules();
  return isModuleOn(key, data?.enabled);
}

/** `{ enabled, isLoading }` — for gates that must wait instead of guessing. */
export function useModuleState(key: string | undefined): { enabled: boolean; isLoading: boolean } {
  const q = useModules();
  return { enabled: isModuleOn(key, q.data?.enabled), isLoading: q.isLoading && q.fetchStatus !== 'idle' };
}

export function useUpdateModules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (modules: Record<string, boolean>): Promise<ModulesResponse> => {
      const { data } = await apiClient.put('/institution/modules', { modules });
      return data?.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MODULES_KEY });
    },
  });
}
