import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../utils/response';
import { BadRequestError } from '../../utils/AppError';
import * as service from './qr.service';
import type { QrCheckInsQueryDtoType, QrTokensQueryDtoType } from './qr.dto';

function tenantOf(req: Request): string {
  if (!req.tenantId) throw new BadRequestError('Select an institution first (X-Institution-Id header)');
  return req.tenantId;
}

export async function listTokens(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await service.listTokens(tenantOf(req), req.query as unknown as QrTokensQueryDtoType));
  } catch (error) {
    next(error);
  }
}

export async function getMyToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await service.getMyToken(tenantOf(req), req.user!));
  } catch (error) {
    next(error);
  }
}

export async function scan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.scan(tenantOf(req), req.user!.sub, req.body);
    successResponse(res, result, result.duplicate ? 'Already scanned in the last 5 minutes' : 'Check-in recorded');
  } catch (error) {
    next(error);
  }
}

export async function listCheckIns(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await service.listCheckIns(tenantOf(req), req.query as unknown as QrCheckInsQueryDtoType));
  } catch (error) {
    next(error);
  }
}
