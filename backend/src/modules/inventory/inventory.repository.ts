import { Prisma, AssetStatus, StockMovementType } from '@prisma/client';
import { prisma } from '../../config/prisma';

// Every query here filters by institutionId. Client-supplied foreign keys are
// verified by the service (via the find*ById helpers) before they're written.

export const toDate = (d: string) => new Date(`${d}T00:00:00.000Z`);
export const endOfDay = (d: string) => new Date(`${d}T23:59:59.999Z`);

const userSummary = { select: { id: true, firstName: true, lastName: true, role: true } } as const;

// ── Categories ────────────────────────────────────────────────────────────
export function listCategories(institutionId: string, search: string | undefined, skip: number, take: number) {
  const where: Prisma.AssetCategoryWhereInput = {
    institutionId,
    ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
  };
  return prisma.$transaction([
    prisma.assetCategory.findMany({
      where,
      skip,
      take,
      orderBy: { name: 'asc' },
      include: { _count: { select: { assets: true, stockItems: true } } },
    }),
    prisma.assetCategory.count({ where }),
  ]);
}

export function findCategory(institutionId: string, id: string) {
  return prisma.assetCategory.findFirst({ where: { id, institutionId } });
}

export function createCategory(institutionId: string, name: string) {
  return prisma.assetCategory.create({ data: { institutionId, name } });
}

export function updateCategory(id: string, name: string) {
  return prisma.assetCategory.update({ where: { id }, data: { name } });
}

export function countCategoryUsage(institutionId: string, id: string) {
  return Promise.all([
    prisma.asset.count({ where: { institutionId, categoryId: id } }),
    prisma.stockItem.count({ where: { institutionId, categoryId: id } }),
  ]).then(([a, s]) => a + s);
}

export function deleteCategory(institutionId: string, id: string) {
  return prisma.assetCategory.deleteMany({ where: { id, institutionId } });
}

// ── Assets ────────────────────────────────────────────────────────────────
const assetInclude = {
  category: { select: { id: true, name: true } },
  allocations: {
    where: { returnedAt: null },
    take: 1,
    orderBy: { allocatedAt: 'desc' as const },
    include: { allocatedToUser: userSummary },
  },
} satisfies Prisma.AssetInclude;

export function assetWhere(institutionId: string, q: { search?: string; status?: AssetStatus; categoryId?: string }): Prisma.AssetWhereInput {
  return {
    institutionId,
    ...(q.status ? { status: q.status } : {}),
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    ...(q.search
      ? {
          OR: [
            { name: { contains: q.search, mode: 'insensitive' } },
            { code: { contains: q.search, mode: 'insensitive' } },
            { serialNo: { contains: q.search, mode: 'insensitive' } },
            { location: { contains: q.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

export function listAssets(where: Prisma.AssetWhereInput, skip: number, take: number) {
  return prisma.$transaction([
    prisma.asset.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: assetInclude }),
    prisma.asset.count({ where }),
  ]);
}

export function listAssetsForExport(where: Prisma.AssetWhereInput) {
  return prisma.asset.findMany({ where, orderBy: { code: 'asc' }, include: assetInclude, take: 10_000 });
}

export function findAsset(institutionId: string, id: string) {
  return prisma.asset.findFirst({ where: { id, institutionId }, include: assetInclude });
}

export function createAsset(data: Prisma.AssetUncheckedCreateInput) {
  return prisma.asset.create({ data, include: assetInclude });
}

export function updateAsset(id: string, data: Prisma.AssetUncheckedUpdateInput) {
  return prisma.asset.update({ where: { id }, data, include: assetInclude });
}

export function countAssetHistory(institutionId: string, assetId: string) {
  return Promise.all([
    prisma.assetAllocation.count({ where: { institutionId, assetId } }),
    prisma.assetMaintenance.count({ where: { institutionId, assetId } }),
  ]).then(([a, m]) => a + m);
}

export function deleteAsset(institutionId: string, id: string) {
  return prisma.asset.deleteMany({ where: { id, institutionId } });
}

export function findTenantUser(institutionId: string, userId: string) {
  return prisma.user.findFirst({ where: { id: userId, institutionId }, select: { id: true, role: true, isActive: true } });
}

export function listStaffUsers(institutionId: string, search?: string) {
  return prisma.user.findMany({
    where: {
      institutionId,
      isActive: true,
      role: { notIn: ['STUDENT', 'GUARDIAN'] },
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: { id: true, firstName: true, lastName: true, role: true, email: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 200,
  });
}

/** Atomic: only an AVAILABLE asset can be allocated; two concurrent allocations can't both win. */
export function allocateAsset(
  institutionId: string,
  assetId: string,
  data: { allocatedToUserId: string | null; allocatedToLocation: string | null; note: string | null },
) {
  return prisma.$transaction(async (tx) => {
    const flipped = await tx.asset.updateMany({
      where: { id: assetId, institutionId, status: 'AVAILABLE' },
      data: { status: 'ALLOCATED', ...(data.allocatedToLocation ? { location: data.allocatedToLocation } : {}) },
    });
    if (flipped.count === 0) return null;
    return tx.assetAllocation.create({
      data: { institutionId, assetId, ...data },
      include: { allocatedToUser: userSummary },
    });
  });
}

/** Closes the open allocation and returns the asset to AVAILABLE (unless it's under maintenance / retired). */
export function returnAsset(institutionId: string, assetId: string, note: string | null, condition: string | null | undefined) {
  return prisma.$transaction(async (tx) => {
    const open = await tx.assetAllocation.findFirst({
      where: { institutionId, assetId, returnedAt: null },
      orderBy: { allocatedAt: 'desc' },
    });
    if (!open) return null;
    const closed = await tx.assetAllocation.update({
      where: { id: open.id },
      data: { returnedAt: new Date(), note: note ? [open.note, `Returned: ${note}`].filter(Boolean).join(' · ') : open.note },
      include: { allocatedToUser: userSummary },
    });
    await tx.asset.updateMany({
      where: { id: assetId, institutionId, status: 'ALLOCATED' },
      data: { status: 'AVAILABLE' },
    });
    if (condition) await tx.asset.updateMany({ where: { id: assetId, institutionId }, data: { condition } });
    return closed;
  });
}

export function listAllocations(where: Prisma.AssetAllocationWhereInput, skip: number, take: number) {
  return prisma.$transaction([
    prisma.assetAllocation.findMany({
      where,
      skip,
      take,
      orderBy: { allocatedAt: 'desc' },
      include: { allocatedToUser: userSummary, asset: { select: { id: true, name: true, code: true } } },
    }),
    prisma.assetAllocation.count({ where }),
  ]);
}

// ── Maintenance ───────────────────────────────────────────────────────────
export function listMaintenance(where: Prisma.AssetMaintenanceWhereInput, skip: number, take: number) {
  return prisma.$transaction([
    prisma.assetMaintenance.findMany({
      where,
      skip,
      take,
      orderBy: { date: 'desc' },
      include: { asset: { select: { id: true, name: true, code: true, status: true } } },
    }),
    prisma.assetMaintenance.count({ where }),
  ]);
}

export function findMaintenance(institutionId: string, id: string) {
  return prisma.assetMaintenance.findFirst({ where: { id, institutionId } });
}

export function createMaintenance(data: Prisma.AssetMaintenanceUncheckedCreateInput, markUnderMaintenance: boolean) {
  return prisma.$transaction(async (tx) => {
    const rec = await tx.assetMaintenance.create({
      data,
      include: { asset: { select: { id: true, name: true, code: true, status: true } } },
    });
    if (markUnderMaintenance) {
      await tx.asset.updateMany({
        where: { id: data.assetId, institutionId: data.institutionId, status: { in: ['AVAILABLE', 'ALLOCATED'] } },
        data: { status: 'MAINTENANCE' },
      });
    }
    return rec;
  });
}

/**
 * Updates a maintenance record. When it leaves the open states (COMPLETED /
 * CANCELLED) and the asset is flagged MAINTENANCE with no other open record,
 * the asset goes back to ALLOCATED (if it still has an open allocation) or
 * AVAILABLE. Moving to IN_PROGRESS flags the asset MAINTENANCE.
 */
export function updateMaintenance(institutionId: string, id: string, assetId: string, data: Prisma.AssetMaintenanceUncheckedUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const rec = await tx.assetMaintenance.update({
      where: { id },
      data,
      include: { asset: { select: { id: true, name: true, code: true, status: true } } },
    });
    if (rec.status === 'IN_PROGRESS') {
      await tx.asset.updateMany({
        where: { id: assetId, institutionId, status: { in: ['AVAILABLE', 'ALLOCATED'] } },
        data: { status: 'MAINTENANCE' },
      });
    } else if (rec.status === 'COMPLETED' || rec.status === 'CANCELLED') {
      const stillOpen = await tx.assetMaintenance.count({
        where: { institutionId, assetId, status: 'IN_PROGRESS', id: { not: id } },
      });
      if (stillOpen === 0) {
        const openAlloc = await tx.assetAllocation.count({ where: { institutionId, assetId, returnedAt: null } });
        await tx.asset.updateMany({
          where: { id: assetId, institutionId, status: 'MAINTENANCE' },
          data: { status: openAlloc > 0 ? 'ALLOCATED' : 'AVAILABLE' },
        });
      }
    }
    return rec;
  });
}

export function deleteMaintenance(institutionId: string, id: string) {
  return prisma.assetMaintenance.deleteMany({ where: { id, institutionId } });
}

// ── Stock ─────────────────────────────────────────────────────────────────
const stockInclude = { category: { select: { id: true, name: true } } } satisfies Prisma.StockItemInclude;

export function stockWhere(institutionId: string, q: { search?: string; categoryId?: string; lowOnly?: boolean }): Prisma.StockItemWhereInput {
  return {
    institutionId,
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    // Prisma 5 field reference: quantity <= reorderLevel on the same row.
    ...(q.lowOnly ? { quantity: { lte: prisma.stockItem.fields.reorderLevel } } : {}),
    ...(q.search
      ? {
          OR: [
            { name: { contains: q.search, mode: 'insensitive' } },
            { sku: { contains: q.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

export function listStockItems(where: Prisma.StockItemWhereInput, skip: number, take: number) {
  return prisma.$transaction([
    prisma.stockItem.findMany({ where, skip, take, orderBy: { name: 'asc' }, include: stockInclude }),
    prisma.stockItem.count({ where }),
  ]);
}

export function findStockItem(institutionId: string, id: string) {
  return prisma.stockItem.findFirst({ where: { id, institutionId }, include: stockInclude });
}

export function findStockItemsByIds(institutionId: string, ids: string[]) {
  return prisma.stockItem.findMany({ where: { institutionId, id: { in: ids } }, select: { id: true, name: true } });
}

export function createStockItem(
  data: Prisma.StockItemUncheckedCreateInput,
  opening: { quantity: number; unitCost: number | null; userId: string } | null,
) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.stockItem.create({ data: { ...data, quantity: opening?.quantity ?? 0 }, include: stockInclude });
    if (opening && opening.quantity > 0) {
      await tx.stockMovement.create({
        data: {
          institutionId: data.institutionId,
          stockItemId: item.id,
          type: 'IN',
          quantity: opening.quantity,
          unitCost: opening.unitCost ?? undefined,
          reference: 'OPENING',
          note: 'Opening balance',
          createdByUserId: opening.userId,
        },
      });
    }
    return item;
  });
}

export function updateStockItem(id: string, data: Prisma.StockItemUncheckedUpdateInput) {
  return prisma.stockItem.update({ where: { id }, data, include: stockInclude });
}

export function countStockMovements(institutionId: string, stockItemId: string) {
  return prisma.stockMovement.count({ where: { institutionId, stockItemId } });
}

export function deleteStockItem(institutionId: string, id: string) {
  return prisma.stockItem.deleteMany({ where: { id, institutionId } });
}

export type StockTx = Prisma.TransactionClient;

/**
 * Applies a signed delta to StockItem.quantity atomically and records the
 * movement in the same transaction. The UPDATE itself carries the guard
 * (`quantity >= -delta` for decreases, or `quantity = expected` for a
 * stock-take), so a concurrent movement can never drive stock negative.
 * Returns null when the guard rejects the update.
 */
export async function applyMovementTx(
  tx: StockTx,
  args: {
    institutionId: string;
    stockItemId: string;
    delta: number;
    expectedCurrent?: number;
    type: StockMovementType;
    movementQuantity: number;
    unitCost: number | null;
    reference: string | null;
    note: string | null;
    userId: string;
  },
) {
  const guard: Prisma.StockItemWhereInput =
    args.expectedCurrent !== undefined
      ? { quantity: args.expectedCurrent }
      : args.delta < 0
        ? { quantity: { gte: -args.delta } }
        : {};
  const res = await tx.stockItem.updateMany({
    where: { id: args.stockItemId, institutionId: args.institutionId, ...guard },
    data: { quantity: { increment: args.delta } },
  });
  if (res.count === 0) return null;
  return tx.stockMovement.create({
    data: {
      institutionId: args.institutionId,
      stockItemId: args.stockItemId,
      type: args.type,
      quantity: args.movementQuantity,
      unitCost: args.unitCost ?? undefined,
      reference: args.reference,
      note: args.note,
      createdByUserId: args.userId,
    },
  });
}

export function listMovements(where: Prisma.StockMovementWhereInput, skip: number, take: number) {
  return prisma.$transaction([
    prisma.stockMovement.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        stockItem: { select: { id: true, name: true, unit: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.stockMovement.count({ where }),
  ]);
}

// ── Purchases ─────────────────────────────────────────────────────────────
export function listPurchases(where: Prisma.PurchaseRecordWhereInput, skip: number, take: number) {
  return prisma.$transaction([
    prisma.purchaseRecord.findMany({
      where,
      skip,
      take,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.purchaseRecord.count({ where }),
  ]);
}

export function findPurchase(institutionId: string, id: string) {
  return prisma.purchaseRecord.findFirst({
    where: { id, institutionId },
    include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
  });
}

export function deletePurchase(institutionId: string, id: string) {
  return prisma.purchaseRecord.deleteMany({ where: { id, institutionId } });
}

// ── Reports ───────────────────────────────────────────────────────────────
export function assetGroups(institutionId: string) {
  return Promise.all([
    prisma.asset.groupBy({
      by: ['categoryId'],
      where: { institutionId },
      _sum: { purchaseCost: true },
      _count: { _all: true },
    }),
    prisma.asset.groupBy({
      by: ['status'],
      where: { institutionId },
      _sum: { purchaseCost: true },
      _count: { _all: true },
    }),
    prisma.assetCategory.findMany({ where: { institutionId }, select: { id: true, name: true } }),
  ]);
}

export function maintenanceInRange(institutionId: string, from: Date, to: Date) {
  return prisma.assetMaintenance.findMany({
    where: { institutionId, date: { gte: from, lte: to } },
    select: { date: true, cost: true, status: true },
  });
}

export function stockForValuation(institutionId: string) {
  return Promise.all([
    prisma.stockItem.findMany({
      where: { institutionId },
      select: { id: true, name: true, unit: true, quantity: true, reorderLevel: true },
      orderBy: { name: 'asc' },
      take: 5000,
    }),
    prisma.stockMovement.findMany({
      where: { institutionId, type: 'IN', unitCost: { not: null } },
      select: { stockItemId: true, type: true, quantity: true, unitCost: true },
    }),
  ]);
}
