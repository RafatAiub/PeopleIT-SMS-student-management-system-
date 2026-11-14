import axios from 'axios';
import { useAuthStore } from '@/store/authStore';
import { selectedBranchFor } from '@/store/branchStore';
import toast from 'react-hot-toast';
import { translate } from '@/i18n';

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

/** P0: 402 body `code` sent by the server when a school's subscription has expired. */
export const SUBSCRIPTION_INACTIVE_CODE = 'SUBSCRIPTION_INACTIVE';
/** Window event fired on such a 402 — SubscriptionInactiveNotice listens for it. */
export const SUBSCRIPTION_INACTIVE_EVENT = 'peoplenit:subscription-inactive';
/** P1: 402 `code` when the school is DISABLED (only billing + sign-in work). */
export const ACCOUNT_DISABLED_CODE = 'ACCOUNT_DISABLED';
/** Window event fired on such a 402 — the platform-billing status refetches and the app shows the disabled screen. */
export const ACCOUNT_DISABLED_EVENT = 'peoplenit:account-disabled';
/** P4: 403 `code` when a student/guardian feature is blocked for unpaid fees. */
export const FEE_RESTRICTED_CODE = 'FEE_RESTRICTED';
/** Window event fired on such a 403 — FeeRestrictedNotice shows the "Fees due" screen. */
export const FEE_RESTRICTED_EVENT = 'peoplenit:fee-restricted';

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
    // Header branch switcher (admins only). Sent only when a branch is
    // selected for the current institution; endpoints that don't opt in ignore it.
    const auth = useAuthStore.getState();
    const branchId =
      auth.user && (auth.user.role === 'ADMIN' || auth.user.role === 'SUPER_ADMIN')
        ? selectedBranchFor(auth.user.institutionId)
        : null;
    if (branchId && !config.headers['X-Branch-Id']) {
      config.headers['X-Branch-Id'] = branchId;
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
      // If in Support Access Mode and session token expires, exit support mode cleanly without corrupting state
      if (useAuthStore.getState().supportSession) {
        toast.error('Support access session expired. Returning to Super Admin view.');
        useAuthStore.getState().exitSupportSession();
        if (window.location.pathname !== '/') {
          window.location.href = '/';
        }
        return Promise.reject(error);
      }

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

    // P0: the school's subscription expired — the server made it read-only.
    // Show the persistent banner (SubscriptionInactiveNotice) and a toast.
    // P1: the school is disabled — refetch the billing status so the app
    // routes every role to the "account disabled" screen (no toast spam).
    if (error.response?.status === 402 && error.response?.data?.code === ACCOUNT_DISABLED_CODE) {
      window.dispatchEvent(new CustomEvent(ACCOUNT_DISABLED_EVENT));
      return Promise.reject(error);
    }

    if (error.response?.status === 402 && error.response?.data?.code === SUBSCRIPTION_INACTIVE_CODE) {
      const role = useAuthStore.getState().user?.role;
      const isFamily = role === 'STUDENT' || role === 'GUARDIAN';
      window.dispatchEvent(new CustomEvent(SUBSCRIPTION_INACTIVE_EVENT));
      toast.error(
        translate(
          isFamily
            ? 'School account inactive — please contact the school.'
            : error.response?.data?.reason === 'PLATFORM_BILLING'
              ? 'Payment overdue — pay now. The account is read-only until the bill is paid.'
              : 'Subscription expired — pay to continue. The account is read-only until it is renewed.',
        ),
        { id: 'api-402' },
      );
      return Promise.reject(error);
    }

    // P4: fees due — the school restricted this student/guardian feature.
    // The header also marks blob downloads (report card / ID card PDF).
    if (error.response?.status === 403 && (error.response?.headers?.['x-fee-restricted'] || error.response?.data?.code === FEE_RESTRICTED_CODE || error.response?.data?.errors?.code === FEE_RESTRICTED_CODE)) {
      const body = error.response?.data && typeof error.response.data === 'object' && !(error.response.data instanceof Blob) ? error.response.data : null;
      if (body?.errors?.feature === 'PORTAL_LOGIN') {
        // Sign-in refused (login page has no layout to show the screen).
        const phone = body?.errors?.contact?.phone;
        toast.error(`${translate('Fees due — contact the school office')}${phone ? ` (${phone})` : ''}`, { id: 'fee-restricted', duration: 8000 });
      } else {
        window.dispatchEvent(new CustomEvent(FEE_RESTRICTED_EVENT, { detail: body }));
      }
      return Promise.reject(error);
    }

    if (error.response?.status === 403) {
      toast.error('Access denied. You do not have permission to perform this action.', { id: 'api-403' });
    } else if (error.response?.status === 500) {
      toast.error('Server error. Please try again later.', { id: 'api-500' });
    } else if (isColdStartError(error)) {
      // Non-idempotent methods (POST) are never auto-retried, so surface a
      // clear explanation instead of a confusing generic network error.
      toast.error('The server is waking up from idle — please wait a few seconds and try again.', { id: 'api-cold-start' });
    }

    return Promise.reject(error);
  }
);

export default apiClient;
