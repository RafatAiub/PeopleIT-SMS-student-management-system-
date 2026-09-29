// React Query hooks for Inventory & Assets.
// Contract: backend/src/modules/inventory (inventory.routes.ts), mounted at
// /api/v1/inventory. Lists return { items, meta: { total, page, pageSize } }.
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import apiClient from '../../api/client';

export type AssetStatus = 'AVAILABLE' | 'ALLOCATED' | 'MAINTENANCE' | 'RETIRED' | 'LOST';
export type AssetCondition = 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED';
export type MaintenanceStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type MovementType = 'IN' | 'OUT' | 'ADJUST';

export interface Paged<T> {
  items: T[];
  meta: { total: number; page: number; pageSize: number };
}

export interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  role?: string;
  email?: string;
}

export interface Category {
  id: string;
  name: string;
  _count?: { assets: number; stockItems: number };
}

export interface Allocation {
  id: string;
  assetId: string;
  allocatedToUserId: string | null;
  allocatedToUser: UserSummary | null;
  allocatedToLocation: string | null;
  allocatedAt: string;
  returnedAt: string | null;
  note: string | null;
  asset?: { id: string; name: string; code: string };
}

export interface Asset {
  id: string;
  name: string;
  code: string;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  serialNo: string | null;
  purchaseDate: string | null;
  purchaseCost: string | number | null;
  vendor: string | null;
  location: string | null;
  status: AssetStatus;
  condition: AssetCondition | null;
  notes: string | null;
  createdAt: string;
  allocations: Allocation[];
}

export interface Maintenance {
  id: string;
  assetId: string;
  date: string;
  description: string;
  cost: string | number | null;
  vendor: string | null;
  status: MaintenanceStatus;
  asset?: { id: string; name: string; code: string; status: AssetStatus };
}

export interface StockItem {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  quantity: number;
  reorderLevel: number;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  isLow: boolean;
}

export interface StockMovement {
  id: string;
  stockItemId: string;
  type: MovementType;
  quantity: number;
  unitCost: string | number | null;
  reference: string | null;
  note: string | null;
  createdAt: string;
  stockItem?: { id: string; name: string; unit: string };
  createdBy?: { id: string; firstName: string; lastName: string };
}

export interface PurchaseLine {
  name: string;
  stockItemId: string | null;
  quantity: number;
  unitCost: number;
  lineTotal?: number;
  movementId?: string | null;
}

export interface Purchase {
  id: string;
  vendor: string;
  invoiceNo: string | null;
  date: string;
  totalAmount: string | number;
  items: PurchaseLine[];
  note: string | null;
  createdAt: string;
  createdBy?: { id: string; firstName: string; lastName: string };
}

export interface InventoryReport {
  range: { from: string; to: string };
  totals: {
    assetCount: number;
    assetValue: number;
    maintenanceCost: number;
    stockValue: number;
    stockItems: number;
    lowStockCount: number;
  };
  assetValueByCategory: { categoryId: string | null; category: string; count: number; value: number }[];
  assetValueByStatus: { status: AssetStatus; count: number; value: number }[];
  maintenanceByMonth: { period: string; cost: number; count: number }[];
  stockValuation: {
    rows: { stockItemId: string; name: string; unit: string; quantity: number; averageUnitCost: number | null; value: number | null }[];
    totalValue: number;
    unvaluedItems: number;
  };
  lowStock: (Pick<StockItem, 'id' | 'name' | 'unit' | 'quantity' | 'reorderLevel'> & { isLow: boolean })[];
}

export const INV_KEY = 'inventory';

type Params = Record<string, string | number | boolean | undefined | null>;
const clean = (p: Params) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== ''));

function usePaged<T>(path: string, params: Params, enabled = true) {
  return useQuery({
    queryKey: [INV_KEY, path, params],
    queryFn: async (): Promise<Paged<T>> => (await apiClient.get(`/inventory${path}`, { params: clean(params) })).data.data,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export const useCategories = () => usePaged<Category>('/categories', { page: 1, pageSize: 100 });
export const useAssets = (p: Params) => usePaged<Asset>('/assets', p);
export const useAllocations = (p: Params, enabled = true) => usePaged<Allocation>('/allocations', p, enabled);
export const useMaintenance = (p: Params, enabled = true) => usePaged<Maintenance>('/maintenance', p, enabled);
export const useStockItems = (p: Params) => usePaged<StockItem>('/stock', p);
export const useLowStock = () => usePaged<StockItem>('/stock/low', { page: 1, pageSize: 100 });
export const useMovements = (p: Params, enabled = true) => usePaged<StockMovement>('/stock/movements', p, enabled);
export const usePurchases = (p: Params) => usePaged<Purchase>('/purchases', p);

export function useStaffOptions(enabled: boolean) {
  return useQuery({
    queryKey: [INV_KEY, 'staff-options'],
    queryFn: async (): Promise<UserSummary[]> => (await apiClient.get('/inventory/staff-options')).data.data,
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useInventoryReport(from: string, to: string) {
  return useQuery({
    queryKey: [INV_KEY, 'reports', from, to],
    queryFn: async (): Promise<InventoryReport> => (await apiClient.get('/inventory/reports', { params: clean({ from, to }) })).data.data,
  });
}

/** Generic mutation that invalidates every inventory query on success. */
export function useInvMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: [INV_KEY] }),
  });
}

export const invApi = {
  post: (path: string, body?: unknown) => apiClient.post(`/inventory${path}`, body ?? {}).then((r) => r.data.data),
  put: (path: string, body: unknown) => apiClient.put(`/inventory${path}`, body).then((r) => r.data.data),
  del: (path: string) => apiClient.delete(`/inventory${path}`).then((r) => r.data.data),
};

export async function downloadAssetRegister(params: Params) {
  const res = await apiClient.get('/inventory/assets/export', { params: clean(params), responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `asset-register-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const errMsg = (e: any, fallback: string): string => e?.response?.data?.message || fallback;

export const toNum = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? 0 : Number(v));
export const personName = (u?: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}`.trim() : '');
export const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const dateKey = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');

export const ASSET_STATUS_OPTIONS: { value: AssetStatus; label: string }[] = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'ALLOCATED', label: 'Allocated' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'RETIRED', label: 'Retired' },
  { value: 'LOST', label: 'Lost' },
];
export const CONDITION_OPTIONS: { value: AssetCondition; label: string }[] = [
  { value: 'NEW', label: 'New' },
  { value: 'GOOD', label: 'Good' },
  { value: 'FAIR', label: 'Fair' },
  { value: 'POOR', label: 'Poor' },
  { value: 'DAMAGED', label: 'Damaged' },
];
export const MAINT_STATUS_OPTIONS: { value: MaintenanceStatus; label: string }[] = [
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export const ASSET_STATUS_VARIANT: Record<AssetStatus, 'success' | 'info' | 'warning' | 'neutral' | 'danger'> = {
  AVAILABLE: 'success',
  ALLOCATED: 'info',
  MAINTENANCE: 'warning',
  RETIRED: 'neutral',
  LOST: 'danger',
};
export const MAINT_STATUS_VARIANT: Record<MaintenanceStatus, 'success' | 'info' | 'warning' | 'neutral'> = {
  SCHEDULED: 'info',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};
