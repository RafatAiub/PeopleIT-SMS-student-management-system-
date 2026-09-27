import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import {
  AllocateAssetDto,
  AllocationQueryDto,
  AssetQueryDto,
  CategoryDto,
  CategoryQueryDto,
  CompleteMaintenanceDto,
  CreateAssetDto,
  CreateMaintenanceDto,
  CreatePurchaseDto,
  CreateStockItemDto,
  IdParamDto,
  MaintenanceQueryDto,
  MovementQueryDto,
  PurchaseQueryDto,
  ReportQueryDto,
  ReturnAssetDto,
  StockMovementDto,
  StockQueryDto,
  UpdateAssetDto,
  UpdateMaintenanceDto,
  UpdateStockItemDto,
} from './inventory.dto';
import * as c from './inventory.controller';

// Mount: app.use('/api/v1/inventory', inventoryRouter)
//
// Roles: SUPER_ADMIN / ADMIN manage everything; ACCOUNTANT has read-only
// access (lists, reports, export). There is no dedicated store-keeper role in
// UserRole — if one is added later, grant it MANAGE here.
const router = Router();

router.use(authenticate, setTenant, auditLog);

const MANAGE = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN);
const READ = requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT);
const id = validate({ params: IdParamDto });

// Categories (shared by assets and stock items)
router.get('/categories', READ, validate({ query: CategoryQueryDto }), c.listCategories);
router.post('/categories', MANAGE, validate({ body: CategoryDto }), c.createCategory);
router.put('/categories/:id', MANAGE, id, validate({ body: CategoryDto }), c.updateCategory);
router.delete('/categories/:id', MANAGE, id, c.deleteCategory);

// Staff picker for allocations (declared before /assets/:id)
router.get('/staff-options', MANAGE, c.staffOptions);

// Assets
router.get('/assets/export', READ, validate({ query: AssetQueryDto }), c.exportAssets);
router.get('/assets', READ, validate({ query: AssetQueryDto }), c.listAssets);
router.post('/assets', MANAGE, validate({ body: CreateAssetDto }), c.createAsset);
router.get('/assets/:id', READ, id, c.getAsset);
router.put('/assets/:id', MANAGE, id, validate({ body: UpdateAssetDto }), c.updateAsset);
router.delete('/assets/:id', MANAGE, id, c.deleteAsset);
router.post('/assets/:id/allocate', MANAGE, id, validate({ body: AllocateAssetDto }), c.allocateAsset);
router.post('/assets/:id/return', MANAGE, id, validate({ body: ReturnAssetDto }), c.returnAsset);
router.get('/allocations', READ, validate({ query: AllocationQueryDto }), c.listAllocations);

// Maintenance
router.get('/maintenance', READ, validate({ query: MaintenanceQueryDto }), c.listMaintenance);
router.post('/maintenance', MANAGE, validate({ body: CreateMaintenanceDto }), c.createMaintenance);
router.put('/maintenance/:id', MANAGE, id, validate({ body: UpdateMaintenanceDto }), c.updateMaintenance);
router.post('/maintenance/:id/complete', MANAGE, id, validate({ body: CompleteMaintenanceDto }), c.completeMaintenance);
router.delete('/maintenance/:id', MANAGE, id, c.deleteMaintenance);

// Stock
router.get('/stock/low', READ, validate({ query: StockQueryDto }), c.listLowStock);
router.get('/stock/movements', READ, validate({ query: MovementQueryDto }), c.listMovements);
router.get('/stock', READ, validate({ query: StockQueryDto }), c.listStockItems);
router.post('/stock', MANAGE, validate({ body: CreateStockItemDto }), c.createStockItem);
router.put('/stock/:id', MANAGE, id, validate({ body: UpdateStockItemDto }), c.updateStockItem);
router.delete('/stock/:id', MANAGE, id, c.deleteStockItem);
router.post('/stock/:id/movements', MANAGE, id, validate({ body: StockMovementDto }), c.recordMovement);

// Purchases
router.get('/purchases', READ, validate({ query: PurchaseQueryDto }), c.listPurchases);
router.post('/purchases', MANAGE, validate({ body: CreatePurchaseDto }), c.createPurchase);
router.get('/purchases/:id', READ, id, c.getPurchase);
router.delete('/purchases/:id', MANAGE, id, c.deletePurchase);

// Reports
router.get('/reports', READ, validate({ query: ReportQueryDto }), c.getReports);

export default router;
