import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { successResponse, paginatedResponse } from '../../utils/response';
import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';
import * as notificationRepository from './notifications.repository';

// Custom Notifications — an admin broadcasts an in-app notification to a
// group of users. Mounted under /api/v1/notifications/custom by
// notifications.routes.ts (which already applies authenticate + setTenant).
const router = Router();

router.use(requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN));

const TARGET_ROLES: Record<string, UserRole[] | null> = {
  ALL: null,
  STUDENT: [UserRole.STUDENT],
  GUARDIAN: [UserRole.GUARDIAN],
  TEACHER: [UserRole.TEACHER],
  STAFF: [UserRole.ACCOUNTANT, UserRole.LIBRARIAN, UserRole.TRANSPORT_OFFICER, UserRole.MANAGEMENT],
};

const SendBody = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  body: z.string().trim().min(1, 'Message is required').max(5000),
  target: z.enum(['ALL', 'STUDENT', 'GUARDIAN', 'TEACHER', 'STAFF']),
});
const ListQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
});
const IdParam = z.object({ id: z.string().min(1) });

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };

router.get(
  '/',
  validate({ query: ListQuery }),
  wrap(async (req, res) => {
    const { page, pageSize } = req.query as unknown as z.infer<typeof ListQuery>;
    const where = { institutionId: req.tenantId! };
    const [items, total] = await prisma.$transaction([
      prisma.notificationBroadcast.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.notificationBroadcast.count({ where }),
    ]);
    paginatedResponse(res, items, total, page, pageSize);
  }),
);

router.post(
  '/',
  auditLog,
  validate({ body: SendBody }),
  wrap(async (req, res) => {
    const institutionId = req.tenantId!;
    const { title, body, target } = req.body as z.infer<typeof SendBody>;
    const roles = TARGET_ROLES[target];

    const recipients = await prisma.user.findMany({
      where: {
        institutionId,
        isActive: true,
        id: { not: req.user!.sub },
        ...(roles ? { role: { in: roles } } : {}),
      },
      select: { id: true },
    });

    const broadcast = await prisma.notificationBroadcast.create({
      data: { institutionId, title, body, target, sentByUserId: req.user!.sub, recipientCount: recipients.length },
    });

    await notificationRepository.createMany(
      recipients.map((r) => ({
        institutionId,
        recipientUserId: r.id,
        type: 'CUSTOM',
        title,
        body,
        data: { broadcastId: broadcast.id },
      })),
    );

    logger.info('Custom notification sent', { institutionId, broadcastId: broadcast.id, recipients: recipients.length });
    successResponse(res, broadcast, `Notification sent to ${recipients.length} user(s)`, 201);
  }),
);

// Deleting a broadcast also withdraws it from every recipient's inbox.
router.delete(
  '/:id',
  auditLog,
  validate({ params: IdParam }),
  wrap(async (req, res) => {
    const institutionId = req.tenantId!;
    const broadcast = await prisma.notificationBroadcast.findFirst({
      where: { id: req.params.id, institutionId },
      select: { id: true },
    });
    if (!broadcast) {
      res.status(404).json({ success: false, message: 'Notification not found' });
      return;
    }
    await prisma.$transaction([
      prisma.notification.deleteMany({
        where: { institutionId, type: 'CUSTOM', data: { path: ['broadcastId'], equals: broadcast.id } },
      }),
      prisma.notificationBroadcast.delete({ where: { id: broadcast.id } }),
    ]);
    successResponse(res, null, 'Notification deleted');
  }),
);

export default router;
