import { Request, Response, NextFunction } from 'express';
import { successResponse, paginatedResponse } from '../../utils/response';
import * as service from './email.admin.service';
import type { AddSuppressionDtoType, EmailLogsQueryDtoType, RemoveSuppressionDtoType, SuppressionQueryDtoType, TestSendDtoType } from './email.admin.dto';

type Handler = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};

export const getStatus = wrap(async (_req, res) => successResponse(res, await service.getStatus()));

export const listLogs = wrap(async (req, res) => {
  const q = req.query as unknown as EmailLogsQueryDtoType;
  const { items, total } = await service.listLogs(q);
  return paginatedResponse(res, items, total, q.page, q.pageSize);
});

export const listSuppressions = wrap(async (req, res) => {
  const q = req.query as unknown as SuppressionQueryDtoType;
  const { items, total } = await service.listSuppressions(q);
  return paginatedResponse(res, items, total, q.page, q.pageSize);
});

export const addSuppression = wrap(async (req, res) =>
  successResponse(res, await service.addSuppression(req.body as AddSuppressionDtoType), 'Suppressed', 201),
);

export const removeSuppression = wrap(async (req, res) =>
  successResponse(res, await service.removeSuppression(req.query as unknown as RemoveSuppressionDtoType), 'Removed'),
);

export const testSend = wrap(async (req, res) => successResponse(res, await service.testSend((req.body as TestSendDtoType).to), 'Test email dispatched'));

export const listTemplates = wrap(async (_req, res) => successResponse(res, service.listTemplates()));

export const previewTemplate = wrap(async (req, res) => successResponse(res, service.previewTemplate(String(req.query.key ?? ''))));
