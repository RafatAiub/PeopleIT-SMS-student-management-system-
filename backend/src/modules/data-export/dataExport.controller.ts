import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../utils/response';
import { mapSchemaError } from '../../utils/schemaMissing';
import * as service from './dataExport.service';
import type { ListExportsQuery } from './dataExport.dto';

type Handler = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(mapSchemaError(error));
  }
};

export const list = wrap(async (req, res) => {
  const q = req.query as unknown as ListExportsQuery;
  successResponse(res, await service.listJobs(req.tenantId!, q.page, q.pageSize));
});

export const request = wrap(async (req, res) => {
  successResponse(res, await service.requestExport(req.tenantId!, req.user!.sub), 'Export requested — it will be ready in a few minutes', 202);
});

export const get = wrap(async (req, res) => {
  successResponse(res, await service.getJob(req.tenantId!, req.params.id));
});

export const download = wrap(async (req, res) => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
  const { file, downloadName } = await service.openDownload(req.tenantId!, req.params.id, req.user!.sub, {
    ip: ip ?? undefined,
    userAgent: req.headers['user-agent'],
  });
  res.setHeader('Cache-Control', 'no-store');
  await new Promise<void>((resolve, reject) => {
    res.download(file, downloadName, (err) => (err && !res.headersSent ? reject(err) : resolve()));
  });
});
