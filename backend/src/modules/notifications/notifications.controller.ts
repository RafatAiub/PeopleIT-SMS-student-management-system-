import { Request, Response, NextFunction } from 'express';
import * as notificationsService from './notifications.service';
import { successResponse, paginatedResponse } from '../../utils/response';
import { BadRequestError } from '../../utils/AppError';

// Preferences and templates are per-institution. A SUPER_ADMIN has no tenant of
// their own (User.institutionId is null), so these endpoints need a concrete
// institution context — surface that as a clean 400 rather than letting a
// `where: { institutionId: undefined }` reach Prisma as a 500.
function requireTenant(req: Request): string {
  if (!req.tenantId) {
    throw new BadRequestError('This endpoint requires an institution context.');
  }
  return req.tenantId;
}

export async function listMyNotifications(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { notifications, total, unreadCount } = await notificationsService.listMine(
      req.tenantId,
      req.user!.sub,
      req.query as never,
    );
    paginatedResponse(
      res,
      notifications,
      total,
      Number(req.query.page) || 1,
      Number(req.query.pageSize) || 20,
      'Success',
      { unreadCount },
    );
  } catch (error) {
    next(error);
  }
}

export async function markNotificationRead(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await notificationsService.markRead(req.tenantId, req.user!.sub, req.params.id);
    successResponse(res, result, 'Notification marked as read');
  } catch (error) {
    next(error);
  }
}

export async function markAllNotificationsRead(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await notificationsService.markAllRead(req.tenantId, req.user!.sub);
    successResponse(res, result, 'All notifications marked as read');
  } catch (error) {
    next(error);
  }
}

export async function getMyPreferences(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const prefs = await notificationsService.listPreferences(requireTenant(req), req.user!.sub);
    successResponse(res, prefs);
  } catch (error) {
    next(error);
  }
}

export async function updateMyPreferences(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const prefs = await notificationsService.updatePreferences(
      requireTenant(req),
      req.user!.sub,
      req.body.preferences,
    );
    successResponse(res, prefs, 'Notification preferences updated');
  } catch (error) {
    next(error);
  }
}

export async function listTemplates(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const templates = await notificationsService.listTemplates(requireTenant(req));
    successResponse(res, templates);
  } catch (error) {
    next(error);
  }
}

export async function upsertTemplate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const saved = await notificationsService.upsertTemplate(
      requireTenant(req),
      req.params.key as never,
      req.params.channel as never,
      req.body,
    );
    successResponse(res, saved, 'Notification template saved');
  } catch (error) {
    next(error);
  }
}

export async function sendTestNotification(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await notificationsService.sendTest(
      requireTenant(req),
      req.user!.sub,
      req.body.type,
      req.body.channel,
    );
    successResponse(res, result, 'Test notification queued');
  } catch (error) {
    next(error);
  }
}
