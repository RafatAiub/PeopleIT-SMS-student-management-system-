import apiClient from './client';

export const NOTIFICATION_TYPES = [
  'INVOICE_ISSUED',
  'PAYMENT_RECEIVED',
  'FEE_REMINDER',
  'ABSENCE_ALERT',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface AppNotification {
  id: string;
  type: NotificationType | string;
  title: string;
  body: string;
  /** Deep-link payload written by the server, e.g. { link: '/fees' }. */
  data?: { link?: string; [key: string]: unknown } | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResult {
  notifications: AppNotification[];
  total: number;
  unreadCount: number;
}

export interface NotificationListParams {
  unreadOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export const notificationsApi = {
  list: async (params: NotificationListParams = {}): Promise<NotificationListResult> => {
    const { data } = await apiClient.get('/notifications', { params });
    return {
      notifications: data.data ?? [],
      total: data.meta?.total ?? 0,
      // `unreadCount` is sent alongside `data`/`meta` by paginatedResponse's
      // `extra` argument, so it survives pagination (it counts ALL unread, not
      // just the unread on the current page).
      unreadCount: data.unreadCount ?? 0,
    };
  },

  markRead: async (id: string): Promise<void> => {
    await apiClient.post(`/notifications/${id}/read`);
  },

  markAllRead: async (): Promise<void> => {
    await apiClient.post('/notifications/read-all');
  },
};
