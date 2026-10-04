import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../utils/response';
import { ValidationError } from '../../utils/AppError';
import * as service from './customFields.service';

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>): Handler =>
  async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };

function tenant(req: Request): string {
  if (!req.tenantId) throw new ValidationError('Select an institution first');
  return req.tenantId;
}

export const list = wrap(async (req, res) => {
  const { entity } = req.query as { entity?: string };
  successResponse(res, await service.listDefinitions(tenant(req), entity ?? 'STUDENT'));
});

export const create = wrap(async (req, res) => {
  successResponse(res, await service.createDefinition(tenant(req), req.body), 'Custom field created', 201);
});

export const update = wrap(async (req, res) => {
  successResponse(res, await service.updateDefinition(tenant(req), req.params.id, req.body), 'Custom field updated');
});

export const remove = wrap(async (req, res) => {
  await service.deleteDefinition(tenant(req), req.params.id);
  successResponse(res, null, 'Custom field deleted');
});

export const reorder = wrap(async (req, res) => {
  successResponse(res, await service.reorderDefinitions(tenant(req), req.body.ids), 'Order saved');
});
