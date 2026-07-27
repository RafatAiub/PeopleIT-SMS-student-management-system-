import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  createdAt: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';

interface UiState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (val: boolean) => void;
  mobileMenuOpen: boolean;
  toggleMobileMenu: () => void;
  setMobileMenuOpen: (val: boolean) => void;
  institutionLogo: string | null;
  institutionName: string | null;
  setInstitutionBranding: (logo: string | null, name?: string | null) => void;
  notifications: Notification[];
  addNotification: (n: Omit<Notification, 'id' | 'read' | 'createdAt'>) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (val) => set({ sidebarCollapsed: val }),
      mobileMenuOpen: false,
      toggleMobileMenu: () =>
        set((state) => ({ mobileMenuOpen: !state.mobileMenuOpen })),
      setMobileMenuOpen: (val) => set({ mobileMenuOpen: val }),
      institutionLogo: null,
      institutionName: null,
      setInstitutionBranding: (logo, name) =>
        set((state) => ({
          institutionLogo: logo !== undefined ? logo : state.institutionLogo,
          institutionName: name !== undefined ? name : state.institutionName,
        })),
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
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        institutionLogo: state.institutionLogo,
        institutionName: state.institutionName,
      }),
    }
  )
);
