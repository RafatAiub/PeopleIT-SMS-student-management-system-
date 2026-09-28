// =============================================================================
// Sites — commerce pure logic (no database, no network). Unit-tested in
// tests/sites-commerce-logic.test.ts.
//
//   - order pricing (server-priced lines) + shipping
//   - order status transition rules + their side effects
//   - order number generator
//   - returnUrl validation / payment redirect builder
//   - idempotent credit decision (thin wrapper over the fee-gateway logic)
// =============================================================================

import crypto from 'crypto';
import type { GatewayVerifyResult } from '../fees/gateways/types';
import { decideVerification, type VerificationDecision } from '../fees/gateways/verify';

export class OrderPricingError extends Error {}

// ── Cart pricing ─────────────────────────────────────────────────────────────

export type CartItemKind = 'PRODUCT' | 'COURSE';

export interface CartLineInput {
  kind: CartItemKind;
  refId: string;
  qty: number;
}

export interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  status: 'DRAFT' | 'PUBLISHED';
  kind: 'PHYSICAL' | 'DIGITAL';
  /** null = unlimited. */
  stock: number | null;
}

export interface CatalogCourse {
  id: string;
  title: string;
  price: number;
  status: 'DRAFT' | 'PUBLISHED';
}

export interface PricedLine {
  kind: CartItemKind;
  refId: string;
  name: string;
  unitPrice: number;
  qty: number;
}

export interface ShopPricingSettings {
  shippingFee: number;
  freeShippingOver?: number | null;
}

export interface PricedOrder {
  lines: PricedLine[];
  subtotal: number;
  shipping: number;
  total: number;
  hasPhysical: boolean;
  hasCourse: boolean;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Prices a cart from server-held catalog data (never trusts a client-sent
 * price). Throws OrderPricingError on anything that must stop checkout:
 * unknown/unpublished item, out-of-stock quantity, or a course the customer
 * already owns. Course lines are always forced to qty 1.
 */
export function priceOrder(
  cart: CartLineInput[],
  catalog: { products: Map<string, CatalogProduct>; courses: Map<string, CatalogCourse> },
  shop: ShopPricingSettings,
  alreadyOwnedCourseIds: Set<string> = new Set(),
): PricedOrder {
  if (cart.length === 0) throw new OrderPricingError('Cart is empty');

  const lines: PricedLine[] = [];
  let hasPhysical = false;
  let hasCourse = false;

  for (const item of cart) {
    if (!Number.isInteger(item.qty) || item.qty < 1) {
      throw new OrderPricingError('Quantity must be a positive whole number');
    }
    if (item.kind === 'PRODUCT') {
      const product = catalog.products.get(item.refId);
      if (!product || product.status !== 'PUBLISHED') throw new OrderPricingError('One of the products is no longer available');
      if (product.stock !== null && product.stock < item.qty) throw new OrderPricingError(`"${product.name}" does not have enough stock`);
      if (product.kind === 'PHYSICAL') hasPhysical = true;
      lines.push({ kind: 'PRODUCT', refId: product.id, name: product.name, unitPrice: product.price, qty: item.qty });
    } else {
      const course = catalog.courses.get(item.refId);
      if (!course || course.status !== 'PUBLISHED') throw new OrderPricingError('One of the courses is no longer available');
      if (alreadyOwnedCourseIds.has(course.id)) throw new OrderPricingError(`You already own "${course.title}"`);
      hasCourse = true;
      // Courses are always quantity 1, regardless of what the client sent.
      lines.push({ kind: 'COURSE', refId: course.id, name: course.title, unitPrice: course.price, qty: 1 });
    }
  }

  const subtotal = round2(lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0));
  const freeOver = shop.freeShippingOver ?? null;
  const shipping = hasPhysical && !(freeOver !== null && subtotal >= freeOver) ? round2(Math.max(shop.shippingFee, 0)) : 0;
  const total = round2(subtotal + shipping);

  return { lines, subtotal, shipping, total, hasPhysical, hasCourse };
}

// ── Order numbers ────────────────────────────────────────────────────────────

/** SO-YYMMDD-XXXX (uppercase base36 suffix). Injectable now()/random() for tests. */
export function generateOrderNo(now: Date = new Date(), random: () => string = defaultOrderSuffix): string {
  const y = String(now.getUTCFullYear() % 100).padStart(2, '0');
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `SO-${y}${m}${d}-${random()}`;
}

function defaultOrderSuffix(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 4);
}

// ── Order status transitions ─────────────────────────────────────────────────

export type SiteOrderStatusName = 'PENDING' | 'PAID' | 'FULFILLED' | 'CANCELLED' | 'REFUNDED';

const ORDER_TRANSITIONS: Record<SiteOrderStatusName, SiteOrderStatusName[]> = {
  PENDING: ['PAID', 'FULFILLED', 'CANCELLED'],
  PAID: ['FULFILLED', 'REFUNDED', 'CANCELLED'],
  FULFILLED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

/** True when an admin may move an order from `from` to `to`. */
export function canTransitionOrderStatus(from: SiteOrderStatusName, to: SiteOrderStatusName): boolean {
  if (from === to) return false;
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Moving to CANCELLED or REFUNDED must revoke course enrollments and restock products. */
export function orderStatusRevokesAccess(to: SiteOrderStatusName): boolean {
  return to === 'CANCELLED' || to === 'REFUNDED';
}

// ── returnUrl ─────────────────────────────────────────────────────────────────

/**
 * Validates a client-supplied `returnUrl`: must be http(s) and its host must
 * be one of the site's allowed hosts (active custom domains, the platform
 * subdomain, or FRONTEND_URL's host). Anything else — including a parse
 * failure — falls back to the site's path-preview URL.
 */
export function resolveReturnUrl(raw: string | undefined | null, allowedHosts: string[], fallback: string): string {
  if (!raw) return fallback;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fallback;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return fallback;
  const allowed = new Set(allowedHosts.map((h) => h.toLowerCase()));
  if (!allowed.has(url.hostname.toLowerCase())) return fallback;
  return raw.replace(/\/+$/, '');
}

/** The set of hostnames a returnUrl may target for one site. */
export function allowedReturnHosts(activeDomainHostnames: string[], subdomainHost: string | null, frontendHost: string | null): string[] {
  return [...activeDomainHostnames, subdomainHost, frontendHost].filter((h): h is string => Boolean(h)).map((h) => h.toLowerCase());
}

/** `${returnUrl}/order/<orderNo>?email=...&payment=<status>` — used by gateway callback redirects. */
export function buildPaymentRedirectUrl(returnUrl: string, orderNo: string, email: string, payment: string): string {
  const base = returnUrl.replace(/\/+$/, '');
  const qs = new URLSearchParams({ email, payment });
  return `${base}/order/${encodeURIComponent(orderNo)}?${qs.toString()}`;
}

// ── Idempotent credit decision ───────────────────────────────────────────────

export type OrderCreditDecision = VerificationDecision | { action: 'already-paid' };

/**
 * Decides what a gateway verification means for one order — reusing the same
 * rules as the student-fee flow (decideVerification), plus an
 * already-credited short-circuit so a duplicate callback/IPN for an order
 * that a previous callback already paid is a safe no-op instead of a
 * re-evaluation of stale gateway data.
 */
export function decideOrderCredit(
  order: { status: SiteOrderStatusName; gatewayTranId: string | null; total: number; currency: string },
  verification: GatewayVerifyResult,
): OrderCreditDecision {
  if (order.status === 'PAID' || order.status === 'FULFILLED' || order.status === 'REFUNDED') {
    return { action: 'already-paid' };
  }
  if (!order.gatewayTranId) return { action: 'ignore', reason: 'Order has no gateway transaction id' };
  return decideVerification({ tranId: order.gatewayTranId, amount: order.total, currency: order.currency }, verification);
}
