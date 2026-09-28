// =============================================================================
// Sites — commerce service (Website Builder v2): products, orders, customers,
// checkout, customer account, gateway callbacks. Reuses the fee-gateway
// adapters (backend/src/modules/fees/gateways/**) and onlinePayment.service's
// listGatewayModes/isDemoPaymentsAllowed — never modifies those files.
// =============================================================================

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { sendDirectMail } from '../../utils/mailer';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../utils/AppError';
import { sanitizeHtml, slugify, uniqueSlug } from './sites.logic';
import { getOrCreateSite, type SitesCtx } from './sites.service';
import { visibleSite } from './sites.public.service';
import * as repo from './sites.repository';
import { pathPreviewUrl, platformSiteDomain } from './sites.config';
import { hostOf } from './domains/hostname';
import {
  allowedReturnHosts,
  buildPaymentRedirectUrl,
  decideOrderCredit,
  generateOrderNo,
  canTransitionOrderStatus,
  orderStatusRevokesAccess,
  priceOrder,
  resolveReturnUrl,
  OrderPricingError,
  type CatalogCourse,
  type CatalogProduct,
  type SiteOrderStatusName,
} from './sites.commerce.logic';
import {
  bearerToken,
  hashPassword,
  isUnclaimedPasswordHash,
  signCustomerToken,
  unclaimedPasswordHash,
  verifyCustomerToken,
  verifyPassword,
} from './sites.customer.auth';
import { getSslCommerzConfig, isDemoPaymentsAllowed, isGatewayLive } from '../fees/gateways/config';
import { generateFeeTranId, verifySslCommerzSignature } from '../fees/gateways/verify';
import { SslCommerzFeeAdapter } from '../fees/gateways/sslcommerz.adapter';
import { BkashFeeAdapter } from '../fees/gateways/bkash.adapter';
import { NagadFeeAdapter } from '../fees/gateways/nagad.adapter';
import type { FeeGatewayAdapter, FeeGatewayName, GatewayVerifyResult } from '../fees/gateways/types';
import { listGatewayModes, type CallbackKind } from '../fees/online/onlinePayment.service';
import type {
  CreateOrderDtoType,
  CreateProductDtoType,
  CustomerQueryDtoType,
  DemoPayDtoType,
  LoginCustomerDtoType,
  OrderQueryDtoType,
  ProductQueryDtoType,
  RegisterCustomerDtoType,
  UpdateOrderDtoType,
  UpdateProductDtoType,
} from './sites.commerce.dto';

const json = (v: unknown) => v as Prisma.InputJsonValue;
const num = (v: Prisma.Decimal | null | undefined): number | null => (v == null ? null : Number(v));

const GATEWAY_LABEL: Record<FeeGatewayName, string> = { SSLCOMMERZ: 'SSLCommerz', BKASH: 'bKash', NAGAD: 'Nagad' };
const GATEWAY_SLUG: Record<FeeGatewayName, string> = { SSLCOMMERZ: 'sslcommerz', BKASH: 'bkash', NAGAD: 'nagad' };
const GATEWAY_BY_SLUG: Record<string, FeeGatewayName> = { sslcommerz: 'SSLCOMMERZ', bkash: 'BKASH', nagad: 'NAGAD' };
const ADAPTERS: Record<FeeGatewayName, FeeGatewayAdapter> = {
  SSLCOMMERZ: SslCommerzFeeAdapter,
  BKASH: BkashFeeAdapter,
  NAGAD: NagadFeeAdapter,
};

// ── Settings readers ─────────────────────────────────────────────────────────

export interface ShopSettings {
  enabled: boolean;
  currency: 'BDT';
  shippingFee: number;
  freeShippingOver: number | null;
  codEnabled: boolean;
  notifyEmails: string[];
  termsUrl: string | null;
}

export function shopSettingsOf(raw: unknown): ShopSettings {
  const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const shop = s.shop && typeof s.shop === 'object' ? (s.shop as Record<string, unknown>) : {};
  const freeOver = Number(shop.freeShippingOver);
  return {
    enabled: shop.enabled === true,
    currency: 'BDT',
    shippingFee: Number.isFinite(Number(shop.shippingFee)) ? Number(shop.shippingFee) : 0,
    freeShippingOver: shop.freeShippingOver != null && Number.isFinite(freeOver) ? freeOver : null,
    codEnabled: shop.codEnabled !== false,
    notifyEmails: Array.isArray(shop.notifyEmails) ? shop.notifyEmails.filter((e): e is string => typeof e === 'string') : [],
    termsUrl: typeof shop.termsUrl === 'string' ? shop.termsUrl : null,
  };
}

export function coursesSettingsOf(raw: unknown): { enabled: boolean } {
  const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const courses = s.courses && typeof s.courses === 'object' ? (s.courses as Record<string, unknown>) : {};
  return { enabled: courses.enabled === true };
}

// ── Admin: products ──────────────────────────────────────────────────────────

function toAdminProduct(p: {
  price: Prisma.Decimal;
  compareAtPrice: Prisma.Decimal | null;
  [k: string]: unknown;
}) {
  return { ...p, price: Number(p.price), compareAtPrice: num(p.compareAtPrice) };
}

async function resolveProductSlug(siteId: string, provided: string | undefined, name: string): Promise<string> {
  if (provided) {
    const clash = await prisma.siteProduct.findUnique({ where: { siteId_slug: { siteId, slug: provided } }, select: { id: true } });
    if (clash) throw new ConflictError(`A product with slug "${provided}" already exists`);
    return provided;
  }
  const base = slugify(name) || 'product';
  const taken = (await prisma.siteProduct.findMany({ where: { siteId, slug: { startsWith: base } }, select: { slug: true } })).map(
    (r) => r.slug,
  );
  return uniqueSlug(base, taken);
}

export async function listProducts(ctx: SitesCtx, q: ProductQueryDtoType) {
  const site = await getOrCreateSite(ctx.institutionId);
  const where: Prisma.SiteProductWhereInput = {
    institutionId: ctx.institutionId,
    siteId: site.id,
    ...(q.status ? { status: q.status } : {}),
    ...(q.category ? { category: q.category } : {}),
    ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { slug: { contains: q.q, mode: 'insensitive' } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.siteProduct.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.siteProduct.count({ where }),
  ]);
  return { items: items.map(toAdminProduct), total };
}

async function productOrThrow(ctx: SitesCtx, id: string) {
  const p = await prisma.siteProduct.findFirst({ where: { id, institutionId: ctx.institutionId } });
  if (!p) throw new NotFoundError('Product not found');
  return p;
}

export async function getProduct(ctx: SitesCtx, id: string) {
  return toAdminProduct(await productOrThrow(ctx, id));
}

export async function createProduct(ctx: SitesCtx, data: CreateProductDtoType) {
  const site = await getOrCreateSite(ctx.institutionId);
  const slug = await resolveProductSlug(site.id, data.slug, data.name);
  const last = await prisma.siteProduct.aggregate({ where: { siteId: site.id }, _max: { sortOrder: true } });
  const product = await prisma.siteProduct.create({
    data: {
      siteId: site.id,
      institutionId: ctx.institutionId,
      slug,
      name: data.name,
      nameBn: data.nameBn ?? null,
      description: sanitizeHtml(data.description),
      images: data.images,
      price: new Prisma.Decimal(data.price),
      compareAtPrice: data.compareAtPrice != null ? new Prisma.Decimal(data.compareAtPrice) : null,
      sku: data.sku ?? null,
      stock: data.stock ?? null,
      category: data.category ?? null,
      kind: data.kind,
      digitalUrl: data.digitalUrl ?? null,
      status: data.status,
      sortOrder: (last._max.sortOrder ?? 0) + 1,
    },
  });
  return toAdminProduct(product);
}

export async function updateProduct(ctx: SitesCtx, id: string, data: UpdateProductDtoType) {
  const product = await productOrThrow(ctx, id);
  const patch: Prisma.SiteProductUpdateInput = {};
  if (data.slug !== undefined && data.slug !== product.slug) {
    const clash = await prisma.siteProduct.findUnique({ where: { siteId_slug: { siteId: product.siteId, slug: data.slug } }, select: { id: true } });
    if (clash) throw new ConflictError(`A product with slug "${data.slug}" already exists`);
    patch.slug = data.slug;
  }
  if (data.name !== undefined) patch.name = data.name;
  if (data.nameBn !== undefined) patch.nameBn = data.nameBn;
  if (data.description !== undefined) patch.description = sanitizeHtml(data.description);
  if (data.images !== undefined) patch.images = data.images;
  if (data.price !== undefined) patch.price = new Prisma.Decimal(data.price);
  if (data.compareAtPrice !== undefined) patch.compareAtPrice = data.compareAtPrice == null ? null : new Prisma.Decimal(data.compareAtPrice);
  if (data.sku !== undefined) patch.sku = data.sku;
  if (data.stock !== undefined) patch.stock = data.stock;
  if (data.category !== undefined) patch.category = data.category;
  if (data.kind !== undefined) patch.kind = data.kind;
  if (data.digitalUrl !== undefined) patch.digitalUrl = data.digitalUrl;
  if (data.status !== undefined) patch.status = data.status;
  return toAdminProduct(await prisma.siteProduct.update({ where: { id: product.id }, data: patch }));
}

export async function deleteProduct(ctx: SitesCtx, id: string) {
  const product = await productOrThrow(ctx, id);
  await prisma.siteProduct.delete({ where: { id: product.id } });
  return { id: product.id };
}

// ── Admin: orders ────────────────────────────────────────────────────────────

function toAdminOrder(o: {
  subtotal: Prisma.Decimal;
  shipping: Prisma.Decimal;
  total: Prisma.Decimal;
  [k: string]: unknown;
}) {
  return { ...o, subtotal: Number(o.subtotal), shipping: Number(o.shipping), total: Number(o.total) };
}

export async function listOrders(ctx: SitesCtx, q: OrderQueryDtoType) {
  const site = await getOrCreateSite(ctx.institutionId);
  const where: Prisma.SiteOrderWhereInput = {
    institutionId: ctx.institutionId,
    siteId: site.id,
    ...(q.status ? { status: q.status } : {}),
    ...(q.q
      ? {
          OR: [
            { orderNo: { contains: q.q, mode: 'insensitive' } },
            { email: { contains: q.q, mode: 'insensitive' } },
            { customerName: { contains: q.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.siteOrder.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.siteOrder.count({ where }),
  ]);
  return { items: items.map(toAdminOrder), total };
}

async function orderOrThrow(ctx: SitesCtx, id: string) {
  const o = await prisma.siteOrder.findFirst({ where: { id, institutionId: ctx.institutionId } });
  if (!o) throw new NotFoundError('Order not found');
  return o;
}

export async function getOrder(ctx: SitesCtx, id: string) {
  return toAdminOrder(await orderOrThrow(ctx, id));
}

type OrderLine = { kind: 'PRODUCT' | 'COURSE'; refId: string; name: string; unitPrice: number; qty: number };

/** Grants access (stock/enrollments) for a newly-paid order. Idempotent per call site (only invoked once per PENDING→PAID claim). */
async function settleOrderSideEffects(
  tx: Prisma.TransactionClient,
  order: { id: string; siteId: string; institutionId: string; customerId: string | null },
  lines: OrderLine[],
) {
  for (const line of lines) {
    if (line.kind === 'PRODUCT') {
      await tx.$executeRaw`UPDATE "SiteProduct" SET stock = GREATEST(stock - ${line.qty}, 0) WHERE id = ${line.refId} AND stock IS NOT NULL`;
    } else if (order.customerId) {
      await tx.siteEnrollment.upsert({
        where: { courseId_customerId: { courseId: line.refId, customerId: order.customerId } },
        update: { status: 'ACTIVE', orderId: order.id },
        create: {
          siteId: order.siteId,
          courseId: line.refId,
          customerId: order.customerId,
          institutionId: order.institutionId,
          orderId: order.id,
          status: 'ACTIVE',
        },
      });
    }
  }
}

async function revokeOrderAccess(tx: Prisma.TransactionClient, order: { id: string }, lines: OrderLine[]) {
  for (const line of lines) {
    if (line.kind === 'PRODUCT') {
      await tx.$executeRaw`UPDATE "SiteProduct" SET stock = stock + ${line.qty} WHERE id = ${line.refId} AND stock IS NOT NULL`;
    }
  }
  await tx.siteEnrollment.updateMany({ where: { orderId: order.id, status: 'ACTIVE' }, data: { status: 'REVOKED' } });
}

export async function updateOrder(ctx: SitesCtx, id: string, data: UpdateOrderDtoType) {
  const order = await orderOrThrow(ctx, id);
  const patch: Prisma.SiteOrderUpdateInput = {};
  if (data.adminNote !== undefined) patch.adminNote = data.adminNote;
  const from = order.status as SiteOrderStatusName;
  const to = data.status as SiteOrderStatusName | undefined;
  if (to !== undefined && to !== from) {
    if (!canTransitionOrderStatus(from, to)) throw new ValidationError(`Cannot move an order from ${from} to ${to}`);
    patch.status = to;
    if ((to === 'PAID' || to === 'FULFILLED') && !order.paidAt) patch.paidAt = new Date();
  }

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.siteOrder.update({ where: { id: order.id }, data: patch });
    if (to !== undefined && to !== from) {
      const lines = ((order.items as unknown as OrderLine[]) ?? []) as OrderLine[];
      if (orderStatusRevokesAccess(to) && (from === 'PAID' || from === 'FULFILLED')) {
        await revokeOrderAccess(tx, saved, lines);
      } else if ((to === 'PAID' || to === 'FULFILLED') && from === 'PENDING') {
        // Manually marked paid by an admin (cash/bank transfer, etc.) — grant access exactly once.
        await settleOrderSideEffects(tx, saved, lines);
      }
    }
    return saved;
  });
  return toAdminOrder(updated);
}

// ── Admin: customers ─────────────────────────────────────────────────────────

export async function listCustomers(ctx: SitesCtx, q: CustomerQueryDtoType) {
  const site = await getOrCreateSite(ctx.institutionId);
  const where: Prisma.SiteCustomerWhereInput = {
    institutionId: ctx.institutionId,
    siteId: site.id,
    ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.siteCustomer.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.siteCustomer.count({ where }),
  ]);
  const ids = rows.map((r) => r.id);
  const [orderCounts, enrollCounts] = await Promise.all([
    ids.length ? prisma.siteOrder.groupBy({ by: ['customerId'], where: { customerId: { in: ids } }, _count: { _all: true } }) : [],
    ids.length
      ? prisma.siteEnrollment.groupBy({ by: ['customerId'], where: { customerId: { in: ids }, status: 'ACTIVE' }, _count: { _all: true } })
      : [],
  ]);
  const orderBy_ = new Map(orderCounts.map((o) => [o.customerId, o._count._all]));
  const enrollBy = new Map(enrollCounts.map((e) => [e.customerId, e._count._all]));
  return {
    items: rows.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      createdAt: c.createdAt,
      lastLoginAt: c.lastLoginAt,
      orderCount: orderBy_.get(c.id) ?? 0,
      enrollmentCount: enrollBy.get(c.id) ?? 0,
    })),
    total,
  };
}

// ── Admin: commerce summary ───────────────────────────────────────────────────

export async function commerceSummary(ctx: SitesCtx) {
  const site = await getOrCreateSite(ctx.institutionId);
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [products, publishedProducts, courses, publishedCourses, ordersPending, paid30, customers, enrollments] = await Promise.all([
    prisma.siteProduct.count({ where: { institutionId: ctx.institutionId, siteId: site.id } }),
    prisma.siteProduct.count({ where: { institutionId: ctx.institutionId, siteId: site.id, status: 'PUBLISHED' } }),
    prisma.siteCourse.count({ where: { institutionId: ctx.institutionId, siteId: site.id } }),
    prisma.siteCourse.count({ where: { institutionId: ctx.institutionId, siteId: site.id, status: 'PUBLISHED' } }),
    prisma.siteOrder.count({ where: { institutionId: ctx.institutionId, siteId: site.id, status: 'PENDING' } }),
    prisma.siteOrder.findMany({
      where: { institutionId: ctx.institutionId, siteId: site.id, status: { in: ['PAID', 'FULFILLED'] }, paidAt: { gte: since30 } },
      select: { total: true },
    }),
    prisma.siteCustomer.count({ where: { institutionId: ctx.institutionId, siteId: site.id } }),
    prisma.siteEnrollment.count({ where: { institutionId: ctx.institutionId, siteId: site.id, status: 'ACTIVE' } }),
  ]);
  return {
    products,
    publishedProducts,
    courses,
    publishedCourses,
    ordersPending,
    ordersPaid30d: paid30.length,
    revenue30d: paid30.reduce((sum, o) => sum + Number(o.total), 0),
    customers,
    enrollments,
    gateways: listGatewayModes(),
  };
}

// ── Public: catalogue ────────────────────────────────────────────────────────

function toPublicProduct(p: {
  id: string;
  slug: string;
  name: string;
  nameBn: string | null;
  description: string;
  images: string[];
  price: Prisma.Decimal;
  compareAtPrice: Prisma.Decimal | null;
  kind: string;
  stock: number | null;
  category: string | null;
}) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    nameBn: p.nameBn,
    description: p.description,
    images: p.images,
    price: Number(p.price),
    compareAtPrice: num(p.compareAtPrice),
    currency: 'BDT' as const,
    kind: p.kind,
    inStock: p.stock === null || p.stock > 0,
    stock: p.stock,
    category: p.category,
  };
}

export async function listPublicProducts(siteId: string, q: { category?: string; q?: string; page: number; pageSize: number; preview?: string }) {
  const { site, preview } = await visibleSite(siteId, q.preview);
  const where: Prisma.SiteProductWhereInput = {
    siteId: site.id,
    institutionId: site.institutionId,
    ...(preview ? {} : { status: 'PUBLISHED' }),
    ...(q.category ? { category: q.category } : {}),
    ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.siteProduct.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.siteProduct.count({ where }),
  ]);
  return { items: items.map(toPublicProduct), total, preview };
}

export async function getPublicProduct(siteId: string, slugParam: string, preview?: string) {
  const { site, preview: isPreview } = await visibleSite(siteId, preview);
  const product = await prisma.siteProduct.findFirst({
    where: { siteId: site.id, institutionId: site.institutionId, slug: slugParam, ...(isPreview ? {} : { status: 'PUBLISHED' }) },
  });
  if (!product) throw new NotFoundError('Product not found');
  return { product: toPublicProduct(product), preview: isPreview };
}

export async function checkoutOptions(siteId: string) {
  const { site } = await visibleSite(siteId, null);
  const shop = shopSettingsOf(site.settings);
  const courses = coursesSettingsOf(site.settings);
  const gateways = listGatewayModes()
    .filter((m) => m.available)
    .map((m) => ({ gateway: m.gateway, label: m.label, live: m.live, demo: m.demo }));
  return {
    shopEnabled: shop.enabled,
    coursesEnabled: courses.enabled,
    currency: shop.currency,
    shippingFee: shop.shippingFee,
    freeShippingOver: shop.freeShippingOver,
    codEnabled: shop.codEnabled,
    gateways,
  };
}

// ── Public: customer account ─────────────────────────────────────────────────

function toPublicCustomer(c: { id: string; name: string; email: string; phone: string | null }) {
  return { id: c.id, name: c.name, email: c.email, phone: c.phone };
}

export async function registerCustomer(siteId: string, data: RegisterCustomerDtoType) {
  const { site } = await visibleSite(siteId, null);
  const existing = await prisma.siteCustomer.findUnique({ where: { siteId_email: { siteId: site.id, email: data.email } } });
  if (existing && !isUnclaimedPasswordHash(existing.passwordHash)) {
    throw new ConflictError('An account with this email already exists — try logging in instead');
  }
  const passwordHash = await hashPassword(data.password);
  const customer = existing
    ? await prisma.siteCustomer.update({
        where: { id: existing.id },
        data: { passwordHash, name: data.name, phone: data.phone ?? existing.phone, lastLoginAt: new Date() },
      })
    : await prisma.siteCustomer.create({
        data: {
          siteId: site.id,
          institutionId: site.institutionId,
          email: data.email,
          name: data.name,
          phone: data.phone ?? null,
          passwordHash,
          lastLoginAt: new Date(),
        },
      });
  const token = signCustomerToken(customer.id, site.id);
  return { token, customer: toPublicCustomer(customer) };
}

const INVALID_LOGIN = 'Invalid email or password';

export async function loginCustomer(siteId: string, data: LoginCustomerDtoType) {
  const { site } = await visibleSite(siteId, null);
  const customer = await prisma.siteCustomer.findUnique({ where: { siteId_email: { siteId: site.id, email: data.email } } });
  if (!customer || !(await verifyPassword(data.password, customer.passwordHash))) {
    throw new UnauthorizedError(INVALID_LOGIN);
  }
  await prisma.siteCustomer.update({ where: { id: customer.id }, data: { lastLoginAt: new Date() } });
  const token = signCustomerToken(customer.id, site.id);
  return { token, customer: toPublicCustomer(customer) };
}

/** Verified customer (throws 401), scoped to this exact site. Exported for sites.lms.service.ts. */
export async function currentCustomer(siteId: string, authHeader: string | undefined) {
  const token = bearerToken(authHeader);
  const customerId = token ? verifyCustomerToken(token, siteId) : null;
  if (!customerId) throw new UnauthorizedError('Sign in to continue');
  const customer = await prisma.siteCustomer.findFirst({ where: { id: customerId, siteId } });
  if (!customer) throw new UnauthorizedError('Sign in to continue');
  return customer;
}

/** Same as currentCustomer, but null instead of throwing — used where a Bearer token is optional. */
export async function optionalCustomerId(siteId: string, authHeader: string | undefined): Promise<string | null> {
  const token = bearerToken(authHeader);
  const customerId = token ? verifyCustomerToken(token, siteId) : null;
  if (!customerId) return null;
  const found = await prisma.siteCustomer.findFirst({ where: { id: customerId, siteId }, select: { id: true } });
  return found?.id ?? null;
}

export async function accountMe(siteId: string, authHeader: string | undefined) {
  return toPublicCustomer(await currentCustomer(siteId, authHeader));
}

export async function accountOrders(siteId: string, authHeader: string | undefined) {
  const customer = await currentCustomer(siteId, authHeader);
  const orders = await prisma.siteOrder.findMany({
    where: { siteId, institutionId: customer.institutionId, customerId: customer.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return { items: await Promise.all(orders.map((o) => toPublicOrder(o))) };
}

// ── Public: orders + payment ─────────────────────────────────────────────────

async function toPublicOrder(order: {
  orderNo: string;
  status: string;
  paymentMethod: string;
  isDemo: boolean;
  currency: string;
  subtotal: Prisma.Decimal;
  shipping: Prisma.Decimal;
  total: Prisma.Decimal;
  createdAt: Date;
  paidAt: Date | null;
  customerName: string;
  email: string;
  items: Prisma.JsonValue;
}) {
  const lines = (Array.isArray(order.items) ? order.items : []) as OrderLine[];
  const isPaid = order.status === 'PAID' || order.status === 'FULFILLED';
  const productIds = lines.filter((l) => l.kind === 'PRODUCT').map((l) => l.refId);
  const courseIds = lines.filter((l) => l.kind === 'COURSE').map((l) => l.refId);
  const [products, courses] = await Promise.all([
    productIds.length ? prisma.siteProduct.findMany({ where: { id: { in: productIds } }, select: { id: true, kind: true, digitalUrl: true } }) : [],
    courseIds.length ? prisma.siteCourse.findMany({ where: { id: { in: courseIds } }, select: { id: true, slug: true } }) : [],
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const items = lines.map((l) => {
    const out: Record<string, unknown> = { kind: l.kind, refId: l.refId, name: l.name, unitPrice: l.unitPrice, qty: l.qty };
    if (l.kind === 'PRODUCT') {
      const p = productById.get(l.refId);
      if (isPaid && p?.kind === 'DIGITAL' && p.digitalUrl) out.downloadUrl = p.digitalUrl;
    } else {
      const c = courseById.get(l.refId);
      if (c) out.courseSlug = c.slug;
    }
    return out;
  });
  return {
    orderNo: order.orderNo,
    status: order.status,
    paymentMethod: order.paymentMethod,
    isDemo: order.isDemo,
    currency: order.currency,
    subtotal: Number(order.subtotal),
    shipping: Number(order.shipping),
    total: Number(order.total),
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    customerName: order.customerName,
    email: order.email,
    items,
  };
}

async function resolveOrderReturnUrl(site: { id: string; institutionId: string; subdomain: string }, raw: string | undefined): Promise<string> {
  const domains = await repo.listDomains(site.institutionId, site.id);
  const activeHosts = domains.filter((d) => d.status === 'ACTIVE').map((d) => d.hostname);
  const root = platformSiteDomain();
  const subdomainHost = root ? `${site.subdomain}.${root}` : null;
  const allowed = allowedReturnHosts(activeHosts, subdomainHost, hostOf(env.FRONTEND_URL));
  return resolveReturnUrl(raw, allowed, pathPreviewUrl(site.subdomain));
}

async function uniqueOrderNo(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateOrderNo();
    const clash = await prisma.siteOrder.findUnique({ where: { orderNo: candidate }, select: { id: true } });
    if (!clash) return candidate;
  }
  throw new InternalServerError('Could not generate a unique order number — please try again');
}

export async function createOrder(siteId: string, body: CreateOrderDtoType, authHeader: string | undefined) {
  const { site } = await visibleSite(siteId, null);
  const shop = shopSettingsOf(site.settings);
  const courseSettings = coursesSettingsOf(site.settings);

  const hasCourseItem = body.items.some((i) => i.kind === 'COURSE');
  const hasProductItem = body.items.some((i) => i.kind === 'PRODUCT');
  if (hasProductItem && !shop.enabled) throw new ForbiddenError('This shop is not open yet');
  if (hasCourseItem && !courseSettings.enabled) throw new ForbiddenError('Course enrollment is not open yet');

  const customerId = hasCourseItem
    ? (await currentCustomer(siteId, authHeader)).id
    : await optionalCustomerId(siteId, authHeader);

  const productIds = [...new Set(body.items.filter((i) => i.kind === 'PRODUCT').map((i) => i.refId))];
  const courseIds = [...new Set(body.items.filter((i) => i.kind === 'COURSE').map((i) => i.refId))];

  const [productRows, courseRows, ownedEnrollments] = await Promise.all([
    productIds.length ? prisma.siteProduct.findMany({ where: { id: { in: productIds }, siteId: site.id, institutionId: site.institutionId } }) : [],
    courseIds.length ? prisma.siteCourse.findMany({ where: { id: { in: courseIds }, siteId: site.id, institutionId: site.institutionId } }) : [],
    customerId && courseIds.length
      ? prisma.siteEnrollment.findMany({ where: { customerId, courseId: { in: courseIds }, status: 'ACTIVE' }, select: { courseId: true } })
      : [],
  ]);

  const catalog = {
    products: new Map<string, CatalogProduct>(
      productRows.map((p) => [p.id, { id: p.id, name: p.name, price: Number(p.price), status: p.status, kind: p.kind, stock: p.stock }]),
    ),
    courses: new Map<string, CatalogCourse>(courseRows.map((c) => [c.id, { id: c.id, title: c.title, price: Number(c.price), status: c.status }])),
  };
  const alreadyOwned = new Set(ownedEnrollments.map((e) => e.courseId));

  let priced;
  try {
    priced = priceOrder(body.items, catalog, { shippingFee: shop.shippingFee, freeShippingOver: shop.freeShippingOver }, alreadyOwned);
  } catch (error) {
    if (error instanceof OrderPricingError) throw new ValidationError(error.message);
    throw error;
  }

  if (body.paymentMethod === 'COD') {
    if (priced.hasCourse) throw new ValidationError('Cash on delivery is not available when the order includes a course');
    if (!shop.codEnabled) throw new ValidationError('Cash on delivery is not available for this shop');
  }

  const isFree = priced.total <= 0;
  let gatewayMode: ReturnType<typeof listGatewayModes>[number] | null = null;
  if (!isFree && body.paymentMethod !== 'COD') {
    gatewayMode = listGatewayModes().find((m) => m.gateway === body.paymentMethod) ?? null;
    if (!gatewayMode || !gatewayMode.available) {
      throw new BadRequestError(`${GATEWAY_LABEL[body.paymentMethod as FeeGatewayName] ?? body.paymentMethod} is not available for this shop yet`);
    }
  }

  const orderNo = await uniqueOrderNo();
  const returnUrl = await resolveOrderReturnUrl(site, body.returnUrl);
  const paymentMethod: 'FREE' | 'COD' | 'BKASH' | 'NAGAD' | 'SSLCOMMERZ' = isFree ? 'FREE' : body.paymentMethod;

  const baseData = {
    siteId: site.id,
    institutionId: site.institutionId,
    orderNo,
    customerId: customerId ?? null,
    customerName: body.customer.name,
    email: body.customer.email,
    phone: body.customer.phone,
    address: body.customer.address ? (body.customer.address as Prisma.InputJsonValue) : undefined,
    items: json(priced.lines),
    subtotal: new Prisma.Decimal(priced.subtotal),
    shipping: new Prisma.Decimal(priced.shipping),
    total: new Prisma.Decimal(priced.total),
    currency: 'BDT',
    paymentMethod,
    isDemo: false,
    returnUrl,
    note: body.note ?? null,
  };

  if (isFree || paymentMethod === 'COD') {
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.siteOrder.create({ data: { ...baseData, status: isFree ? 'PAID' : 'PENDING', paidAt: isFree ? new Date() : null } });
      if (isFree) await settleOrderSideEffects(tx, created, priced.lines);
      return created;
    });
    if (isFree) notifyOrderPaid(order.id).catch(() => undefined);
    return { order: await toPublicOrder(order) };
  }

  const gateway = body.paymentMethod as FeeGatewayName;
  const live = Boolean(gatewayMode?.live);
  const tranId = generateFeeTranId();
  const order = await prisma.siteOrder.create({ data: { ...baseData, status: 'PENDING', gatewayTranId: tranId, isDemo: !live } });

  if (!live) {
    return { order: await toPublicOrder(order), demo: true };
  }

  const result = await ADAPTERS[gateway].initiate({
    tranId,
    amount: priced.total,
    currency: 'BDT',
    invoiceNo: orderNo,
    customerName: body.customer.name,
    customerEmail: body.customer.email,
    customerPhone: body.customer.phone,
    callbackBase: `${env.APP_URL}/api/v1/public/sites/pay/${GATEWAY_SLUG[gateway]}`,
  });

  if (!result.ok || !result.paymentUrl) {
    await prisma.siteOrder.update({ where: { id: order.id }, data: { status: 'CANCELLED', adminNote: result.message ?? 'Gateway rejected the payment request' } });
    throw new BadRequestError(result.message || `Failed to start ${GATEWAY_LABEL[gateway]} checkout`);
  }
  await prisma.siteOrder.update({ where: { id: order.id }, data: { gatewayPaymentId: result.gatewayPaymentId ?? null } });
  return { order: await toPublicOrder(order), paymentUrl: result.paymentUrl };
}

export async function getPublicOrder(siteId: string, orderNo: string, opts: { email?: string; authHeader?: string }) {
  const { site } = await visibleSite(siteId, null);
  const order = await prisma.siteOrder.findFirst({ where: { siteId: site.id, institutionId: site.institutionId, orderNo } });
  if (!order) throw new NotFoundError('Order not found');
  let allowed = Boolean(opts.email && order.email.toLowerCase() === opts.email.toLowerCase());
  if (!allowed && order.customerId) {
    const customerId = await optionalCustomerId(siteId, opts.authHeader);
    allowed = Boolean(customerId && customerId === order.customerId);
  }
  if (!allowed) throw new NotFoundError('Order not found');
  return { order: await toPublicOrder(order) };
}

export async function demoPay(siteId: string, orderNo: string, data: DemoPayDtoType) {
  const { site } = await visibleSite(siteId, null);
  const order = await prisma.siteOrder.findFirst({ where: { siteId: site.id, institutionId: site.institutionId, orderNo } });
  if (!order || order.email.toLowerCase() !== data.email.toLowerCase()) throw new NotFoundError('Order not found');
  if (!order.isDemo) throw new ForbiddenError('This order is not a demo payment');
  if (!isDemoPaymentsAllowed()) throw new ForbiddenError('Demo payments are disabled for this school');

  if (order.status !== 'PENDING') {
    return { order: await toPublicOrder(order) };
  }
  if (data.outcome === 'fail') {
    const updated = await prisma.siteOrder.update({ where: { id: order.id }, data: { status: 'CANCELLED', adminNote: 'Demo payment: simulated failure' } });
    return { order: await toPublicOrder(updated) };
  }
  await creditOrder(order.id, { gatewayRef: `DEMO-${order.gatewayTranId ?? order.id}`, gatewayPaymentId: null });
  const fresh = await prisma.siteOrder.findUniqueOrThrow({ where: { id: order.id } });
  return { order: await toPublicOrder(fresh) };
}

// ── Idempotent crediting (the only place an order becomes PAID from a gateway) ─

function isUniqueOnGatewayRef(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  return (Array.isArray(target) ? target.join(',') : String(target ?? '')).includes('gatewayRef');
}

async function creditOrder(orderId: string, verified: { gatewayRef: string; gatewayPaymentId?: string | null }): Promise<{ credited: boolean }> {
  const order = await prisma.siteOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status !== 'PENDING') return { credited: false };

  const reusedBy = await prisma.siteOrder.findFirst({ where: { gatewayRef: verified.gatewayRef, id: { not: order.id } }, select: { id: true } });
  if (reusedBy) {
    logger.error('Site order gateway reference already used by another order — rejecting replay', { orderId: order.id, gatewayRef: verified.gatewayRef });
    return { credited: false };
  }

  try {
    const claimed = await prisma.$transaction(async (tx) => {
      const claim = await tx.siteOrder.updateMany({
        where: { id: order.id, status: 'PENDING' },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          gatewayRef: verified.gatewayRef,
          ...(verified.gatewayPaymentId ? { gatewayPaymentId: verified.gatewayPaymentId } : {}),
        },
      });
      if (claim.count !== 1) return false;
      const lines = ((order.items as unknown as OrderLine[]) ?? []) as OrderLine[];
      await settleOrderSideEffects(tx, order, lines);
      return true;
    });
    if (!claimed) return { credited: false };
  } catch (error) {
    if (isUniqueOnGatewayRef(error)) {
      logger.error('Site order gateway reference replay blocked by unique constraint', { orderId: order.id, gatewayRef: verified.gatewayRef });
      return { credited: false };
    }
    throw error;
  }

  logger.info('Site order credited', { orderId: order.id, orderNo: order.orderNo });
  notifyOrderPaid(order.id).catch(() => undefined);
  return { credited: true };
}

async function applyOrderVerification(order: { id: string; status: string; gatewayTranId: string | null; total: Prisma.Decimal; currency: string }, verification: GatewayVerifyResult) {
  const decision = decideOrderCredit(
    { status: order.status as SiteOrderStatusName, gatewayTranId: order.gatewayTranId, total: Number(order.total), currency: order.currency },
    verification,
  );
  if (decision.action === 'credit') {
    await creditOrder(order.id, { gatewayRef: verification.gatewayRef!, gatewayPaymentId: verification.gatewayPaymentId ?? null });
  } else if (decision.action === 'fail') {
    logger.error('Site order gateway verification failed — cancelling order', { orderId: order.id, reason: decision.reason });
    await markOrderCancelled(order.id);
  } else if (decision.action === 'ignore') {
    logger.warn('Site order gateway callback ignored', { orderId: order.id, reason: decision.reason });
  }
}

async function markOrderCancelled(orderId: string) {
  // Never downgrade a PAID/FULFILLED order; nothing to revoke since side
  // effects only ever run once an order actually reaches PAID.
  await prisma.siteOrder.updateMany({ where: { id: orderId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
}

// ── Public: gateway callbacks ────────────────────────────────────────────────

const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);

function redirectStatusFor(status: string | undefined): string {
  switch (status) {
    case 'PAID':
    case 'FULFILLED':
      return 'success';
    case 'CANCELLED':
      return 'cancelled';
    case 'REFUNDED':
      return 'refunded';
    default:
      return 'pending';
  }
}

function fallbackRedirect(): string {
  return `${env.FRONTEND_URL}/?payment=failed`;
}

async function redirectFor(order: { returnUrl: string | null; orderNo: string; email: string; status: string } | null | undefined): Promise<string> {
  if (!order) return fallbackRedirect();
  return buildPaymentRedirectUrl(order.returnUrl ?? env.FRONTEND_URL, order.orderNo, order.email, redirectStatusFor(order.status));
}

async function handleSslCommerzOrder(kind: CallbackKind, payload: Record<string, unknown>): Promise<string> {
  const tranId = str(payload.tran_id);
  const valId = str(payload.val_id);
  if (!tranId) return fallbackRedirect();
  const order = await prisma.siteOrder.findFirst({ where: { gatewayTranId: tranId, isDemo: false } });
  if (!order) return fallbackRedirect();

  const cfg = getSslCommerzConfig();
  const signatureOk = cfg ? verifySslCommerzSignature(payload, cfg.storePassword) : null;
  if (signatureOk === false) {
    logger.error('SSLCommerz site-order callback signature mismatch — ignored', { kind, tranId, orderId: order.id });
    return redirectFor(order);
  }

  if (order.status === 'PENDING') {
    if (valId && (kind === 'ipn' || kind === 'success')) {
      await applyOrderVerification(order, await SslCommerzFeeAdapter.validateByValId(valId));
    } else if (kind === 'fail' || (kind === 'ipn' && str(payload.status) === 'FAILED')) {
      await markOrderCancelled(order.id);
    } else if (kind === 'cancel' || (kind === 'ipn' && str(payload.status) === 'CANCELLED')) {
      await markOrderCancelled(order.id);
    }
  }
  const fresh = await prisma.siteOrder.findUnique({ where: { id: order.id } });
  return redirectFor(fresh);
}

async function handleBkashOrder(kind: CallbackKind, payload: Record<string, unknown>): Promise<string> {
  const paymentId = str(payload.paymentID);
  if (!paymentId) return fallbackRedirect();
  const order = await prisma.siteOrder.findFirst({ where: { gatewayPaymentId: paymentId, isDemo: false } });
  if (!order) return fallbackRedirect();

  if (order.status === 'PENDING') {
    const status = str(payload.status)?.toLowerCase();
    if (status === 'success') {
      await applyOrderVerification(order, await BkashFeeAdapter.executeOrQuery(paymentId));
    } else {
      // cancel or failure — bKash's own callback contract for this route.
      await markOrderCancelled(order.id);
    }
  }
  const fresh = await prisma.siteOrder.findUnique({ where: { id: order.id } });
  return redirectFor(fresh);
}

async function handleNagadOrder(kind: CallbackKind, payload: Record<string, unknown>): Promise<string> {
  const orderIdParam = str(payload.order_id);
  const paymentRefId = str(payload.payment_ref_id);
  if (!orderIdParam || !paymentRefId) return fallbackRedirect();
  const order = await prisma.siteOrder.findFirst({ where: { gatewayTranId: orderIdParam, isDemo: false } });
  if (!order) return fallbackRedirect();
  if (order.gatewayPaymentId && order.gatewayPaymentId !== paymentRefId) {
    logger.error('Nagad site-order callback payment_ref_id does not match the order — ignored', { orderId: order.id, paymentRefId });
    return redirectFor(order);
  }

  if (order.status === 'PENDING') {
    const verification = await NagadFeeAdapter.verifyByReference(paymentRefId);
    const cbStatus = str(payload.status)?.toLowerCase();
    if (verification.reachable && !verification.success && (cbStatus === 'aborted' || cbStatus === 'cancelled' || kind === 'cancel')) {
      await markOrderCancelled(order.id);
    } else {
      await applyOrderVerification(order, verification);
    }
  }
  const fresh = await prisma.siteOrder.findUnique({ where: { id: order.id } });
  return redirectFor(fresh);
}

export async function handleGatewayCallback(gatewaySlug: string, kind: CallbackKind, payload: Record<string, unknown>): Promise<string> {
  const gateway = GATEWAY_BY_SLUG[gatewaySlug.toLowerCase()];
  if (!gateway) return fallbackRedirect();
  if (!isGatewayLive(gateway)) {
    logger.warn('Sites: gateway callback received while the gateway is in demo mode — ignored', { gateway, kind });
    return fallbackRedirect();
  }
  if (gateway === 'SSLCOMMERZ') return handleSslCommerzOrder(kind, payload);
  if (gateway === 'BKASH') return handleBkashOrder(kind, payload);
  return handleNagadOrder(kind, payload);
}

// ── Notifications ────────────────────────────────────────────────────────────

async function notifyOrderPaid(orderId: string): Promise<void> {
  try {
    const order = await prisma.siteOrder.findUnique({ where: { id: orderId } });
    if (!order) return;
    const site = await prisma.site.findUnique({ where: { id: order.siteId }, select: { settings: true } });
    const shop = shopSettingsOf(site?.settings);
    const lines = ((order.items as unknown as OrderLine[]) ?? []) as OrderLine[];
    const itemLines = lines.map((l) => `${l.name} x${l.qty} — ${l.unitPrice.toFixed(2)}`).join('\n');
    const total = Number(order.total).toFixed(2);

    for (const to of new Set(shop.notifyEmails)) {
      await sendDirectMail({
        to,
        subject: `New paid order ${order.orderNo}`,
        text: `Order ${order.orderNo} has been paid.\nTotal: ${order.currency} ${total}\n\n${itemLines}`,
      }).catch((error) => logger.warn('Sites: order notify email failed', { orderId, error: (error as Error).message }));
    }
    await sendDirectMail({
      to: order.email,
      subject: `Your order ${order.orderNo} is confirmed`,
      text: `Thank you, ${order.customerName}! Your order ${order.orderNo} is confirmed.\n\n${itemLines}\n\nTotal: ${order.currency} ${total}`,
    }).catch((error) => logger.warn('Sites: buyer receipt email failed', { orderId, error: (error as Error).message }));
  } catch (error) {
    // Never let a notification failure affect the payment itself.
    logger.warn('Sites: order-paid notification skipped', { orderId, error: (error as Error).message });
  }
}
