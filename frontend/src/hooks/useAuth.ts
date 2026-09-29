import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { authApi, isTwoFactorChallenge, type LoginResponse } from '@/api/auth.api';
import toast from 'react-hot-toast';

export function useAuth() {
  const { user, isAuthenticated, setAuth, clearAuth } = useAuthStore();

  /** Shared by both login steps — a verified 2FA code finishes the same way. */
  const completeLogin = ({ user: u, accessToken, refreshToken }: LoginResponse) => {
    setAuth(u, accessToken, refreshToken);
    toast.success(`স্বাগতম, ${u.firstName}!`);
  };

  // No `response` means the request never reached the server (network
  // error / cold-start) — apiClient's interceptor already shows a toast
  // explaining that. Falling back to "Invalid email or password" here
  // would be actively wrong: credentials were never even checked.
  const reportError = (fallback: string) => (error: any) => {
    if (!error?.response) return;
    toast.error(error.response.data?.message || fallback);
  };

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (result) => {
      // A 2FA challenge is a successful password step, not a session. Login.tsx
      // reads it off the mutation result and switches to the code screen; there
      // is nothing to store and nothing to celebrate yet.
      if (isTwoFactorChallenge(result)) return;
      completeLogin(result);
    },
    onError: reportError('Invalid credentials. Please try again.'),
  });

  const verifyTwoFactorMutation = useMutation({
    mutationFn: authApi.verifyTwoFactor,
    onSuccess: completeLogin,
    onError: reportError('That code is not valid. Please try again.'),
  });

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      clearAuth();
      toast.success('Logged out successfully.');
    },
    onError: () => {
      // Still clear auth even if logout API fails
      clearAuth();
    },
  });

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isTeacher = user?.role === 'TEACHER';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  return {
    user,
    isAuthenticated,
    isAdmin,
    isTeacher,
    isSuperAdmin,
    login: loginMutation,
    verifyTwoFactor: verifyTwoFactorMutation,
    logout: logoutMutation,
  };
}
