import apiClient from './client';
import { useAuthStore, type User } from '@/store/authStore';

interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

interface RefreshResponse {
  accessToken: string;
}

export const authApi = {
  login: async (credentials: { email: string; password: string; institutionCode: string }): Promise<LoginResponse> => {
    const { data } = await apiClient.post<any>('/auth/login', credentials);
    const payload = data.data;
    return {
      user: payload.user,
      accessToken: payload.tokens.accessToken,
      refreshToken: payload.tokens.refreshToken,
    };
  },

  refreshToken: async (token: string): Promise<RefreshResponse> => {
    const { data } = await apiClient.post<any>('/auth/refresh', { refreshToken: token });
    return data.data;
  },

  logout: async (): Promise<void> => {
    const refreshToken = useAuthStore.getState().refreshToken;
    if (refreshToken) {
      await apiClient.post('/auth/logout', { refreshToken });
    }
  },

  me: async (): Promise<User> => {
    const { data } = await apiClient.get<any>('/auth/me');
    return data.data;
  },
};
