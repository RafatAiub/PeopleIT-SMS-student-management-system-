import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

export const REMEMBER_ME_KEY = 'sms_remember_me';

// Routes reads/writes to localStorage (survives browser restarts) when the
// user ticked "Remember me" on login, sessionStorage (cleared on tab close)
// otherwise. The flag itself always lives in localStorage so it can be read
// before the store rehydrates.
const rememberAwareStorage: StateStorage = {
  getItem: (name) => {
    const store = localStorage.getItem(REMEMBER_ME_KEY) === '1' ? localStorage : sessionStorage;
    return store.getItem(name);
  },
  setItem: (name, value) => {
    const store = localStorage.getItem(REMEMBER_ME_KEY) === '1' ? localStorage : sessionStorage;
    store.setItem(name, value);
  },
  removeItem: (name) => {
    localStorage.removeItem(name);
    sessionStorage.removeItem(name);
  },
};

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'TEACHER' | 'ACCOUNTANT' | 'LIBRARIAN' | 'TRANSPORT_OFFICER' | 'GUARDIAN' | 'STUDENT' | 'MANAGEMENT';
  institutionId: string;
  institutionName?: string;
  avatarUrl?: string;
}

export interface SupportSessionInfo {
  isSupportSession: boolean;
  isReadOnly: boolean;
  originalToken: string;
  originalRefreshToken: string | null;
  originalUser: User;
  targetUser: User;
  institution: { id: string; name: string; slug: string };
  expiresAt: number;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  supportSession: SupportSessionInfo | null;
  setHasHydrated: (value: boolean) => void;
  setAuth: (user: User, token: string, refreshToken: string) => void;
  clearAuth: () => void;
  updateToken: (token: string, refreshToken?: string) => void;
  startSupportSession: (data: {
    accessToken: string;
    isReadOnly: boolean;
    expiresInSeconds: number;
    targetUser: User;
    institution: { id: string; name: string; slug: string };
  }) => void;
  exitSupportSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      hasHydrated: false,
      supportSession: null,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      setAuth: (user, token, refreshToken) =>
        set({ user, accessToken: token, refreshToken, isAuthenticated: true, supportSession: null }),
      clearAuth: () => {
        localStorage.removeItem(REMEMBER_ME_KEY);
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, supportSession: null });
      },
      updateToken: (token, refreshToken) => set((state) => ({
        accessToken: token,
        refreshToken: refreshToken || state.refreshToken
      })),
      startSupportSession: ({ accessToken, isReadOnly, expiresInSeconds, targetUser, institution }) => {
        const state = get();
        if (!state.user || !state.accessToken) return;

        const supportSession: SupportSessionInfo = {
          isSupportSession: true,
          isReadOnly,
          originalToken: state.accessToken,
          originalRefreshToken: state.refreshToken,
          originalUser: state.user,
          targetUser,
          institution,
          expiresAt: Date.now() + expiresInSeconds * 1000,
        };

        set({
          supportSession,
          accessToken,
          user: {
            ...targetUser,
            institutionId: institution.id,
            institutionName: institution.name,
          },
        });
      },
      exitSupportSession: () => {
        const state = get();
        if (!state.supportSession) return;

        set({
          user: state.supportSession.originalUser,
          accessToken: state.supportSession.originalToken,
          refreshToken: state.supportSession.originalRefreshToken,
          supportSession: null,
        });
      },
    }),
    {
      name: 'sms-auth-storage',
      storage: createJSONStorage(() => rememberAwareStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        supportSession: state.supportSession,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

