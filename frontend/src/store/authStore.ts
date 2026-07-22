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

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  setAuth: (user: User, token: string, refreshToken: string) => void;
  clearAuth: () => void;
  updateToken: (token: string, refreshToken?: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      setAuth: (user, token, refreshToken) =>
        set({ user, accessToken: token, refreshToken, isAuthenticated: true }),
      clearAuth: () => {
        localStorage.removeItem(REMEMBER_ME_KEY);
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },
      updateToken: (token, refreshToken) => set((state) => ({
        accessToken: token,
        refreshToken: refreshToken || state.refreshToken
      })),
    }),
    {
      name: 'sms-auth-storage',
      storage: createJSONStorage(() => rememberAwareStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
