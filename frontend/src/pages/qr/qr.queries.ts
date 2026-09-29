import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';

export interface QrTokenItem {
  type: 'STUDENT' | 'STAFF';
  id: string;
  name: string;
  code: string | null;
  subtitle: string;
  token: string;
  qrDataUrl: string | null;
}

export interface QrPerson {
  type: 'STUDENT' | 'STAFF';
  id: string;
  name: string;
  code: string | null;
  subtitle: string;
  avatarUrl: string | null;
}

export type ScanResult =
  | { duplicate: true; person: QrPerson; lastScannedAt: string; day: string; time: string }
  | {
      duplicate: false;
      person: QrPerson;
      action: 'MARKED' | 'ALREADY_MARKED' | 'CHECKED_IN' | 'CHECKED_OUT';
      status: string | null;
      day: string;
      time: string;
      cutoff: string;
    };

export interface CheckInRow {
  id: string;
  scannedAt: string;
  method: string;
  deviceInfo: string | null;
  type: 'STUDENT' | 'STAFF';
  name: string;
  subtitle: string;
}

const KEY = 'qr';

export function useQrTokens(p: { type: 'STUDENT' | 'STAFF'; className?: string; sectionName?: string; search?: string; page: number; pageSize: number }) {
  return useQuery({
    queryKey: [KEY, 'tokens', p],
    queryFn: async (): Promise<{ items: QrTokenItem[]; meta: { total: number; page: number; pageSize: number } }> =>
      (await apiClient.get('/qr/tokens', { params: p })).data.data,
    enabled: p.type === 'STAFF' || !!p.className,
  });
}

export function useMyQrToken() {
  return useQuery({
    queryKey: [KEY, 'mine'],
    queryFn: async (): Promise<{ type: 'STUDENT' | 'STAFF'; token: string; qrDataUrl: string | null }> =>
      (await apiClient.get('/qr/my-token')).data.data,
    staleTime: Infinity,
  });
}

export function useQrScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: { code: string; cutoffTime?: string; deviceInfo?: string }): Promise<ScanResult> =>
      (await apiClient.post('/qr/scan', dto)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, 'check-ins'] }),
  });
}

export function useCheckIns(date: string) {
  return useQuery({
    queryKey: [KEY, 'check-ins', date],
    queryFn: async (): Promise<{ items: CheckInRow[]; meta: { total: number } }> =>
      (await apiClient.get('/qr/check-ins', { params: { date, page: 1, pageSize: 50 } })).data.data,
    refetchInterval: 30_000,
  });
}
