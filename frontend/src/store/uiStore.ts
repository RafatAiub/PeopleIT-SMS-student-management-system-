import { create } from 'zustand';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  createdAt: string;
}

interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (val: boolean) => void;
  notifications: Notification[];
  addNotification: (n: Omit<Notification, 'id' | 'read' | 'createdAt'>) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (val) => set({ sidebarCollapsed: val }),
  notifications: [
    {
      id: '1',
      title: 'New Admission',
      message: 'Mohammad Rahim has been admitted to Class 8-A',
      type: 'success',
      read: false,
      createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    },
    {
      id: '2',
      title: 'Fee Overdue',
      message: '23 students have overdue fees for June 2026',
      type: 'warning',
      read: false,
      createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    },
    {
      id: '3',
      title: 'Attendance Alert',
      message: 'Class 10-B attendance below 75% threshold',
      type: 'error',
      read: true,
      createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    },
  ],
  addNotification: (n) =>
    set((state) => ({
      notifications: [
        {
          ...n,
          id: Date.now().toString(),
          read: false,
          createdAt: new Date().toISOString(),
        },
        ...state.notifications,
      ],
    })),
  markNotificationRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    })),
  clearNotifications: () => set({ notifications: [] }),
}));
