import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/api/auth.api';
import toast from 'react-hot-toast';

export function useAuth() {
  const { user, isAuthenticated, setAuth, clearAuth } = useAuthStore();

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: ({ user: u, accessToken, refreshToken }) => {
      setAuth(u, accessToken, refreshToken);
      toast.success(`স্বাগতম, ${u.firstName}!`);
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Invalid email or password. Please try again.';
      toast.error(message);
    },
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
    logout: logoutMutation,
  };
}
