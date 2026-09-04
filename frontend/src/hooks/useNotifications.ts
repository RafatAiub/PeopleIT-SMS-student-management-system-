import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, type NotificationListParams } from '@/api/notifications.api';
import { useAuthStore } from '@/store/authStore';

// Query keys are scoped by user id: notifications are per-recipient, so a
// different login must never read the previous user's cached inbox.
export const notificationKeys = {
  all: (userId: string) => ['notifications', userId] as const,
  list: (userId: string, params: NotificationListParams) =>
    ['notifications', userId, 'list', params] as const,
};

export function useNotifications(params: NotificationListParams = { page: 1, pageSize: 20 }) {
  const userId = useAuthStore((s) => s.user?.id);

  return useQuery({
    queryKey: notificationKeys.list(userId ?? 'anonymous', params),
    queryFn: () => notificationsApi.list(params),
    enabled: !!userId,
    staleTime: 30_000,
    // The bell should reflect new activity without a page reload; 60s is a
    // deliberate compromise against the Render free tier waking on every poll.
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all(userId ?? 'anonymous') });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all(userId ?? 'anonymous') });
    },
  });
}
