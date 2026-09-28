import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient from '@/api/client';
import type {
  ApplyMode,
  DnsRecord,
  GenerateSiteResponse,
  GeneratedPage,
  PageSeo,
  PuckData,
  SiteDomain,
  SiteForm,
  SiteFormField,
  SiteFormSubmission,
  SiteMedia,
  SiteMeResponse,
  SiteNavigation,
  SitePage,
  SitePageVersion,
  SitePost,
  SiteSettings,
  SiteTheme,
  FormTarget,
  MediaKind,
  PostStatus,
} from './sites.types';

// =============================================================================
// Website builder data layer — /api/v1/sites (admin API, Engineer A).
// Every response is the usual `{ success, data, message?, meta? }` envelope.
// =============================================================================

export function apiError(error: unknown, fallback: string): string {
  const e = error as { response?: { data?: { message?: string } }; message?: string };
  return e?.response?.data?.message || fallback;
}

const unwrap = <T>(res: { data: { data?: T } }): T => res.data.data as T;

/** List endpoints return `{ items, total }` (or a bare array); always hand back the array. */
function list<T>(res: { data: { data?: unknown } }): T[] {
  const d = res.data?.data as { items?: T[] } | T[] | undefined;
  if (Array.isArray(d)) return d;
  return d?.items ?? [];
}

export const SITE_KEY = ['sites', 'me'] as const;
export const SITE_PAGE_KEY = 'site-page';
export const SITE_VERSIONS_KEY = 'site-page-versions';
export const SITE_MEDIA_KEY = ['sites', 'media'] as const;
export const SITE_POSTS_KEY = 'site-posts';
export const SITE_FORMS_KEY = ['sites', 'forms'] as const;
export const SITE_SUBMISSIONS_KEY = 'site-form-submissions';
export const SITE_DOMAINS_KEY = ['sites', 'domains'] as const;

// ── Site ─────────────────────────────────────────────────────────────────────

export function useSite(enabled = true) {
  return useQuery({
    queryKey: SITE_KEY,
    queryFn: async (): Promise<SiteMeResponse> => {
      const d = unwrap<SiteMeResponse>(await apiClient.get('/sites/me'));
      return { ...d, pages: d?.pages ?? [], domains: d?.domains ?? [] };
    },
    enabled,
  });
}

export interface UpdateSitePayload {
  theme?: Partial<SiteTheme>;
  navigation?: Partial<SiteNavigation>;
  settings?: Partial<SiteSettings>;
  templateKey?: string;
  subdomain?: string;
}

export function useUpdateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateSitePayload) => unwrap(await apiClient.put('/sites/me', payload)),
    onSuccess: () => qc.invalidateQueries({ queryKey: SITE_KEY }),
    onError: (e) => toast.error(apiError(e, 'Could not save the website changes.')),
  });
}

export interface ApplyTemplatePayload {
  templateKey: string;
  mode: ApplyMode;
  pages: { slug: string; title: string; titleBn?: string; seo?: PageSeo; data: PuckData }[];
  theme?: Partial<SiteTheme>;
  navigation?: Partial<SiteNavigation>;
}

export function useApplyTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ApplyTemplatePayload) => unwrap(await apiClient.post('/sites/me/apply-template', payload)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SITE_KEY });
      qc.invalidateQueries({ queryKey: [SITE_PAGE_KEY] });
    },
    onError: (e) => toast.error(apiError(e, 'Could not apply the template.')),
  });
}

export function usePublishSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await apiClient.post('/sites/me/publish')),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SITE_KEY });
      qc.invalidateQueries({ queryKey: [SITE_PAGE_KEY] });
    },
    onError: (e) => toast.error(apiError(e, 'Could not publish the website.')),
  });
}

export function useUnpublishSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await apiClient.post('/sites/me/unpublish')),
    onSuccess: () => qc.invalidateQueries({ queryKey: SITE_KEY }),
    onError: (e) => toast.error(apiError(e, 'Could not take the website offline.')),
  });
}

/**
 * Signed preview token for draft previews and live-data blocks in the editor.
 * Refreshed before it expires (the token in GET /me may be stale from cache).
 */
export function usePreviewToken(enabled = true) {
  return useQuery({
    queryKey: ['sites', 'preview-token'],
    queryFn: async (): Promise<{ token: string; expiresIn: number; previewUrl: string }> =>
      unwrap(await apiClient.post('/sites/me/preview-token')),
    enabled,
    staleTime: 10 * 60 * 1000,
    refetchInterval: (q) => Math.max(60, (q.state.data?.expiresIn ?? 3600) * 0.8) * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useGenerateSite() {
  return useMutation({
    mutationFn: async (payload: { tone?: string; languages?: string[] }): Promise<GenerateSiteResponse> => {
      const res = await apiClient.post('/sites/me/generate', payload, { timeout: 120000 });
      const d = (res.data?.data ?? {}) as Partial<GenerateSiteResponse> & { drafts?: GeneratedPage[] };
      return {
        ...d,
        pages: d.pages ?? d.drafts ?? [],
        demo: Boolean(d.demo ?? (res.data as { demo?: boolean })?.demo),
      };
    },
    onError: (e) => toast.error(apiError(e, 'The AI site generator failed.')),
  });
}

/**
 * Institution facts for template tokens ({{institution.name}} …) inside the
 * editor preview. Same endpoint/key the Settings page already uses.
 */
export interface InstitutionWebsiteInfo {
  name?: string;
  logoUrl?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
}

export function useInstitutionInfo() {
  return useQuery({
    queryKey: ['institution-website'],
    queryFn: async (): Promise<InstitutionWebsiteInfo> => (await apiClient.get('/institution/website')).data?.data ?? {},
    staleTime: 5 * 60 * 1000,
  });
}

export function useMarkSubmissionRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ formId, submissionId, read }: { formId: string; submissionId: string; read: boolean }) =>
      apiClient.put(`/sites/forms/${formId}/submissions/${submissionId}/read`, { read }),
    onSuccess: (_, { formId }) => {
      qc.invalidateQueries({ queryKey: [SITE_SUBMISSIONS_KEY, formId] });
      qc.invalidateQueries({ queryKey: SITE_FORMS_KEY });
    },
    onError: (e) => toast.error(apiError(e, 'Could not update the submission.')),
  });
}

// ── Pages ────────────────────────────────────────────────────────────────────

export function usePage(id: string | undefined) {
  return useQuery({
    queryKey: [SITE_PAGE_KEY, id],
    queryFn: async (): Promise<SitePage> => unwrap<SitePage>(await apiClient.get(`/sites/pages/${id}`)),
    enabled: !!id,
    // The editor owns the working copy; never clobber it with a background refetch.
    refetchOnWindowFocus: false,
  });
}

export interface CreatePagePayload {
  title: string;
  titleBn?: string;
  slug: string;
  /** Initial draft content (Puck data). */
  data?: PuckData;
  seo?: PageSeo;
}

export function useCreatePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreatePagePayload): Promise<SitePage> => unwrap<SitePage>(await apiClient.post('/sites/pages', payload)),
    onSuccess: () => qc.invalidateQueries({ queryKey: SITE_KEY }),
    onError: (e) => toast.error(apiError(e, 'Could not create the page.')),
  });
}

export interface UpdatePagePayload {
  title?: string;
  titleBn?: string | null;
  slug?: string;
  seo?: PageSeo;
  draft?: PuckData;
  scheduledPublishAt?: string | null;
  note?: string;
}

export function useUpdatePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdatePagePayload }): Promise<SitePage> =>
      unwrap<SitePage>(await apiClient.put(`/sites/pages/${id}`, data)),
    onSuccess: (page, { id }) => {
      if (page && typeof page === 'object' && 'id' in page) qc.setQueryData([SITE_PAGE_KEY, id], page);
      qc.invalidateQueries({ queryKey: SITE_KEY });
      qc.invalidateQueries({ queryKey: [SITE_VERSIONS_KEY, id] });
    },
    onError: (e) => toast.error(apiError(e, 'Could not save the page.')),
  });
}

export function useDeletePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/sites/pages/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SITE_KEY });
      toast.success('Page deleted.');
    },
    onError: (e) => toast.error(apiError(e, 'Could not delete the page.')),
  });
}

export function usePublishPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await apiClient.post(`/sites/pages/${id}/publish`)),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: SITE_KEY });
      qc.invalidateQueries({ queryKey: [SITE_PAGE_KEY, id] });
      qc.invalidateQueries({ queryKey: [SITE_VERSIONS_KEY, id] });
    },
    onError: (e) => toast.error(apiError(e, 'Could not publish the page.')),
  });
}

export function useReorderPages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => apiClient.put('/sites/pages/order', { ids }),
    onSettled: () => qc.invalidateQueries({ queryKey: SITE_KEY }),
    onError: (e) => toast.error(apiError(e, 'Could not save the page order.')),
  });
}

export function usePageVersions(pageId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [SITE_VERSIONS_KEY, pageId],
    queryFn: async (): Promise<SitePageVersion[]> => list<SitePageVersion>(await apiClient.get(`/sites/pages/${pageId}/versions`, { params: { pageSize: 30 } })),
    enabled: !!pageId && enabled,
  });
}

export function useRestoreVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pageId, versionId }: { pageId: string; versionId: string }): Promise<SitePage> =>
      unwrap<SitePage>(await apiClient.post(`/sites/pages/${pageId}/versions/${versionId}/restore`)),
    onSuccess: (_, { pageId }) => {
      qc.invalidateQueries({ queryKey: [SITE_PAGE_KEY, pageId] });
      qc.invalidateQueries({ queryKey: [SITE_VERSIONS_KEY, pageId] });
    },
    onError: (e) => toast.error(apiError(e, 'Could not restore that version.')),
  });
}

// ── Media ────────────────────────────────────────────────────────────────────

export function useMedia(enabled = true) {
  return useQuery({
    queryKey: SITE_MEDIA_KEY,
    queryFn: async (): Promise<SiteMedia[]> => list<SiteMedia>(await apiClient.get('/sites/media', { params: { pageSize: 100 } })),
    enabled,
  });
}

export interface CreateMediaPayload {
  url: string;
  kind: MediaKind;
  name: string;
  alt: string;
  size?: number;
  width?: number;
  height?: number;
}

export function useCreateMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateMediaPayload): Promise<SiteMedia> => unwrap<SiteMedia>(await apiClient.post('/sites/media', payload)),
    onSuccess: () => qc.invalidateQueries({ queryKey: SITE_MEDIA_KEY }),
    onError: (e) => toast.error(apiError(e, 'Could not save the file to the media library.')),
  });
}

export function useDeleteMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/sites/media/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SITE_MEDIA_KEY });
      toast.success('File removed from the library.');
    },
    onError: (e) => toast.error(apiError(e, 'Could not delete the file.')),
  });
}

// ── Posts ────────────────────────────────────────────────────────────────────

export function usePosts(enabled = true) {
  return useQuery({
    queryKey: [SITE_POSTS_KEY],
    queryFn: async (): Promise<SitePost[]> => list<SitePost>(await apiClient.get('/sites/posts', { params: { pageSize: 100 } })),
    enabled,
  });
}

export function usePost(id: string | undefined) {
  return useQuery({
    queryKey: [SITE_POSTS_KEY, id],
    queryFn: async (): Promise<SitePost> => unwrap<SitePost>(await apiClient.get(`/sites/posts/${id}`)),
    enabled: !!id,
    refetchOnWindowFocus: false,
  });
}

export interface PostPayload {
  title: string;
  slug: string;
  excerpt?: string | null;
  coverUrl?: string | null;
  body: unknown;
  status: PostStatus;
  tags: string[];
}

export function useSavePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: PostPayload }): Promise<SitePost> =>
      unwrap<SitePost>(id ? await apiClient.put(`/sites/posts/${id}`, data) : await apiClient.post('/sites/posts', data)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [SITE_POSTS_KEY] }),
    onError: (e) => toast.error(apiError(e, 'Could not save the post.')),
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/sites/posts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [SITE_POSTS_KEY] });
      toast.success('Post deleted.');
    },
    onError: (e) => toast.error(apiError(e, 'Could not delete the post.')),
  });
}

// ── Forms ────────────────────────────────────────────────────────────────────

export function useForms(enabled = true) {
  return useQuery({
    queryKey: SITE_FORMS_KEY,
    queryFn: async (): Promise<SiteForm[]> => list<SiteForm>(await apiClient.get('/sites/forms', { params: { pageSize: 100 } })),
    enabled,
  });
}

export interface FormPayload {
  name: string;
  fields: SiteFormField[];
  target: FormTarget;
  notifyEmails: string[];
}

export function useSaveForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: FormPayload }): Promise<SiteForm> =>
      unwrap<SiteForm>(id ? await apiClient.put(`/sites/forms/${id}`, data) : await apiClient.post('/sites/forms', data)),
    onSuccess: () => qc.invalidateQueries({ queryKey: SITE_FORMS_KEY }),
    onError: (e) => toast.error(apiError(e, 'Could not save the form.')),
  });
}

export function useDeleteForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/sites/forms/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SITE_FORMS_KEY });
      toast.success('Form deleted.');
    },
    onError: (e) => toast.error(apiError(e, 'Could not delete the form.')),
  });
}

export function useFormSubmissions(formId: string | undefined) {
  return useQuery({
    queryKey: [SITE_SUBMISSIONS_KEY, formId],
    queryFn: async (): Promise<SiteFormSubmission[]> =>
      list<SiteFormSubmission>(await apiClient.get(`/sites/forms/${formId}/submissions`, { params: { pageSize: 100 } })),
    enabled: !!formId,
  });
}

// ── Domains ──────────────────────────────────────────────────────────────────

/** Accept either `records` or `dnsRecords` on a domain row. */
function normaliseDomain(d: SiteDomain & { dnsRecords?: DnsRecord[] }): SiteDomain {
  return { ...d, records: d.records ?? d.dnsRecords ?? [] };
}

export function useDomains(enabled = true) {
  return useQuery({
    queryKey: SITE_DOMAINS_KEY,
    queryFn: async (): Promise<SiteDomain[]> => {
      const rows = list<SiteDomain & { dnsRecords?: DnsRecord[] }>(await apiClient.get('/sites/domains', { params: { pageSize: 100 } }));
      return rows.map(normaliseDomain);
    },
    enabled,
  });
}

export interface AddDomainResult {
  domain: SiteDomain;
  records: DnsRecord[];
  demo: boolean;
}

export function useAddDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (hostname: string): Promise<AddDomainResult> => {
      const res = await apiClient.post('/sites/domains', { hostname });
      const d = res.data?.data ?? {};
      // Either `{ domain, records }` or the domain row itself (with records on it).
      const domain = normaliseDomain(d.domain ?? d);
      const records: DnsRecord[] = d.records ?? d.dnsRecords ?? domain.records ?? [];
      return { domain: { ...domain, records }, records, demo: Boolean(d.demo ?? domain.isDemo) };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SITE_DOMAINS_KEY });
      qc.invalidateQueries({ queryKey: SITE_KEY });
    },
    onError: (e) => toast.error(apiError(e, 'Could not add the domain.')),
  });
}

export function useVerifyDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<{ domain: SiteDomain; demo: boolean; message?: string }> => {
      const res = await apiClient.post(`/sites/domains/${id}/verify`);
      const d = res.data?.data ?? {};
      const domain = normaliseDomain(d.domain ?? d);
      return { domain, demo: Boolean(d.demo ?? domain.isDemo), message: d.dns?.detail ?? res.data?.message };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SITE_DOMAINS_KEY });
      qc.invalidateQueries({ queryKey: SITE_KEY });
    },
    onError: (e) => toast.error(apiError(e, 'Could not check the domain.')),
  });
}

export function useSetPrimaryDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.put(`/sites/domains/${id}/primary`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SITE_DOMAINS_KEY });
      qc.invalidateQueries({ queryKey: SITE_KEY });
      toast.success('Primary domain updated.');
    },
    onError: (e) => toast.error(apiError(e, 'Could not set the primary domain.')),
  });
}

export function useDeleteDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/sites/domains/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SITE_DOMAINS_KEY });
      qc.invalidateQueries({ queryKey: SITE_KEY });
      toast.success('Domain removed.');
    },
    onError: (e) => toast.error(apiError(e, 'Could not remove the domain.')),
  });
}
