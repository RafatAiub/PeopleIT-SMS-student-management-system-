import { z } from 'zod';

const dateOnly = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
const optText = (max: number) => z.string().trim().max(max).optional().nullable();
const money = z.coerce.number().min(0, 'Amount cannot be negative').max(999_999_999, 'Amount is too large');

export const IdParamDto = z.object({ id: z.string().min(1, 'Invalid ID') });

const Paging = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
};

// ── Categories ────────────────────────────────────────────────────────────
export const CategoryDto = z.object({ name: z.string().trim().min(1, 'Name is required').max(100) });
export const CategoryQueryDto = z.object({ ...Paging, pageSize: z.coerce.number().int().positive().max(100).default(100) });

// ── Assets ────────────────────────────────────────────────────────────────
export const ASSET_STATUSES = ['AVAILABLE', 'ALLOCATED', 'MAINTENANCE', 'RETIRED', 'LOST'] as const;
export const ASSET_CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'] as const;

const AssetFields = z.object({
  name: z.string().trim().min(1, 'Name is required').max(150),
  code: z.string().trim().min(1, 'Asset code is required').max(50),
  categoryId: z.string().min(1).optional().nullable(),
  serialNo: optText(100),
  purchaseDate: dateOnly.optional().nullable(),
  purchaseCost: money.optional().nullable(),
  vendor: optText(150),
  location: optText(150),
  condition: z.enum(ASSET_CONDITIONS).optional().nullable(),
  notes: optText(1000),
});
export const CreateAssetDto = AssetFields.extend({
  // ALLOCATED is only reachable through the allocate endpoint.
  status: z.enum(['AVAILABLE', 'MAINTENANCE', 'RETIRED', 'LOST']).default('AVAILABLE'),
});
export const UpdateAssetDto = AssetFields.partial().extend({
  status: z.enum(['AVAILABLE', 'MAINTENANCE', 'RETIRED', 'LOST']).optional(),
});
export const AssetQueryDto = z.object({
  ...Paging,
  status: z.enum(ASSET_STATUSES).optional(),
  categoryId: z.string().min(1).optional(),
});

export const AllocateAssetDto = z
  .object({
    allocatedToUserId: z.string().min(1).optional().nullable(),
    allocatedToLocation: optText(150),
    note: optText(500),
  })
  .refine((d) => !!d.allocatedToUserId !== !!(d.allocatedToLocation && d.allocatedToLocation.length > 0), {
    message: 'Allocate to either a staff member or a location (exactly one)',
    path: ['allocatedToUserId'],
  });
export const ReturnAssetDto = z.object({ note: optText(500), condition: z.enum(ASSET_CONDITIONS).optional().nullable() });
export const AllocationQueryDto = z.object({ ...Paging, assetId: z.string().min(1).optional(), active: z.enum(['true', 'false']).optional() });

// ── Maintenance ───────────────────────────────────────────────────────────
export const MAINTENANCE_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export const CreateMaintenanceDto = z.object({
  assetId: z.string().min(1, 'Asset is required'),
  date: dateOnly,
  description: z.string().trim().min(1, 'Description is required').max(500),
  cost: money.optional().nullable(),
  vendor: optText(150),
  status: z.enum(['SCHEDULED', 'IN_PROGRESS']).default('SCHEDULED'),
});
export const UpdateMaintenanceDto = z.object({
  date: dateOnly.optional(),
  description: z.string().trim().min(1).max(500).optional(),
  cost: money.optional().nullable(),
  vendor: optText(150),
  status: z.enum(MAINTENANCE_STATUSES).optional(),
});
export const CompleteMaintenanceDto = z.object({ cost: money.optional().nullable(), date: dateOnly.optional() });
export const MaintenanceQueryDto = z.object({ ...Paging, assetId: z.string().min(1).optional(), status: z.enum(MAINTENANCE_STATUSES).optional() });

// ── Stock ─────────────────────────────────────────────────────────────────
const StockFields = z.object({
  name: z.string().trim().min(1, 'Name is required').max(150),
  sku: optText(50),
  unit: z.string().trim().min(1, 'Unit is required').max(20),
  reorderLevel: z.coerce.number().int().min(0).max(1_000_000).default(0),
  categoryId: z.string().min(1).optional().nullable(),
});
export const CreateStockItemDto = StockFields.extend({
  // Opening balance — recorded as an IN movement so history always adds up.
  openingQuantity: z.coerce.number().int().min(0).max(1_000_000).default(0),
  openingUnitCost: money.optional().nullable(),
});
// quantity is deliberately NOT editable here — it only moves via movements.
export const UpdateStockItemDto = StockFields.partial();
export const StockQueryDto = z.object({ ...Paging, categoryId: z.string().min(1).optional(), lowOnly: z.enum(['true', 'false']).optional() });

export const StockMovementDto = z
  .object({
    type: z.enum(['IN', 'OUT', 'ADJUST']),
    quantity: z.coerce.number().int().min(-1_000_000).max(1_000_000).optional(),
    countedQuantity: z.coerce.number().int().min(0).max(1_000_000).optional(),
    unitCost: money.optional().nullable(),
    reference: optText(100),
    note: optText(500),
  })
  .refine((d) => d.quantity !== undefined || (d.type === 'ADJUST' && d.countedQuantity !== undefined), {
    message: 'Quantity is required',
    path: ['quantity'],
  });
export const MovementQueryDto = z.object({ ...Paging, stockItemId: z.string().min(1).optional(), type: z.enum(['IN', 'OUT', 'ADJUST']).optional() });

// ── Purchases ─────────────────────────────────────────────────────────────
const PurchaseLine = z.object({
  name: z.string().trim().min(1, 'Item name is required').max(150),
  stockItemId: z.string().min(1).optional().nullable(),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(1_000_000),
  unitCost: money,
});
export const CreatePurchaseDto = z.object({
  vendor: z.string().trim().min(1, 'Vendor is required').max(150),
  invoiceNo: optText(100),
  date: dateOnly,
  items: z.array(PurchaseLine).min(1, 'Add at least one item').max(200),
  // Optional override (e.g. includes VAT / delivery). Defaults to Σ qty × unitCost.
  totalAmount: money.optional().nullable(),
  note: optText(1000),
  createStockMovements: z.boolean().default(false),
});
export const PurchaseQueryDto = z.object({ ...Paging, from: dateOnly.optional(), to: dateOnly.optional() });

// ── Reports ───────────────────────────────────────────────────────────────
export const ReportQueryDto = z.object({ from: dateOnly.optional(), to: dateOnly.optional() });

export type CreateAssetInput = z.infer<typeof CreateAssetDto>;
export type UpdateAssetInput = z.infer<typeof UpdateAssetDto>;
export type AssetQuery = z.infer<typeof AssetQueryDto>;
export type AllocateAssetInput = z.infer<typeof AllocateAssetDto>;
export type ReturnAssetInput = z.infer<typeof ReturnAssetDto>;
export type AllocationQuery = z.infer<typeof AllocationQueryDto>;
export type CreateMaintenanceInput = z.infer<typeof CreateMaintenanceDto>;
export type UpdateMaintenanceInput = z.infer<typeof UpdateMaintenanceDto>;
export type CompleteMaintenanceInput = z.infer<typeof CompleteMaintenanceDto>;
export type MaintenanceQuery = z.infer<typeof MaintenanceQueryDto>;
export type CreateStockItemInput = z.infer<typeof CreateStockItemDto>;
export type UpdateStockItemInput = z.infer<typeof UpdateStockItemDto>;
export type StockQuery = z.infer<typeof StockQueryDto>;
export type StockMovementInput = z.infer<typeof StockMovementDto>;
export type MovementQuery = z.infer<typeof MovementQueryDto>;
export type CreatePurchaseInput = z.infer<typeof CreatePurchaseDto>;
export type PurchaseQuery = z.infer<typeof PurchaseQueryDto>;
export type ReportQuery = z.infer<typeof ReportQueryDto>;
export type CategoryQuery = z.infer<typeof CategoryQueryDto>;
