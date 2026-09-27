import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';

// =============================================================================
// Website builder — local data layer for GET/PUT /institution/website.
// Query key intentionally matches the one used by
// pages/settings/settings.queries.ts (same endpoint), so visiting Settings and
// the Website Builder in the same session shares one cache entry instead of
// each page holding a stale copy of the other's last save. The two files are
// not shared code because they belong to separately-owned page folders.
// =============================================================================

export interface WebsiteConfig {
  name?: string;
  logoUrl?: string | null;
  themeColor?: string | null;
  heroTitle?: string;
  heroSubtitle?: string;
  aboutText?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
}

export const INSTITUTION_WEBSITE_KEY = ['institution-website'] as const;

export function useInstitutionWebsite() {
  return useQuery({
    queryKey: INSTITUTION_WEBSITE_KEY,
    queryFn: async (): Promise<WebsiteConfig> => {
      const { data } = await apiClient.get('/institution/website');
      return data?.data ?? {};
    },
  });
}

export function useUpdateInstitutionWebsite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<WebsiteConfig>) => {
      const { data } = await apiClient.put('/institution/website', payload);
      return data?.data ?? payload;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: INSTITUTION_WEBSITE_KEY }),
  });
}
