import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';
import type { Conversation, Message } from './messages.types';

export const CONVERSATIONS_KEY = 'messages-conversations';
export const HISTORY_KEY = 'messages-history';

// No realtime channel exists yet, so the thread and conversation list are
// kept fresh by polling. `refetchInterval` is gated on `document.visibilityState`
// so a background tab never spends the user's data/battery re-fetching, and
// React Query itself also pauses refetching while the window is unfocused.
const THREAD_POLL_MS = 15000;
const LIST_POLL_MS = 30000;

function visibleInterval(ms: number) {
  return () => (typeof document !== 'undefined' && document.visibilityState === 'visible' ? ms : false);
}

export function useConversations() {
  return useQuery({
    queryKey: [CONVERSATIONS_KEY],
    queryFn: async (): Promise<Conversation[]> => {
      const res = await apiClient.get('/messages/conversations');
      return res.data.data || [];
    },
    refetchInterval: visibleInterval(LIST_POLL_MS),
  });
}

export function useConversationHistory(otherUserId: string | null) {
  return useQuery({
    queryKey: [HISTORY_KEY, otherUserId],
    queryFn: async (): Promise<Message[]> => {
      const res = await apiClient.get(`/messages/history/${otherUserId}`);
      return res.data.data || [];
    },
    enabled: !!otherUserId,
    refetchInterval: visibleInterval(THREAD_POLL_MS),
  });
}

export interface SendMessagePayload {
  receiverId: string;
  content: string;
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SendMessagePayload) => apiClient.post('/messages', payload),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: [HISTORY_KEY, vars.receiverId] });
      qc.invalidateQueries({ queryKey: [CONVERSATIONS_KEY] });
    },
  });
}

export interface UserSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  role: string;
}

export function useUserSearch(query: string, excludeUserId?: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['user-search', trimmed],
    queryFn: async (): Promise<UserSearchResult[]> => {
      const res = await apiClient.get('/users/search', { params: { q: trimmed } });
      const results: UserSearchResult[] = res.data.data || [];
      return excludeUserId ? results.filter((u) => u.id !== excludeUserId) : results;
    },
    enabled: trimmed.length >= 2,
  });
}
