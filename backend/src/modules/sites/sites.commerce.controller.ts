import { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { successResponse, paginatedResponse } from '../../utils/response';
import { mapSitesError } from './sites.config';
import * as commerce from './sites.commerce.service';
import { assertTenant, type SitesCtx } from './sites.service';
import type { CallbackKind } from '../fees/online/onlinePayment.service';

// =============================================================================
// Sites commerce controllers — thin: parse the request, call the service,
// respond. Errors go through next(). Mirrors sites.controller.ts's shape.
// =============================================================================

type Handler = (req: Request, res: Response) => Promise<unknown>;

const wrap = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(mapSitesError(error));
  }
};

const ctxOf = (req: Request): SitesCtx => ({
  institutionId: assertTenant(req.tenantId),
  userId: req.user!.sub,
  role: req.user!.role,
});

const q = (req: Request) => req.query as any;
const paged = (res: Response, r: { items: unknown[]; total: number }, req: Request, extra?: Record<string, unknown>) =>
  paginatedResponse(res, r.items, r.total, Number(q(req).page ?? 1), Number(q(req).pageSize ?? r.items.length ?? 20), 'Success', extra);

const previewOf = (req: Request): string | undefined =>
  (typeof req.query.preview === 'string' ? req.query.preview : undefined) ??
  (typeof req.headers['x-site-preview'] === 'string' ? (req.headers['x-site-preview'] as string) : undefined);

function cache(res: Response, preview: boolean, seconds = 60) {
  res.setHeader('Cache-Control', preview ? 'private, no-store' : `public, max-age=${seconds}, stale-while-revalidate=${seconds * 5}`);
}

// ── Admin: products ──────────────────────────────────────────────────────────

export const listProducts = wrap(async (req, res) => paged(res, await commerce.listProducts(ctxOf(req), q(req)), req));
export const createProduct = wrap(async (req, res) => successResponse(res, await commerce.createProduct(ctxOf(req), req.body), 'Product created', 201));
export const getProduct = wrap(async (req, res) => successResponse(res, await commerce.getProduct(ctxOf(req), req.params.id)));
export const updateProduct = wrap(async (req, res) => successResponse(res, await commerce.updateProduct(ctxOf(req), req.params.id, req.body), 'Product saved'));
export const deleteProduct = wrap(async (req, res) => successResponse(res, await commerce.deleteProduct(ctxOf(req), req.params.id), 'Product deleted'));

// ── Admin: orders ────────────────────────────────────────────────────────────

export const listOrders = wrap(async (req, res) => paged(res, await commerce.listOrders(ctxOf(req), q(req)), req));
export const getOrder = wrap(async (req, res) => successResponse(res, await commerce.getOrder(ctxOf(req), req.params.id)));
export const updateOrder = wrap(async (req, res) => successResponse(res, await commerce.updateOrder(ctxOf(req), req.params.id, req.body), 'Order updated'));

// ── Admin: customers ─────────────────────────────────────────────────────────

export const listCustomers = wrap(async (req, res) => paged(res, await commerce.listCustomers(ctxOf(req), q(req)), req));

// ── Admin: summary ───────────────────────────────────────────────────────────

export const commerceSummary = wrap(async (req, res) => successResponse(res, await commerce.commerceSummary(ctxOf(req))));

// ── Public: catalogue ────────────────────────────────────────────────────────

export const publicProducts = wrap(async (req, res) => {
  const r = await commerce.listPublicProducts(req.params.siteId, { ...q(req), preview: previewOf(req) });
  cache(res, r.preview);
  paged(res, r, req);
});
export const publicProduct = wrap(async (req, res) => {
  const r = await commerce.getPublicProduct(req.params.siteId, req.params.slug, previewOf(req));
  cache(res, r.preview);
  successResponse(res, r.product);
});
export const checkoutOptions = wrap(async (req, res) => {
  cache(res, false, 30);
  successResponse(res, await commerce.checkoutOptions(req.params.siteId));
});

// ── Public: customer account ─────────────────────────────────────────────────

export const registerAccount = wrap(async (req, res) => successResponse(res, await commerce.registerCustomer(req.params.siteId, req.body), 'Account created', 201));
export const loginAccount = wrap(async (req, res) => successResponse(res, await commerce.loginCustomer(req.params.siteId, req.body)));
// Always the same success response regardless of whether the address has an
// account — the service itself decides whether to actually send anything, so
// this endpoint cannot be used to enumerate registered emails.
export const forgotPassword = wrap(async (req, res) => successResponse(res, await commerce.forgotPassword(req.params.siteId, req.body.email), 'If that account exists, a reset link has been sent'));
export const resetPassword = wrap(async (req, res) => successResponse(res, await commerce.resetPassword(req.params.siteId, req.body.token, req.body.password), 'Password reset'));
export const accountMe = wrap(async (req, res) => successResponse(res, await commerce.accountMe(req.params.siteId, req.headers.authorization)));
export const accountOrders = wrap(async (req, res) => successResponse(res, await commerce.accountOrders(req.params.siteId, req.headers.authorization)));

// ── Public: orders + payment ─────────────────────────────────────────────────

export const createOrder = wrap(async (req, res) =>
  successResponse(res, await commerce.createOrder(req.params.siteId, req.body, req.headers.authorization), 'Order placed', 201),
);
export const getPublicOrder = wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  successResponse(
    res,
    await commerce.getPublicOrder(req.params.siteId, req.params.orderNo, { email: q(req).email, authHeader: req.headers.authorization }),
  );
});
export const demoPay = wrap(async (req, res) => successResponse(res, await commerce.demoPay(req.params.siteId, req.params.orderNo, req.body)));

// ── Public: gateway callbacks ─────────────────────────────────────────────────
// Never throws to the client — always redirects (or 200s an IPN) so the
// gateway's server-to-server call and the buyer's browser both land somewhere.

export async function payCallback(req: Request, res: Response): Promise<void> {
  const gateway = String(req.params.gateway ?? '');
  const kind = req.params.kind as CallbackKind;
  const payload = { ...(req.query as Record<string, unknown>), ...((req.body as Record<string, unknown>) ?? {}) };

  let redirectTo = `${env.FRONTEND_URL}/?payment=failed`;
  try {
    redirectTo = await commerce.handleGatewayCallback(gateway, kind, payload);
  } catch (error) {
    logger.error('Unhandled error while processing a site-order gateway callback', {
      gateway,
      kind,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (kind === 'ipn') {
    res.status(200).json({ success: true });
    return;
  }
  res.redirect(303, redirectTo);
}
