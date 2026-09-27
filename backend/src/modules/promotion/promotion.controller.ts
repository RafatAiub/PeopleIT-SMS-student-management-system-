import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../utils/response';
import * as promotionService from './promotion.service';
import type { BatchQueryDtoType, CandidatesQueryDtoType, PromotionHistoryQueryDtoType } from './promotion.dto';

export async function listCandidates(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await promotionService.listCandidates(req.tenantId!, req.query as unknown as CandidatesQueryDtoType);
    successResponse(res, data, 'Promotion candidates retrieved');
  } catch (error) {
    next(error);
  }
}

export async function preview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await promotionService.previewPromotion(req.tenantId!, req.body), 'Promotion preview');
  } catch (error) {
    next(error);
  }
}

export async function execute(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await promotionService.executePromotion(req.tenantId!, req.user!.sub, req.body);
    successResponse(res, data, `${data.processed} student(s) processed`, 201);
  } catch (error) {
    next(error);
  }
}

export async function listHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await promotionService.listHistory(req.tenantId!, req.query as unknown as PromotionHistoryQueryDtoType);
    successResponse(res, data, 'Promotion history retrieved');
  } catch (error) {
    next(error);
  }
}

export async function listBatches(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await promotionService.listBatches(req.tenantId!, req.query as unknown as BatchQueryDtoType);
    successResponse(res, data, 'Promotion batches retrieved');
  } catch (error) {
    next(error);
  }
}

export async function undoBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await promotionService.undoBatch(req.tenantId!, req.params.batchId);
    successResponse(res, data, `${data.reverted} student(s) reverted`);
  } catch (error) {
    next(error);
  }
}
