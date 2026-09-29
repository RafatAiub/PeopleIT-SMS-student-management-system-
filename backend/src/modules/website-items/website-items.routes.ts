import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { UserRole, WebsiteItemType } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware';
import { setTenant } from '../../middleware/tenant.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { successResponse } from '../../utils/response';
import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../utils/AppError';

// Public-website content lists: Sliders, Gallery (Photos/Videos),
// Educational Program and FAQs. One table, one CRUD API, keyed by `type`.
// Mounted at /api/v1/website-items. No auditLog: it stores req.body verbatim,
// which here can be a multi-megabyte image data URL.
const router = Router();

router.use(authenticate, setTenant, requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN));

const TypeQuery = z.object({ type: z.nativeEnum(WebsiteItemType) });
const IdParam = z.object({ id: z.string().min(1) });
const ItemBody = z.object({
  type: z.nativeEnum(WebsiteItemType),
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  // Uploaded images arrive as data:image/* URLs; videos as http(s) links.
  // Anything else (e.g. javascript:) is rejected — these render as <a>/<img>
  // on the public website.
  mediaUrl: z
    .string()
    .max(3_000_000)
    .refine((v) => /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(v) || /^https?:\/\//i.test(v), 'Invalid media URL')
    .optional()
    .nullable(),
  linkUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || /^https?:\/\//i.test(v) || /^\/(?!\/)/.test(v), 'Link must start with http(s):// or /')
    .optional()
    .nullable(),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
  isActive: z.boolean().default(true),
});

const select = {
  id: true,
  type: true,
  title: true,
  description: true,
  mediaUrl: true,
  linkUrl: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
} as const;

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };

async function assertOwned(institutionId: string, id: string) {
  const item = await prisma.websiteItem.findFirst({ where: { id, institutionId }, select: { id: true } });
  if (!item) throw new NotFoundError(`Item with ID '${id}' not found`);
}

router.get(
  '/',
  validate({ query: TypeQuery }),
  wrap(async (req, res) => {
    const { type } = req.query as unknown as z.infer<typeof TypeQuery>;
    const items = await prisma.websiteItem.findMany({
      where: { institutionId: req.tenantId!, type },
      select,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    successResponse(res, items);
  }),
);

router.post(
  '/',
  validate({ body: ItemBody }),
  wrap(async (req, res) => {
    const item = await prisma.websiteItem.create({ data: { ...req.body, institutionId: req.tenantId! }, select });
    successResponse(res, item, 'Saved successfully', 201);
  }),
);

router.put(
  '/:id',
  validate({ params: IdParam, body: ItemBody.omit({ type: true }) }),
  wrap(async (req, res) => {
    await assertOwned(req.tenantId!, req.params.id);
    const item = await prisma.websiteItem.update({ where: { id: req.params.id }, data: req.body, select });
    successResponse(res, item, 'Updated successfully');
  }),
);

router.delete(
  '/:id',
  validate({ params: IdParam }),
  wrap(async (req, res) => {
    await assertOwned(req.tenantId!, req.params.id);
    await prisma.websiteItem.delete({ where: { id: req.params.id } });
    successResponse(res, null, 'Deleted successfully');
  }),
);

export default router;
