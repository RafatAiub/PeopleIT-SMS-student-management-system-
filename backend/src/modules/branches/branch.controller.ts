import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../utils/response';
import { ValidationError } from '../../utils/AppError';
import * as service from './branch.service';
import { resolveBranchScope } from './branch.scope';
import type { BranchQueryDtoType } from './branch.dto';

function tenantOf(req: Request): string {
  if (!req.tenantId) throw new ValidationError('Select an institution first — branches are tenant-scoped.');
  return req.tenantId;
}

export async function listBranches(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const institutionId = tenantOf(req);
    const selected = await resolveBranchScope(req);
    const result = await service.listBranches(institutionId, req.query as unknown as BranchQueryDtoType, selected);
    res.status(200).json({
      success: true,
      message: 'Success',
      data: result.items,
      meta: result.meta,
      selectedBranchId: result.selectedBranchId,
    });
  } catch (error) {
    next(error);
  }
}

export async function getCurrentBranch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const institutionId = tenantOf(req);
    const selected = await resolveBranchScope(req);
    successResponse(res, await service.getCurrentBranch(institutionId, selected));
  } catch (error) {
    next(error);
  }
}

export async function getBranch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await service.getBranch(tenantOf(req), req.params.id));
  } catch (error) {
    next(error);
  }
}

export async function createBranch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await service.createBranch(tenantOf(req), req.body), 'Branch created', 201);
  } catch (error) {
    next(error);
  }
}

export async function updateBranch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await service.updateBranch(tenantOf(req), req.params.id, req.body), 'Branch updated');
  } catch (error) {
    next(error);
  }
}

export async function deleteBranch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.deleteBranch(tenantOf(req), req.params.id);
    successResponse(res, null, 'Branch deleted');
  } catch (error) {
    next(error);
  }
}
