import axios from 'axios';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Idempotent methods only — safe to silently replay because either the
// request never reached the server (true network failure) or replaying it
// twice has no extra effect. POST is deliberately excluded so a slow-but-
// successful create/register call is never fired twice.
const IDEMPOTENT_RETRY_METHODS = ['get', 'put', 'patch', 'delete'];
const COLD_START_MAX_RETRIES = 2;
const COLD_START_RETRY_DELAY_MS = 5000;
const COLD_START_TOAST_ID = 'cold-start-retry';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The hosted backend (Render free tier) spins down when idle and can take
// 30-60s to wake up. A request sent while it's asleep never gets a response,
// so the browser reports it as a CORS/network error (no Access-Control-Allow-
// Origin header — because there was no response at all) even though the
// origin is correctly allow-listed. Retrying with a short backoff resolves it
// automatically instead of the user needing to hit save 2-3 times or refresh.
function isColdStartError(error: any): boolean {
  return !error.response && (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK' || error.message === 'Network Error');
}

// Request interceptor: attach auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Response interceptor: handle auth errors & token refresh
apiClient.interceptors.response.use(
  (response) => {
    toast.dismiss(COLD_START_TOAST_ID);
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    if (
      originalRequest &&
      isColdStartError(error) &&
      IDEMPOTENT_RETRY_METHODS.includes((originalRequest.method || '').toLowerCase())
    ) {
      const attempt = (originalRequest._coldStartRetryCount || 0) + 1;
      if (attempt <= COLD_START_MAX_RETRIES) {
        originalRequest._coldStartRetryCount = attempt;
        toast.loading('Server is waking up, retrying…', { id: COLD_START_TOAST_ID });
        await wait(COLD_START_RETRY_DELAY_MS * attempt);
        return apiClient(originalRequest);
      }
      toast.dismiss(COLD_START_TOAST_ID);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      // Avoid infinite loop if auth/refresh itself fails or it is a login request
      const url = originalRequest.url || '';
      if (url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('auth/login') || url.includes('auth/refresh')) {
        useAuthStore.getState().clearAuth();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      originalRequest._retry = true;
      const currentRefreshToken = useAuthStore.getState().refreshToken;

      if (!currentRefreshToken) {
        useAuthStore.getState().clearAuth();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      isRefreshing = true;

      try {
        const response = await axios.post(`${apiClient.defaults.baseURL || '/api/v1'}/auth/refresh`, {
          refreshToken: currentRefreshToken,
        });

        const { accessToken, refreshToken: newRefreshToken } = response.data.data;
        useAuthStore.getState().updateToken(accessToken, newRefreshToken);

        isRefreshing = false;
        processQueue(null, accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        processQueue(refreshError, null);
        useAuthStore.getState().clearAuth();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    if (error.response?.status === 403) {
      toast.error('Access denied. You do not have permission to perform this action.');
    } else if (error.response?.status === 500) {
      toast.error('Server error. Please try again later.');
    } else if (isColdStartError(error)) {
      // Non-idempotent methods (POST) are never auto-retried, so surface a
      // clear explanation instead of a confusing generic network error.
      toast.error('The server is waking up from idle — please wait a few seconds and try again.');
    }

    return Promise.reject(error);
  }
);

export default apiClient;
