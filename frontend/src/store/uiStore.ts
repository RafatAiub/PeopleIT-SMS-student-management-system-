import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
