import { Request, Response, NextFunction } from 'express';
import * as institutionService from './institution.service';
import { successResponse, paginatedResponse } from '../../utils/response';

export async function getWebsiteConfig(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const config = await institutionService.getWebsiteConfig(req.tenantId!);
    successResponse(res, config);
  } catch (error) {
    next(error);
  }
}

export async function updateWebsiteConfig(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const config = await institutionService.updateWebsiteConfig(req.tenantId!, req.body);
    successResponse(res, config, 'Website configuration updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function createInstitution(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await institutionService.createInstitution(req.body, req.user!.sub);
    successResponse(res, result, 'Institution and Admin user created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function listInstitutions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const list = await institutionService.listInstitutions();
    successResponse(res, list);
  } catch (error) {
    next(error);
  }
}

export async function updateInstitutionAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const admin = await institutionService.updateInstitutionAdmin(id, req.body, req.user!.sub);
    successResponse(res, admin, 'Administrator credentials updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function setInstitutionStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    const updated = await institutionService.setInstitutionStatus(id, Boolean(isActive), req.user!.sub);
    successResponse(res, updated, `Institution ${isActive ? 'activated' : 'suspended'} successfully`);
  } catch (error) {
    next(error);
  }
}

export async function deleteInstitution(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    await institutionService.deleteInstitution(id, req.user!.sub);
    successResponse(res, null, 'Institution deleted successfully');
  } catch (error) {
    next(error);
  }
}

export async function listPublicInstitutions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // This list changes whenever an institution is added/deactivated and is
    // fetched unauthenticated on every login page load — never let a browser
    // or intermediary cache serve a stale copy.
    res.set('Cache-Control', 'no-store');
    const list = await institutionService.listPublicInstitutions();
    successResponse(res, list);
  } catch (error) {
    next(error);
  }
}

export async function listPaginatedInstitutions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await institutionService.listPaginatedInstitutions({
      page: req.query.page,
      pageSize: req.query.pageSize,
      q: req.query.q as string,
      status: req.query.status as string,
      hideTest: req.query.hideTest !== 'false',
      sortBy: req.query.sortBy as string,
      sortOrder: req.query.sortOrder as any,
    });
    res.status(200).json({
      success: true,
      data: result.data,
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
}

export async function getGlobalMetrics(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const metrics = await institutionService.getGlobalMetrics();
    successResponse(res, metrics);
  } catch (error) {
    next(error);
  }
}

export async function startSupportSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const session = await institutionService.startSupportSession(req.user!.sub, req.body);
    successResponse(res, session, 'Support access session initiated successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function revokeSupportSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { targetUserId, institutionId } = req.body;
    const result = await institutionService.revokeSupportSession(req.user!.sub, targetUserId, institutionId);
    successResponse(res, result, 'Support access session revoked');
  } catch (error) {
    next(error);
  }
}

export async function performAdminUserAction(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await institutionService.performAdminUserAction(req.user!.sub, req.body);
    successResponse(res, result, result.message);
  } catch (error) {
    next(error);
  }
}

export async function getAuditLogs(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await institutionService.getAuditLogs({
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 15,
      action: req.query.action as string,
      search: req.query.search as string,
    });
    paginatedResponse(res, result.data, result.meta.total, result.meta.page, result.meta.pageSize, 'Audit logs retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getSystemHealth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const health = await institutionService.getSystemHealth();
    successResponse(res, health, 'System health metrics retrieved successfully');
  } catch (error) {
    next(error);
  }
}

