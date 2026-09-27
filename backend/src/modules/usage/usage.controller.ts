import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../utils/response';
import { mapSchemaError } from '../../utils/schemaMissing';
import * as service from './usage.service';
import type { UsageSummaryQuery } from './usage.dto';

export async function tenantSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = req.query as unknown as UsageSummaryQuery;
    successResponse(res, await service.tenantSummary(req.tenantId!, q.month));
  } catch (error) {
    next(mapSchemaError(error));
  }
}

export async function platformSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = req.query as unknown as UsageSummaryQuery;
    successResponse(res, await service.platformSummary(q.month));
  } catch (error) {
    next(mapSchemaError(error));
  }
}
