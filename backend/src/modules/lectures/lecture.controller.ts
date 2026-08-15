import { Request, Response, NextFunction } from 'express';
import * as lectureService from './lecture.service';
import { successResponse, paginatedResponse } from '../../utils/response';

export async function createMaterial(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await lectureService.createMaterial(
      req.tenantId!,
      { sub: req.user!.sub, role: req.user!.role },
      req.body,
    );
    successResponse(res, result, 'Lecture material added successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function updateMaterial(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await lectureService.updateMaterial(
      req.tenantId!,
      { sub: req.user!.sub, role: req.user!.role },
      req.params.id,
      req.body,
    );
    successResponse(res, result, 'Lecture material updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteMaterial(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await lectureService.deleteMaterial(
      req.tenantId!,
      { sub: req.user!.sub, role: req.user!.role },
      req.params.id,
    );
    successResponse(res, null, 'Lecture material deleted successfully');
  } catch (error) {
    next(error);
  }
}

export async function getMaterial(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await lectureService.getMaterial(req.tenantId!, req.params.id);
    successResponse(res, result, 'Lecture material fetched successfully');
  } catch (error) {
    next(error);
  }
}

export async function listMaterials(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as any;
    const { materials, total } = await lectureService.listMaterials(req.tenantId!, query);
    paginatedResponse(res, materials, total, query.page, query.pageSize, 'Lecture materials fetched successfully');
  } catch (error) {
    next(error);
  }
}

export async function getMyMaterials(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;
    const { materials, total } = await lectureService.getMyMaterials(
      req.tenantId!,
      { sub: req.user!.sub, role: req.user!.role },
      { ...req.query, page, pageSize } as any,
    );
    paginatedResponse(res, materials, total, page, pageSize, 'Lecture materials fetched successfully');
  } catch (error) {
    next(error);
  }
}
