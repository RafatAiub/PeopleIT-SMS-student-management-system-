import { Request, Response, NextFunction } from 'express';
import * as staffService from './staff.service';
import { successResponse, paginatedResponse } from '../../utils/response';

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>): Handler => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};

export const listRoles = wrap(async (req, res) => {
  successResponse(res, await staffService.listRoles(req.tenantId!, req.query.search as string | undefined));
});

export const getRole = wrap(async (req, res) => {
  successResponse(res, await staffService.getRole(req.tenantId!, req.params.id));
});

export const createRole = wrap(async (req, res) => {
  successResponse(res, await staffService.createRole(req.tenantId!, req.body), 'Role created successfully', 201);
});

export const updateRole = wrap(async (req, res) => {
  successResponse(res, await staffService.updateRole(req.tenantId!, req.params.id, req.body), 'Role updated successfully');
});

export const deleteRole = wrap(async (req, res) => {
  await staffService.deleteRole(req.tenantId!, req.params.id);
  successResponse(res, null, 'Role deleted successfully');
});

export const listStaff = wrap(async (req, res) => {
  const query = req.query as unknown as { page: number; pageSize: number; search?: string };
  const { staff, total } = await staffService.listStaff(req.tenantId!, query);
  paginatedResponse(res, staff, total, query.page, query.pageSize);
});

export const createStaff = wrap(async (req, res) => {
  successResponse(res, await staffService.createStaff(req.tenantId!, req.body), 'Staff member created successfully', 201);
});

export const updateStaff = wrap(async (req, res) => {
  successResponse(res, await staffService.updateStaff(req.tenantId!, req.params.id, req.body), 'Staff member updated successfully');
});

export const deleteStaff = wrap(async (req, res) => {
  await staffService.deleteStaff(req.tenantId!, req.params.id);
  successResponse(res, null, 'Staff member removed successfully');
});
