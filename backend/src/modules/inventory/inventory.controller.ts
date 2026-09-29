import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../utils/response';
import * as service from './inventory.service';

type Handler = (req: Request, res: Response) => Promise<unknown>;

/** Wraps a service call: 200/201 JSON via successResponse, errors to next(). */
function handle(fn: Handler, message: string, status = 200) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await fn(req, res);
      successResponse(res, data, message, status);
    } catch (error) {
      next(error);
    }
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const q = (req: Request) => req.query as any;
const tid = (req: Request) => req.tenantId!;
const uid = (req: Request) => req.user!.sub;

// Categories
export const listCategories = handle((req) => service.listCategories(tid(req), q(req)), 'Categories fetched');
export const createCategory = handle((req) => service.createCategory(tid(req), req.body.name), 'Category created', 201);
export const updateCategory = handle((req) => service.updateCategory(tid(req), req.params.id, req.body.name), 'Category updated');
export const deleteCategory = handle((req) => service.deleteCategory(tid(req), req.params.id), 'Category deleted');

// Assets
export const listAssets = handle((req) => service.listAssets(tid(req), q(req)), 'Assets fetched');
export const getAsset = handle((req) => service.getAsset(tid(req), req.params.id), 'Asset fetched');
export const createAsset = handle((req) => service.createAsset(tid(req), req.body), 'Asset created', 201);
export const updateAsset = handle((req) => service.updateAsset(tid(req), req.params.id, req.body), 'Asset updated');
export const deleteAsset = handle((req) => service.deleteAsset(tid(req), req.params.id), 'Asset deleted');
export const allocateAsset = handle((req) => service.allocateAsset(tid(req), req.params.id, req.body), 'Asset allocated', 201);
export const returnAsset = handle((req) => service.returnAsset(tid(req), req.params.id, req.body), 'Asset returned');
export const listAllocations = handle((req) => service.listAllocations(tid(req), q(req)), 'Allocations fetched');
export const staffOptions = handle(
  (req) => service.listStaffOptions(tid(req), typeof req.query.search === 'string' ? req.query.search.slice(0, 100) : undefined),
  'Staff fetched',
);

export async function exportAssets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const csv = await service.exportAssetRegister(tid(req), q(req));
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="asset-register-${stamp}.csv"`);
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
}

// Maintenance
export const listMaintenance = handle((req) => service.listMaintenance(tid(req), q(req)), 'Maintenance records fetched');
export const createMaintenance = handle((req) => service.createMaintenance(tid(req), req.body), 'Maintenance scheduled', 201);
export const updateMaintenance = handle((req) => service.updateMaintenance(tid(req), req.params.id, req.body), 'Maintenance updated');
export const completeMaintenance = handle((req) => service.completeMaintenance(tid(req), req.params.id, req.body), 'Maintenance completed');
export const deleteMaintenance = handle((req) => service.deleteMaintenance(tid(req), req.params.id), 'Maintenance deleted');

// Stock
export const listStockItems = handle((req) => service.listStockItems(tid(req), q(req)), 'Stock items fetched');
export const listLowStock = handle((req) => service.listLowStock(tid(req), q(req)), 'Low-stock items fetched');
export const createStockItem = handle((req) => service.createStockItem(tid(req), uid(req), req.body), 'Stock item created', 201);
export const updateStockItem = handle((req) => service.updateStockItem(tid(req), req.params.id, req.body), 'Stock item updated');
export const deleteStockItem = handle((req) => service.deleteStockItem(tid(req), req.params.id), 'Stock item deleted');
export const recordMovement = handle((req) => service.recordMovement(tid(req), uid(req), req.params.id, req.body), 'Stock movement recorded', 201);
export const listMovements = handle((req) => service.listMovements(tid(req), q(req)), 'Stock movements fetched');

// Purchases
export const listPurchases = handle((req) => service.listPurchases(tid(req), q(req)), 'Purchases fetched');
export const getPurchase = handle((req) => service.getPurchase(tid(req), req.params.id), 'Purchase fetched');
export const createPurchase = handle((req) => service.createPurchase(tid(req), uid(req), req.body), 'Purchase recorded', 201);
export const deletePurchase = handle((req) => service.deletePurchase(tid(req), req.params.id), 'Purchase deleted');

// Reports
export const getReports = handle((req) => service.getReports(tid(req), q(req)), 'Inventory reports generated');
