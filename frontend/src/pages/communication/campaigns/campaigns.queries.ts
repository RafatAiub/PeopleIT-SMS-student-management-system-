import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient from '@/api/client';
import type {
  Audience,
  Campaign,
  CampaignChannel,
  CampaignConfig,
  CampaignDetail,
  CampaignStatus,
  ClassMeta,
  Delivery,
  DeliveryStatus,
  GroupMemberUser,
  MessageGroup,
  MessageGroupDetail,
  PreviewResult,
  SectionMeta,
} from './campaigns.types';

function errorMessage(error: any, fallback: string) {
  return error?.response?.data?.message || fallback;
}

// A campaign in SENDING status is being worked through in the background;
// poll its detail every ~3s while the tab is visible so progress (counts,
// eventual SENT/FAILED) shows up without a manual refresh.
const SENDING_POLL_MS = 3000;

// ── Campaigns ────────────────────────────────────────────────────────────

export const CAMPAIGNS_KEY = 'campaigns';
export const CAMPAIGN_CONFIG_KEY = 'campaigns-config';
export const CAMPAIGN_DELIVERIES_KEY = 'campaign-deliveries';
export const CAMPAIGN_PREVIEW_KEY = 'campaign-preview';
export const GROUPS_KEY = 'message-groups';
export const GROUP_CANDIDATES_KEY = 'message-group-candidates';
export const CLASSES_META_KEY = 'campaigns-classes-meta';
export const SECTIONS_META_KEY = 'campaigns-sections-meta';

export function useCampaignConfig() {
  return useQuery({
    queryKey: [CAMPAIGN_CONFIG_KEY],
    queryFn: async (): Promise<CampaignConfig> => (await apiClient.get('/campaigns/config')).data.data,
    staleTime: 5 * 60 * 1000,
  });
}

export interface CampaignListParams {
  page: number;
  pageSize: number;
  status?: CampaignStatus | '';
  channel?: CampaignChannel | '';
  search?: string;
}

export function useCampaigns(params: CampaignListParams) {
  return useQuery({
    queryKey: [CAMPAIGNS_KEY, params],
    queryFn: async (): Promise<{ campaigns: Campaign[]; total: number }> => {
      const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) });
      if (params.status) query.append('status', params.status);
      if (params.channel) query.append('channel', params.channel);
      if (params.search) query.append('search', params.search);
      const res = await apiClient.get(`/campaigns?${query.toString()}`);
      return { campaigns: res.data.data || [], total: res.data.meta?.total ?? 0 };
    },
  });
}

export function useCampaign(id: string | undefined, opts?: { poll?: boolean }) {
  return useQuery({
    queryKey: [CAMPAIGNS_KEY, id],
    queryFn: async (): Promise<CampaignDetail> => (await apiClient.get(`/campaigns/${id}`)).data.data,
    enabled: !!id,
    refetchInterval: (query) =>
      opts?.poll &&
      query.state.data?.status === 'SENDING' &&
      typeof document !== 'undefined' &&
      document.visibilityState === 'visible'
        ? SENDING_POLL_MS
        : false,
  });
}

export interface DeliveryListParams {
  page: number;
  pageSize: number;
  status?: DeliveryStatus | '';
}

export function useCampaignDeliveries(campaignId: string | undefined, params: DeliveryListParams) {
  return useQuery({
    queryKey: [CAMPAIGN_DELIVERIES_KEY, campaignId, params],
    queryFn: async (): Promise<{ deliveries: Delivery[]; total: number }> => {
      const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) });
      if (params.status) query.append('status', params.status);
      const res = await apiClient.get(`/campaigns/${campaignId}/deliveries?${query.toString()}`);
      return { deliveries: res.data.data || [], total: res.data.meta?.total ?? 0 };
    },
    enabled: !!campaignId,
  });
}

export interface CampaignFormPayload {
  channel: CampaignChannel;
  subject?: string | null;
  body: string;
  audience: Audience;
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CampaignFormPayload): Promise<Campaign & { demo: boolean }> =>
      (await apiClient.post('/campaigns', dto)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CAMPAIGNS_KEY] });
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to save the campaign draft.')),
  });
}

export function useUpdateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CampaignFormPayload> }): Promise<CampaignDetail> =>
      (await apiClient.put(`/campaigns/${id}`, data)).data.data,
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: [CAMPAIGNS_KEY] });
      qc.invalidateQueries({ queryKey: [CAMPAIGNS_KEY, id] });
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to update the campaign.')),
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/campaigns/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CAMPAIGNS_KEY] });
      toast.success('Campaign deleted.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to delete the campaign.')),
  });
}

export function useSendCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      scheduledAt,
    }: {
      id: string;
      scheduledAt?: string | null;
    }): Promise<{ result: { campaign: CampaignDetail; demo: boolean; scheduled: boolean }; message: string }> => {
      const res = await apiClient.post(`/campaigns/${id}/send`, { scheduledAt: scheduledAt ?? null });
      return { result: res.data.data, message: res.data.message };
    },
    onSuccess: ({ message }) => {
      qc.invalidateQueries({ queryKey: [CAMPAIGNS_KEY] });
      toast.success(message || 'Campaign is sending.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to send the campaign.')),
  });
}

export function useCancelCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<CampaignDetail> =>
      apiClient.post(`/campaigns/${id}/cancel`).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CAMPAIGNS_KEY] });
      toast.success('Campaign cancelled.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to cancel the campaign.')),
  });
}

export interface PreviewParams {
  channel: CampaignChannel;
  audience: Audience;
  body?: string;
}

/** Live recipient-count preview. Callers should debounce the `params` they pass in. */
export function usePreviewAudience(params: PreviewParams, enabled: boolean) {
  return useQuery({
    queryKey: [CAMPAIGN_PREVIEW_KEY, params],
    queryFn: async (): Promise<PreviewResult> => (await apiClient.post('/campaigns/preview', params)).data.data,
    enabled,
    placeholderData: (prev) => prev,
  });
}

// ── Classes / sections meta (staff-only read endpoints) ────────────────────

export function useClassesMeta() {
  return useQuery({
    queryKey: [CLASSES_META_KEY],
    queryFn: async (): Promise<ClassMeta[]> => (await apiClient.get('/students/meta/classes')).data.data || [],
  });
}

export function useSectionsMeta(classId: string | undefined) {
  return useQuery({
    queryKey: [SECTIONS_META_KEY, classId],
    queryFn: async (): Promise<SectionMeta[]> =>
      (await apiClient.get(`/students/meta/sections?classId=${classId}`)).data.data || [],
    enabled: !!classId,
  });
}

// ── Message groups ──────────────────────────────────────────────────────────

export interface GroupListParams {
  page: number;
  pageSize: number;
  search?: string;
}

export function useGroups(params: GroupListParams) {
  return useQuery({
    queryKey: [GROUPS_KEY, params],
    queryFn: async (): Promise<{ groups: MessageGroup[]; total: number }> => {
      const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) });
      if (params.search) query.append('search', params.search);
      const res = await apiClient.get(`/message-groups?${query.toString()}`);
      return { groups: res.data.data || [], total: res.data.meta?.total ?? 0 };
    },
  });
}

export function useGroup(id: string | undefined) {
  return useQuery({
    queryKey: [GROUPS_KEY, id],
    queryFn: async (): Promise<MessageGroupDetail> => (await apiClient.get(`/message-groups/${id}`)).data.data,
    enabled: !!id,
  });
}

export interface GroupFormPayload {
  name: string;
  description?: string | null;
  memberUserIds?: string[];
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: GroupFormPayload) => apiClient.post('/message-groups', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [GROUPS_KEY] });
      toast.success('Group created.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to create the group.')),
  });
}

export function useUpdateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; description?: string | null } }) =>
      apiClient.put(`/message-groups/${id}`, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: [GROUPS_KEY] });
      qc.invalidateQueries({ queryKey: [GROUPS_KEY, id] });
      toast.success('Group updated.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to update the group.')),
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/message-groups/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [GROUPS_KEY] });
      toast.success('Group deleted.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to delete the group.')),
  });
}

export function useAddGroupMembers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userIds }: { id: string; userIds: string[] }) =>
      apiClient.post(`/message-groups/${id}/members`, { userIds }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: [GROUPS_KEY] });
      qc.invalidateQueries({ queryKey: [GROUPS_KEY, id] });
      toast.success('Members added.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to add members.')),
  });
}

export function useRemoveGroupMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      apiClient.delete(`/message-groups/${id}/members/${userId}`),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: [GROUPS_KEY] });
      qc.invalidateQueries({ queryKey: [GROUPS_KEY, id] });
      toast.success('Member removed.');
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Failed to remove member.')),
  });
}

export interface CandidateListParams {
  search?: string;
  role?: string;
  classId?: string;
  sectionId?: string;
  page: number;
  pageSize: number;
}

export function useMemberCandidates(params: CandidateListParams, enabled = true) {
  return useQuery({
    queryKey: [GROUP_CANDIDATES_KEY, params],
    queryFn: async (): Promise<{ candidates: GroupMemberUser[]; total: number }> => {
      const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) });
      if (params.search) query.append('search', params.search);
      if (params.role) query.append('role', params.role);
      if (params.classId) query.append('classId', params.classId);
      if (params.sectionId) query.append('sectionId', params.sectionId);
      const res = await apiClient.get(`/message-groups/candidates?${query.toString()}`);
      return { candidates: res.data.data || [], total: res.data.meta?.total ?? 0 };
    },
    enabled,
    placeholderData: (prev) => prev,
  });
}
