import apiClient from './client';
import { useAuthStore, type User } from '@/store/authStore';

export interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

/**
 * Returned instead of a session when the account has two-step verification on.
 * Carries no credentials — `challengeToken` is only good for verifyTwoFactor.
 */
export interface TwoFactorChallenge {
  requires2FA: true;
  method: 'EMAIL' | 'TOTP';
  challengeToken: string;
  expiresInSeconds: number;
  /** Masked address, present for the EMAIL method only. */
  sentTo?: string;
}

export type LoginResult = ({ requires2FA?: false } & LoginResponse) | TwoFactorChallenge;

export function isTwoFactorChallenge(result: LoginResult): result is TwoFactorChallenge {
  return 'requires2FA' in result && result.requires2FA === true;
}

interface RefreshResponse {
  accessToken: string;
}

export interface TwoFactorStatus {
  enabled: boolean;
  method: 'EMAIL' | 'TOTP' | null;
  pendingSetup: boolean;
  backupCodesRemaining: number;
}

export interface TotpSetup {
  qrCodeDataUrl: string;
  manualEntryKey: string;
  otpauthUri: string;
}

export interface RegisterPayload {
  institutionCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  role: 'STUDENT' | 'GUARDIAN' | 'TEACHER';
}

/** Shapes a completed login out of the API envelope. */
function toLoginResponse(payload: any): LoginResponse {
  return {
    user: payload.user,
    accessToken: payload.tokens.accessToken,
    refreshToken: payload.tokens.refreshToken,
  };
}

export const authApi = {
  /**
   * Step one. `identifier` is an email address or a BD mobile number — the
   * backend decides which. Resolves to either a session or a 2FA challenge, so
   * callers must check `isTwoFactorChallenge` before using the result.
   */
  login: async (credentials: {
    identifier: string;
    password: string;
    institutionCode?: string;
  }): Promise<LoginResult> => {
    const { data } = await apiClient.post<any>('/auth/login', credentials);
    const payload = data.data;

    if (payload?.requires2FA) return payload as TwoFactorChallenge;
    return toLoginResponse(payload);
  },

  /** Step two — emailed code, authenticator code, or a backup code. */
  verifyTwoFactor: async (input: {
    challengeToken: string;
    code: string;
  }): Promise<LoginResponse> => {
    const { data } = await apiClient.post<any>('/auth/login/verify-2fa', input);
    return toLoginResponse(data.data);
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

  // ── Registration & verification ────────────────────────────────────────────

  register: async (payload: RegisterPayload): Promise<{ message: string; requiresApproval: boolean }> => {
    const { data } = await apiClient.post<any>('/auth/register', payload);
    return data.data;
  },

  verifyEmail: async (token: string): Promise<{ message: string; pendingApproval: boolean }> => {
    const { data } = await apiClient.post<any>('/auth/verify-email', { token });
    return data.data;
  },

  resendVerification: async (email: string): Promise<{ message: string }> => {
    const { data } = await apiClient.post<any>('/auth/resend-verification', { email });
    return data.data;
  },

  forgotPassword: async (identifier: string): Promise<{ message: string }> => {
    const { data } = await apiClient.post<any>('/auth/forgot-password', { identifier });
    return data.data;
  },

  resetPassword: async (input: { token: string; password: string }): Promise<{ message: string }> => {
    const { data } = await apiClient.post<any>('/auth/reset-password', input);
    return data.data;
  },

  // ── Two-step verification management (Settings → Security) ────────────────

  getTwoFactorStatus: async (): Promise<TwoFactorStatus> => {
    const { data } = await apiClient.get<any>('/auth/2fa');
    return data.data;
  },

  beginTotpSetup: async (): Promise<TotpSetup> => {
    const { data } = await apiClient.post<any>('/auth/2fa/totp/setup');
    return data.data;
  },

  confirmTotpSetup: async (code: string): Promise<{ backupCodes: string[]; method: 'TOTP' }> => {
    const { data } = await apiClient.post<any>('/auth/2fa/totp/confirm', { code });
    return data.data;
  },

  enableEmailTwoFactor: async (): Promise<{ backupCodes: string[]; method: 'EMAIL' }> => {
    const { data } = await apiClient.post<any>('/auth/2fa/email/enable');
    return data.data;
  },

  disableTwoFactor: async (password: string): Promise<{ message: string }> => {
    const { data } = await apiClient.post<any>('/auth/2fa/disable', { password });
    return data.data;
  },

  regenerateBackupCodes: async (password: string): Promise<{ backupCodes: string[] }> => {
    const { data } = await apiClient.post<any>('/auth/2fa/backup-codes', { password });
    return data.data;
  },
};
