// React Query helpers for the Wave C transport extras (stops, live positions,
// route report, fee billing). Contract: backend/src/modules/transport/transport.routes.ts.
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../api/client';

export interface TransportStop {
  id: string;
  routeId: string;
  name: string;
  sequence: number;
  pickupTime: string | null;
  dropTime: string | null;
  lat: number | null;
  lng: number | null;
  _count?: { assignments: number };
}

export interface LivePosition {
  id: string;
  registrationNumber: string;
  driverName: string;
  isActive: boolean;
  lastLat: number | null;
  lastLng: number | null;
  lastLocationAt: string | null;
  hasLocation: boolean;
}

export const TRANSPORT_KEY = 'transport-extras';

export function useRouteStops(routeId: string | null | undefined) {
  return useQuery({
    queryKey: [TRANSPORT_KEY, 'stops', routeId],
    queryFn: async (): Promise<TransportStop[]> => (await apiClient.get(`/transport/routes/${routeId}/stops`)).data.data,
    enabled: !!routeId,
  });
}

export function useLivePositions() {
  return useQuery({
    queryKey: [TRANSPORT_KEY, 'live'],
    queryFn: async (): Promise<{ vehicles: LivePosition[]; generatedAt: string }> => (await apiClient.get('/transport/vehicles/live')).data.data,
    refetchInterval: 60_000,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const errMsg = (e: any, fallback: string): string => e?.response?.data?.message || fallback;
