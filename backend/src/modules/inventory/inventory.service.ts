import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/AppError';
import * as repo from './inventory.repository';
import {
  computeStockChange,
  isLowStock,
  maintenanceCostByMonth,
  normalizeAssetCode,
  purchaseTotal,
  stockValuation,
  toCsv,
  type StockMovementKind,
} from './inventory.logic';
import type {
  AllocateAssetInput,
  AllocationQuery,
  AssetQuery,
  CategoryQuery,
  CompleteMaintenanceInput,
  CreateAssetInput,
  CreateMaintenanceInput,
  CreatePurchaseInput,
  CreateStockItemInput,
  MaintenanceQuery,
  MovementQuery,
  PurchaseQuery,
  ReportQuery,
  ReturnAssetInput,
  StockMovementInput,
  StockQuery,
  UpdateAssetInput,
  UpdateMaintenanceInput,
  UpdateStockItemInput,
} from './inventory.dto';

const paged = <T>(items: T[], total: number, page: number, pageSize: number) => ({ items, meta: { total, page, pageSize } });
const skipOf = (page: number, pageSize: number) => (page - 1) * pageSize;
const num = (v: Prisma.Decimal | number | null | undefined) => (v === null || v === undefined ? null : Number(v));
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

async function assertCategory(institutionId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const cat = await repo.findCategory(institutionId, categoryId);
  if (!cat) throw new BadRequestError('Category not found in your institution');
}

// ── Categories ────────────────────────────────────────────────────────────
export async function listCategories(institutionId: string, q: CategoryQuery) {
  const [items, total] = await repo.listCategories(institutionId, q.search, skipOf(q.page, q.pageSize), q.pageSize);
  return paged(items, total, q.page, q.pageSize);
}

export async function createCategory(institutionId: string, name: string) {
  try {
    return await repo.createCategory(institutionId, name);
  } catch (e) {
    if (isUnique(e)) throw new ConflictError('A category with this name already exists');
    throw e;
  }
}

export async function updateCategory(institutionId: string, id: string, name: string) {
  const cat = await repo.findCategory(institutionId, id);
  if (!cat) throw new NotFoundError('Category not found');
  try {
    return await repo.updateCategory(id, name);
  } catch (e) {
    if (isUnique(e)) throw new ConflictError('A category with this name already exists');
    throw e;
  }
}

export async function deleteCategory(institutionId: string, id: string) {
  const cat = await repo.findCategory(institutionId, id);
  if (!cat) throw new NotFoundError('Category not found');
  if ((await repo.countCategoryUsage(institutionId, id)) > 0) {
    throw new ConflictError('This category is used by assets or stock items — reassign them first');
  }
  await repo.deleteCategory(institutionId, id);
  return { id };
}

// ── Assets ────────────────────────────────────────────────────────────────
export async function listAssets(institutionId: string, q: AssetQuery) {
  const [items, total] = await repo.listAssets(repo.assetWhere(institutionId, q), skipOf(q.page, q.pageSize), q.pageSize);
  return paged(items, total, q.page, q.pageSize);
}

export async function getAsset(institutionId: string, id: string) {
  const asset = await repo.findAsset(institutionId, id);
  if (!asset) throw new NotFoundError('Asset not found');
  return asset;
}

export async function createAsset(institutionId: string, data: CreateAssetInput) {
  await assertCategory(institutionId, data.categoryId);
  try {
    return await repo.createAsset({
      institutionId,
      name: data.name,
      code: normalizeAssetCode(data.code),
      categoryId: data.categoryId || null,
      serialNo: data.serialNo || null,
      purchaseDate: data.purchaseDate ? repo.toDate(data.purchaseDate) : null,
      purchaseCost: data.purchaseCost ?? null,
      vendor: data.vendor || null,
      location: data.location || null,
      condition: data.condition || null,
      notes: data.notes || null,
      status: data.status,
    });
  } catch (e) {
    if (isUnique(e)) throw new ConflictError('An asset with this code already exists');
    throw e;
  }
}

export async function updateAsset(institutionId: string, id: string, data: UpdateAssetInput) {
  const asset = await repo.findAsset(institutionId, id);
  if (!asset) throw new NotFoundError('Asset not found');
  await assertCategory(institutionId, data.categoryId);
  if (data.status && asset.status === 'ALLOCATED') {
    throw new ConflictError('This asset is allocated — return it before changing its status');
  }
  const patch: Prisma.AssetUncheckedUpdateInput = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.code !== undefined) patch.code = normalizeAssetCode(data.code);
  if (data.categoryId !== undefined) patch.categoryId = data.categoryId || null;
  if (data.serialNo !== undefined) patch.serialNo = data.serialNo || null;
  if (data.purchaseDate !== undefined) patch.purchaseDate = data.purchaseDate ? repo.toDate(data.purchaseDate) : null;
  if (data.purchaseCost !== undefined) patch.purchaseCost = data.purchaseCost ?? null;
  if (data.vendor !== undefined) patch.vendor = data.vendor || null;
  if (data.location !== undefined) patch.location = data.location || null;
  if (data.condition !== undefined) patch.condition = data.condition || null;
  if (data.notes !== undefined) patch.notes = data.notes || null;
  if (data.status !== undefined) patch.status = data.status;
  try {
    return await repo.updateAsset(id, patch);
  } catch (e) {
    if (isUnique(e)) throw new ConflictError('An asset with this code already exists');
    throw e;
  }
}

export async function deleteAsset(institutionId: string, id: string) {
  const asset = await repo.findAsset(institutionId, id);
  if (!asset) throw new NotFoundError('Asset not found');
  if ((await repo.countAssetHistory(institutionId, id)) > 0) {
    throw new ConflictError('This asset has allocation or maintenance history — mark it RETIRED instead of deleting');
  }
  await repo.deleteAsset(institutionId, id);
  return { id };
}

export async function listStaffOptions(institutionId: string, search?: string) {
  return repo.listStaffUsers(institutionId, search);
}

export async function allocateAsset(institutionId: string, assetId: string, data: AllocateAssetInput) {
  const asset = await repo.findAsset(institutionId, assetId);
  if (!asset) throw new NotFoundError('Asset not found');
  if (data.allocatedToUserId) {
    const user = await repo.findTenantUser(institutionId, data.allocatedToUserId);
    if (!user) throw new BadRequestError('Staff member not found in your institution');
    if (user.role === 'STUDENT' || user.role === 'GUARDIAN') throw new BadRequestError('Assets can only be allocated to staff');
    if (!user.isActive) throw new BadRequestError('This staff account is inactive');
  }
  const allocation = await repo.allocateAsset(institutionId, assetId, {
    allocatedToUserId: data.allocatedToUserId || null,
    allocatedToLocation: data.allocatedToLocation || null,
    note: data.note || null,
  });
  if (!allocation) throw new ConflictError(`Only AVAILABLE assets can be allocated (this one is ${asset.status})`);
  return allocation;
}

export async function returnAsset(institutionId: string, assetId: string, data: ReturnAssetInput) {
  const asset = await repo.findAsset(institutionId, assetId);
  if (!asset) throw new NotFoundError('Asset not found');
  const closed = await repo.returnAsset(institutionId, assetId, data.note || null, data.condition);
  if (!closed) throw new ConflictError('This asset has no open allocation');
  return closed;
}

export async function listAllocations(institutionId: string, q: AllocationQuery) {
  const where: Prisma.AssetAllocationWhereInput = {
    institutionId,
    ...(q.assetId ? { assetId: q.assetId } : {}),
    ...(q.active === 'true' ? { returnedAt: null } : q.active === 'false' ? { returnedAt: { not: null } } : {}),
    ...(q.search
      ? {
          OR: [
            { asset: { name: { contains: q.search, mode: 'insensitive' } } },
            { asset: { code: { contains: q.search, mode: 'insensitive' } } },
            { allocatedToLocation: { contains: q.search, mode: 'insensitive' } },
            { allocatedToUser: { firstName: { contains: q.search, mode: 'insensitive' } } },
            { allocatedToUser: { lastName: { contains: q.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [items, total] = await repo.listAllocations(where, skipOf(q.page, q.pageSize), q.pageSize);
  return paged(items, total, q.page, q.pageSize);
}

export async function exportAssetRegister(institutionId: string, q: Pick<AssetQuery, 'search' | 'status' | 'categoryId'>) {
  const rows = await repo.listAssetsForExport(repo.assetWhere(institutionId, q));
  const headers = ['Code', 'Name', 'Category', 'Serial No', 'Status', 'Condition', 'Location', 'Allocated To', 'Purchase Date', 'Purchase Cost (BDT)', 'Vendor', 'Notes'];
  const body = rows.map((a) => {
    const alloc = a.allocations[0];
    const holder = alloc
      ? alloc.allocatedToUser
        ? `${alloc.allocatedToUser.firstName} ${alloc.allocatedToUser.lastName}`
        : alloc.allocatedToLocation ?? ''
      : '';
    return [a.code, a.name, a.category?.name ?? '', a.serialNo ?? '', a.status, a.condition ?? '', a.location ?? '', holder, a.purchaseDate, num(a.purchaseCost), a.vendor ?? '', a.notes ?? ''];
  });
  // BOM so Excel opens UTF-8 (Bangla names) correctly.
  return '﻿' + toCsv(headers, body);
}

// ── Maintenance ───────────────────────────────────────────────────────────
export async function listMaintenance(institutionId: string, q: MaintenanceQuery) {
  const where: Prisma.AssetMaintenanceWhereInput = {
    institutionId,
    ...(q.assetId ? { assetId: q.assetId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.search
      ? {
          OR: [
            { description: { contains: q.search, mode: 'insensitive' } },
            { vendor: { contains: q.search, mode: 'insensitive' } },
            { asset: { name: { contains: q.search, mode: 'insensitive' } } },
            { asset: { code: { contains: q.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [items, total] = await repo.listMaintenance(where, skipOf(q.page, q.pageSize), q.pageSize);
  return paged(items, total, q.page, q.pageSize);
}

export async function createMaintenance(institutionId: string, data: CreateMaintenanceInput) {
  const asset = await repo.findAsset(institutionId, data.assetId);
  if (!asset) throw new BadRequestError('Asset not found in your institution');
  if (asset.status === 'RETIRED' || asset.status === 'LOST') throw new ConflictError(`Cannot schedule maintenance for a ${asset.status} asset`);
  return repo.createMaintenance(
    {
      institutionId,
      assetId: data.assetId,
      date: repo.toDate(data.date),
      description: data.description,
      cost: data.cost ?? null,
      vendor: data.vendor || null,
      status: data.status,
    },
    data.status === 'IN_PROGRESS',
  );
}

export async function updateMaintenance(institutionId: string, id: string, data: UpdateMaintenanceInput) {
  const rec = await repo.findMaintenance(institutionId, id);
  if (!rec) throw new NotFoundError('Maintenance record not found');
  if ((rec.status === 'COMPLETED' || rec.status === 'CANCELLED') && data.status && data.status !== rec.status) {
    throw new ConflictError(`This maintenance record is already ${rec.status}`);
  }
  const patch: Prisma.AssetMaintenanceUncheckedUpdateInput = {};
  if (data.date !== undefined) patch.date = repo.toDate(data.date);
  if (data.description !== undefined) patch.description = data.description;
  if (data.cost !== undefined) patch.cost = data.cost ?? null;
  if (data.vendor !== undefined) patch.vendor = data.vendor || null;
  if (data.status !== undefined) patch.status = data.status;
  return repo.updateMaintenance(institutionId, id, rec.assetId, patch);
}

export async function completeMaintenance(institutionId: string, id: string, data: CompleteMaintenanceInput) {
  const rec = await repo.findMaintenance(institutionId, id);
  if (!rec) throw new NotFoundError('Maintenance record not found');
  if (rec.status === 'COMPLETED' || rec.status === 'CANCELLED') throw new ConflictError(`This maintenance record is already ${rec.status}`);
  return repo.updateMaintenance(institutionId, id, rec.assetId, {
    status: 'COMPLETED',
    ...(data.cost !== undefined ? { cost: data.cost ?? null } : {}),
    ...(data.date ? { date: repo.toDate(data.date) } : {}),
  });
}

export async function deleteMaintenance(institutionId: string, id: string) {
  const rec = await repo.findMaintenance(institutionId, id);
  if (!rec) throw new NotFoundError('Maintenance record not found');
  if (rec.status === 'IN_PROGRESS') throw new ConflictError('Complete or cancel in-progress maintenance before deleting it');
  await repo.deleteMaintenance(institutionId, id);
  return { id };
}

// ── Stock ─────────────────────────────────────────────────────────────────
const withLowFlag = <T extends { quantity: number; reorderLevel: number }>(i: T) => ({ ...i, isLow: isLowStock(i) });

export async function listStockItems(institutionId: string, q: StockQuery) {
  const where = repo.stockWhere(institutionId, { search: q.search, categoryId: q.categoryId, lowOnly: q.lowOnly === 'true' });
  const [items, total] = await repo.listStockItems(where, skipOf(q.page, q.pageSize), q.pageSize);
  return paged(items.map(withLowFlag), total, q.page, q.pageSize);
}

export async function listLowStock(institutionId: string, q: StockQuery) {
  return listStockItems(institutionId, { ...q, lowOnly: 'true' });
}

export async function createStockItem(institutionId: string, userId: string, data: CreateStockItemInput) {
  await assertCategory(institutionId, data.categoryId);
  const item = await repo.createStockItem(
    {
      institutionId,
      name: data.name,
      sku: data.sku || null,
      unit: data.unit,
      reorderLevel: data.reorderLevel,
      categoryId: data.categoryId || null,
    },
    data.openingQuantity > 0 ? { quantity: data.openingQuantity, unitCost: data.openingUnitCost ?? null, userId } : null,
  );
  return withLowFlag(item);
}

export async function updateStockItem(institutionId: string, id: string, data: UpdateStockItemInput) {
  const item = await repo.findStockItem(institutionId, id);
  if (!item) throw new NotFoundError('Stock item not found');
  await assertCategory(institutionId, data.categoryId);
  const patch: Prisma.StockItemUncheckedUpdateInput = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.sku !== undefined) patch.sku = data.sku || null;
  if (data.unit !== undefined) patch.unit = data.unit;
  if (data.reorderLevel !== undefined) patch.reorderLevel = data.reorderLevel;
  if (data.categoryId !== undefined) patch.categoryId = data.categoryId || null;
  return withLowFlag(await repo.updateStockItem(id, patch));
}

export async function deleteStockItem(institutionId: string, id: string) {
  const item = await repo.findStockItem(institutionId, id);
  if (!item) throw new NotFoundError('Stock item not found');
  if ((await repo.countStockMovements(institutionId, id)) > 0) {
    throw new ConflictError('This item has stock movement history and cannot be deleted');
  }
  await repo.deleteStockItem(institutionId, id);
  return { id };
}

export async function recordMovement(institutionId: string, userId: string, stockItemId: string, data: StockMovementInput) {
  // Two attempts: a stock-take (countedQuantity) is guarded on the exact
  // current quantity, so a concurrent movement makes the first try miss.
  for (let attempt = 0; attempt < 2; attempt++) {
    const item = await repo.findStockItem(institutionId, stockItemId);
    if (!item) throw new NotFoundError('Stock item not found');

    const change = computeStockChange(item.quantity, {
      type: data.type as StockMovementKind,
      quantity: data.quantity,
      countedQuantity: data.type === 'ADJUST' ? data.countedQuantity : undefined,
    });
    if (!change.ok) throw new BadRequestError(change.error);

    const isStockTake = data.type === 'ADJUST' && data.countedQuantity !== undefined;
    const movement = await prisma.$transaction((tx) =>
      repo.applyMovementTx(tx, {
        institutionId,
        stockItemId,
        delta: change.delta,
        expectedCurrent: isStockTake ? item.quantity : undefined,
        type: data.type,
        movementQuantity: change.movementQuantity,
        unitCost: data.type === 'IN' ? data.unitCost ?? null : null,
        reference: data.reference || (isStockTake ? 'STOCK-TAKE' : null),
        note: data.note || null,
        userId,
      }),
    );
    if (movement) {
      const updated = await repo.findStockItem(institutionId, stockItemId);
      return { movement, item: updated ? withLowFlag(updated) : null };
    }
    if (!isStockTake) {
      // Guard failed for a decrease → someone else took the stock first.
      const fresh = await repo.findStockItem(institutionId, stockItemId);
      throw new BadRequestError(`Insufficient stock — only ${fresh?.quantity ?? 0} available`);
    }
  }
  throw new ConflictError('Stock changed while saving the count — please re-check and try again');
}

export async function listMovements(institutionId: string, q: MovementQuery) {
  const where: Prisma.StockMovementWhereInput = {
    institutionId,
    ...(q.stockItemId ? { stockItemId: q.stockItemId } : {}),
    ...(q.type ? { type: q.type } : {}),
    ...(q.search
      ? {
          OR: [
            { reference: { contains: q.search, mode: 'insensitive' } },
            { note: { contains: q.search, mode: 'insensitive' } },
            { stockItem: { name: { contains: q.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [items, total] = await repo.listMovements(where, skipOf(q.page, q.pageSize), q.pageSize);
  return paged(items, total, q.page, q.pageSize);
}

// ── Purchases ─────────────────────────────────────────────────────────────
export async function listPurchases(institutionId: string, q: PurchaseQuery) {
  const where: Prisma.PurchaseRecordWhereInput = {
    institutionId,
    ...(q.from || q.to
      ? { date: { ...(q.from ? { gte: repo.toDate(q.from) } : {}), ...(q.to ? { lte: repo.endOfDay(q.to) } : {}) } }
      : {}),
    ...(q.search
      ? {
          OR: [
            { vendor: { contains: q.search, mode: 'insensitive' } },
            { invoiceNo: { contains: q.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [items, total] = await repo.listPurchases(where, skipOf(q.page, q.pageSize), q.pageSize);
  return paged(items, total, q.page, q.pageSize);
}

export async function getPurchase(institutionId: string, id: string) {
  const p = await repo.findPurchase(institutionId, id);
  if (!p) throw new NotFoundError('Purchase record not found');
  return p;
}

interface StoredPurchaseLine {
  name: string;
  stockItemId: string | null;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  movementId: string | null;
}

export async function createPurchase(institutionId: string, userId: string, data: CreatePurchaseInput) {
  const stockIds = [...new Set(data.items.map((i) => i.stockItemId).filter((x): x is string => !!x))];
  if (stockIds.length > 0) {
    const found = await repo.findStockItemsByIds(institutionId, stockIds);
    const ok = new Set(found.map((f) => f.id));
    const bad = stockIds.find((id) => !ok.has(id));
    if (bad) throw new BadRequestError('A linked stock item was not found in your institution');
  }
  const computed = purchaseTotal(data.items);
  const totalAmount = data.totalAmount ?? computed;

  return prisma.$transaction(async (tx) => {
    const record = await tx.purchaseRecord.create({
      data: {
        institutionId,
        vendor: data.vendor,
        invoiceNo: data.invoiceNo || null,
        date: repo.toDate(data.date),
        totalAmount,
        items: [],
        note: data.note || null,
        createdByUserId: userId,
      },
    });
    const reference = `PURCHASE:${data.invoiceNo || record.id}`.slice(0, 100);
    const lines: StoredPurchaseLine[] = [];
    for (const l of data.items) {
      let movementId: string | null = null;
      if (data.createStockMovements && l.stockItemId) {
        const mv = await repo.applyMovementTx(tx, {
          institutionId,
          stockItemId: l.stockItemId,
          delta: l.quantity,
          type: 'IN',
          movementQuantity: l.quantity,
          unitCost: l.unitCost,
          reference,
          note: `Purchase from ${data.vendor}`.slice(0, 500),
          userId,
        });
        if (!mv) throw new BadRequestError('Could not update stock for a linked item');
        movementId = mv.id;
      }
      lines.push({
        name: l.name,
        stockItemId: l.stockItemId || null,
        quantity: l.quantity,
        unitCost: l.unitCost,
        lineTotal: Math.round(l.unitCost * 100 * l.quantity) / 100,
        movementId,
      });
    }
    return tx.purchaseRecord.update({
      where: { id: record.id },
      data: { items: lines as unknown as Prisma.InputJsonValue },
      include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
    });
  });
}

export async function deletePurchase(institutionId: string, id: string) {
  const p = await repo.findPurchase(institutionId, id);
  if (!p) throw new NotFoundError('Purchase record not found');
  const lines = Array.isArray(p.items) ? (p.items as unknown as StoredPurchaseLine[]) : [];
  if (lines.some((l) => l && l.movementId)) {
    throw new ConflictError('This purchase already added stock — record an OUT/ADJUST movement instead of deleting it');
  }
  await repo.deletePurchase(institutionId, id);
  return { id };
}

// ── Reports ───────────────────────────────────────────────────────────────
export async function getReports(institutionId: string, q: ReportQuery) {
  const to = q.to ? repo.endOfDay(q.to) : new Date();
  const from = q.from
    ? repo.toDate(q.from)
    : new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 11, 1));
  if (from > to) throw new BadRequestError('"from" must be on or before "to"');

  const [[byCategory, byStatus, categories], maintenance, [stockItems, inMovements]] = await Promise.all([
    repo.assetGroups(institutionId),
    repo.maintenanceInRange(institutionId, from, to),
    repo.stockForValuation(institutionId),
  ]);

  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const assetValueByCategory = byCategory
    .map((g) => ({
      categoryId: g.categoryId,
      category: g.categoryId ? catName.get(g.categoryId) ?? 'Unknown' : 'Uncategorised',
      count: g._count._all,
      value: num(g._sum.purchaseCost) ?? 0,
    }))
    .sort((a, b) => b.value - a.value);
  const assetValueByStatus = byStatus.map((g) => ({ status: g.status, count: g._count._all, value: num(g._sum.purchaseCost) ?? 0 }));

  const movementsByItem = new Map<string, { type: StockMovementKind; quantity: number; unitCost: number | null }[]>();
  for (const m of inMovements) {
    const arr = movementsByItem.get(m.stockItemId) ?? [];
    arr.push({ type: m.type as StockMovementKind, quantity: m.quantity, unitCost: num(m.unitCost) });
    movementsByItem.set(m.stockItemId, arr);
  }
  const valuation = stockValuation(stockItems, movementsByItem);
  const maintenanceByMonth = maintenanceCostByMonth(
    maintenance.map((m) => ({ date: m.date, cost: num(m.cost), status: m.status })),
    from,
    to,
  );

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    totals: {
      assetCount: byStatus.reduce((s, g) => s + g._count._all, 0),
      assetValue: assetValueByStatus.reduce((s, g) => s + g.value, 0),
      maintenanceCost: maintenanceByMonth.reduce((s, m) => s + m.cost, 0),
      stockValue: valuation.totalValue,
      stockItems: stockItems.length,
      lowStockCount: stockItems.filter(isLowStock).length,
    },
    assetValueByCategory,
    assetValueByStatus,
    maintenanceByMonth,
    stockValuation: valuation,
    lowStock: stockItems.filter(isLowStock).map((i) => ({ ...i, isLow: true })),
  };
}
