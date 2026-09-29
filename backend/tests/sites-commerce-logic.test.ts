// Pure-logic tests for Website Builder v2 — commerce (shop) and the customer
// auth token. No database, no network. See tests/sites-logic.test.ts for the
// v1 conventions this file follows.

import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';
import {
  allowedReturnHosts,
  buildPaymentRedirectUrl,
  canTransitionOrderStatus,
  decideOrderCredit,
  generateOrderNo,
  orderStatusRevokesAccess,
  priceOrder,
  resolveReturnUrl,
  OrderPricingError,
  type CatalogCourse,
  type CatalogProduct,
} from '../src/modules/sites/sites.commerce.logic';
import { RESERVED_PAGE_SLUGS } from '../src/modules/sites/sites.logic';
import {
  bearerToken,
  deriveCustomerSecret,
  hashPassword,
  isUnclaimedPasswordHash,
  signCustomerToken,
  unclaimedPasswordHash,
  verifyCustomerToken,
  verifyPassword,
} from '../src/modules/sites/sites.customer.auth';

describe('reserved page slugs (Website Builder v2)', () => {
  it('reserves the shop/course/blog routes the public renderer owns', () => {
    for (const slug of ['blog', 'shop', 'cart', 'checkout', 'order', 'courses', 'learn', 'account']) {
      expect(RESERVED_PAGE_SLUGS.has(slug)).toBe(true);
    }
    // v1 reservations still stand.
    expect(RESERVED_PAGE_SLUGS.has('_home')).toBe(true);
  });
});

describe('priceOrder — pricing and shipping', () => {
  const products = new Map<string, CatalogProduct>([
    ['p-shirt', { id: 'p-shirt', name: 'Uniform Shirt', price: 500, status: 'PUBLISHED', kind: 'PHYSICAL', stock: 10 }],
    ['p-ebook', { id: 'p-ebook', name: 'Study Guide (PDF)', price: 200, status: 'PUBLISHED', kind: 'DIGITAL', stock: null }],
    ['p-draft', { id: 'p-draft', name: 'Not yet published', price: 100, status: 'DRAFT', kind: 'PHYSICAL', stock: 5 }],
    ['p-out', { id: 'p-out', name: 'Sold out', price: 300, status: 'PUBLISHED', kind: 'PHYSICAL', stock: 1 }],
  ]);
  const courses = new Map<string, CatalogCourse>([
    ['c-math', { id: 'c-math', title: 'Advanced Math', price: 1000, status: 'PUBLISHED' }],
    ['c-draft', { id: 'c-draft', title: 'Unpublished course', price: 500, status: 'DRAFT' }],
  ]);
  const catalog = { products, courses };
  const shop = { shippingFee: 60, freeShippingOver: 1000 };

  it('prices a simple physical order and applies shipping', () => {
    const r = priceOrder([{ kind: 'PRODUCT', refId: 'p-shirt', qty: 2 }], catalog, shop);
    expect(r.subtotal).toBe(1000);
    expect(r.hasPhysical).toBe(true);
    // subtotal (1000) meets freeShippingOver (1000) — shipping waived.
    expect(r.shipping).toBe(0);
    expect(r.total).toBe(1000);
  });

  it('charges shipping when under the free-shipping threshold', () => {
    const r = priceOrder([{ kind: 'PRODUCT', refId: 'p-shirt', qty: 1 }], catalog, shop);
    expect(r.subtotal).toBe(500);
    expect(r.shipping).toBe(60);
    expect(r.total).toBe(560);
  });

  it('never charges shipping for a digital-only cart', () => {
    const r = priceOrder([{ kind: 'PRODUCT', refId: 'p-ebook', qty: 1 }], catalog, shop);
    expect(r.hasPhysical).toBe(false);
    expect(r.shipping).toBe(0);
    expect(r.total).toBe(200);
  });

  it('forces course quantity to 1 regardless of what the client sent', () => {
    const r = priceOrder([{ kind: 'COURSE', refId: 'c-math', qty: 7 }], catalog, shop);
    expect(r.lines).toEqual([{ kind: 'COURSE', refId: 'c-math', name: 'Advanced Math', unitPrice: 1000, qty: 1 }]);
    expect(r.hasCourse).toBe(true);
    expect(r.total).toBe(1000);
  });

  it('mixes products and a course, pricing every line from the catalog (never the client)', () => {
    const r = priceOrder(
      [
        { kind: 'PRODUCT', refId: 'p-shirt', qty: 1 },
        { kind: 'COURSE', refId: 'c-math', qty: 1 },
      ],
      catalog,
      shop,
    );
    expect(r.subtotal).toBe(1500);
    expect(r.shipping).toBe(0); // subtotal already over freeShippingOver
    expect(r.total).toBe(1500);
  });

  it('rejects an unpublished product', () => {
    expect(() => priceOrder([{ kind: 'PRODUCT', refId: 'p-draft', qty: 1 }], catalog, shop)).toThrow(OrderPricingError);
  });

  it('rejects an unpublished course', () => {
    expect(() => priceOrder([{ kind: 'COURSE', refId: 'c-draft', qty: 1 }], catalog, shop)).toThrow(OrderPricingError);
  });

  it('rejects out-of-stock quantities', () => {
    expect(() => priceOrder([{ kind: 'PRODUCT', refId: 'p-out', qty: 2 }], catalog, shop)).toThrow(OrderPricingError);
  });

  it('rejects an unknown product/course id', () => {
    expect(() => priceOrder([{ kind: 'PRODUCT', refId: 'nope', qty: 1 }], catalog, shop)).toThrow(OrderPricingError);
  });

  it('rejects a course the customer already owns', () => {
    expect(() => priceOrder([{ kind: 'COURSE', refId: 'c-math', qty: 1 }], catalog, shop, new Set(['c-math']))).toThrow(OrderPricingError);
  });

  it('rejects a non-positive quantity', () => {
    expect(() => priceOrder([{ kind: 'PRODUCT', refId: 'p-shirt', qty: 0 }], catalog, shop)).toThrow(OrderPricingError);
  });

  it('rejects an empty cart', () => {
    expect(() => priceOrder([], catalog, shop)).toThrow(OrderPricingError);
  });

  it('treats a null freeShippingOver as "never free"', () => {
    const r = priceOrder([{ kind: 'PRODUCT', refId: 'p-shirt', qty: 4 }], catalog, { shippingFee: 60, freeShippingOver: null });
    expect(r.subtotal).toBe(2000);
    expect(r.shipping).toBe(60);
  });
});

describe('generateOrderNo', () => {
  it('formats SO-YYMMDD-XXXX using the injected clock and random source', () => {
    const now = new Date(Date.UTC(2026, 8, 29, 10, 0, 0)); // 2026-09-29
    expect(generateOrderNo(now, () => '7K3F')).toBe('SO-260929-7K3F');
  });

  it('defaults to a 4-character random suffix', () => {
    const no = generateOrderNo(new Date(Date.UTC(2026, 0, 1)));
    expect(no).toMatch(/^SO-260101-[0-9A-F]{4}$/);
  });
});

describe('order status transitions', () => {
  it('allows the expected forward transitions', () => {
    expect(canTransitionOrderStatus('PENDING', 'PAID')).toBe(true);
    expect(canTransitionOrderStatus('PENDING', 'CANCELLED')).toBe(true);
    expect(canTransitionOrderStatus('PAID', 'FULFILLED')).toBe(true);
    expect(canTransitionOrderStatus('PAID', 'REFUNDED')).toBe(true);
    expect(canTransitionOrderStatus('FULFILLED', 'REFUNDED')).toBe(true);
  });

  it('refuses transitions out of a terminal state', () => {
    expect(canTransitionOrderStatus('CANCELLED', 'PAID')).toBe(false);
    expect(canTransitionOrderStatus('REFUNDED', 'PAID')).toBe(false);
  });

  it('refuses a no-op transition and an unlisted jump', () => {
    expect(canTransitionOrderStatus('PENDING', 'PENDING')).toBe(false);
    expect(canTransitionOrderStatus('FULFILLED', 'PAID')).toBe(false);
  });

  it('flags CANCELLED/REFUNDED as the transitions that revoke access', () => {
    expect(orderStatusRevokesAccess('CANCELLED')).toBe(true);
    expect(orderStatusRevokesAccess('REFUNDED')).toBe(true);
    expect(orderStatusRevokesAccess('PAID')).toBe(false);
    expect(orderStatusRevokesAccess('FULFILLED')).toBe(false);
  });
});

describe('returnUrl validation', () => {
  const allowed = allowedReturnHosts(['www.myschool.edu.bd'], 'myschool.peoplenit.app', 'app.peoplenit.com');
  const fallback = 'https://app.peoplenit.com/s/myschool';

  it('accepts an https URL on an active custom domain', () => {
    expect(resolveReturnUrl('https://www.myschool.edu.bd/checkout', allowed, fallback)).toBe('https://www.myschool.edu.bd/checkout');
  });

  it('accepts the platform subdomain', () => {
    expect(resolveReturnUrl('https://myschool.peoplenit.app', allowed, fallback)).toBe('https://myschool.peoplenit.app');
  });

  it("accepts FRONTEND_URL's own host", () => {
    expect(resolveReturnUrl('https://app.peoplenit.com/anything', allowed, fallback)).toBe('https://app.peoplenit.com/anything');
  });

  it('falls back for an unrelated host (open-redirect attempt)', () => {
    expect(resolveReturnUrl('https://evil.example.com/phish', allowed, fallback)).toBe(fallback);
  });

  it('falls back for a non-http(s) protocol', () => {
    expect(resolveReturnUrl('javascript:alert(1)', allowed, fallback)).toBe(fallback);
    expect(resolveReturnUrl('ftp://www.myschool.edu.bd/x', allowed, fallback)).toBe(fallback);
  });

  it('falls back when nothing was supplied or it does not parse as a URL', () => {
    expect(resolveReturnUrl(undefined, allowed, fallback)).toBe(fallback);
    expect(resolveReturnUrl('not a url', allowed, fallback)).toBe(fallback);
  });

  it('strips a trailing slash so path-building is predictable', () => {
    expect(resolveReturnUrl('https://www.myschool.edu.bd/', allowed, fallback)).toBe('https://www.myschool.edu.bd');
  });

  it('builds the gateway-callback redirect URL', () => {
    const url = buildPaymentRedirectUrl('https://www.myschool.edu.bd', 'SO-260929-7K3F', 'buyer@example.com', 'success');
    expect(url).toBe('https://www.myschool.edu.bd/order/SO-260929-7K3F?email=buyer%40example.com&payment=success');
  });
});

describe('customer token — audience, site scoping and password claiming', () => {
  const secret = 'a'.repeat(40);

  it('derives a key that differs from the base secret', () => {
    expect(deriveCustomerSecret(secret)).not.toBe(secret);
    expect(deriveCustomerSecret(secret)).toBe(deriveCustomerSecret(secret)); // deterministic
  });

  it('round-trips a valid token for its own site', () => {
    const token = signCustomerToken('cust-1', 'site-1', deriveCustomerSecret(secret));
    expect(verifyCustomerToken(token, 'site-1', deriveCustomerSecret(secret))).toBe('cust-1');
  });

  it('rejects a token presented to a different site', () => {
    const token = signCustomerToken('cust-1', 'site-1', deriveCustomerSecret(secret));
    expect(verifyCustomerToken(token, 'site-2', deriveCustomerSecret(secret))).toBeNull();
  });

  it('rejects a malformed/garbage token without throwing', () => {
    expect(verifyCustomerToken('not-a-jwt', 'site-1', deriveCustomerSecret(secret))).toBeNull();
    expect(verifyCustomerToken(null, 'site-1', deriveCustomerSecret(secret))).toBeNull();
  });

  it('rejects a token whose audience is not site-customer', () => {
    const foreign = jwt.sign({ sub: 'cust-1', sid: 'site-1' }, deriveCustomerSecret(secret), { audience: 'something-else' });
    expect(verifyCustomerToken(foreign, 'site-1', deriveCustomerSecret(secret))).toBeNull();
  });

  it('is refused by the staff authenticate middleware (different signing key, no role/institutionId)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { authenticate } = require('../src/middleware/auth.middleware');
    // Default secret (no override): the same derived key the real service uses.
    const token = signCustomerToken('cust-1', 'site-1');
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const next = jest.fn();
    authenticate(req, {} as any, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(401);
    expect(req.user).toBeUndefined();
  });

  it('a real staff access token is also refused by verifyCustomerToken (wrong key)', () => {
    const staffToken = jwt.sign({ sub: 'user-1', role: 'ADMIN', institutionId: 'inst-1', email: 'a@b.com' }, env.JWT_ACCESS_SECRET);
    expect(verifyCustomerToken(staffToken, 'site-1')).toBeNull();
  });

  it('bearerToken extracts a token only from a well-formed header', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(bearerToken('Bearer ')).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken('Basic xyz')).toBeNull();
  });

  it('an unclaimed (admin-granted) password hash never verifies, and is recognisable', () => {
    const hash = unclaimedPasswordHash();
    expect(isUnclaimedPasswordHash(hash)).toBe(true);
  });

  it('verifyPassword rejects against an unclaimed hash without throwing', async () => {
    await expect(verifyPassword('whatever', unclaimedPasswordHash())).resolves.toBe(false);
  });

  it('hashPassword produces a hash verifyPassword accepts', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(isUnclaimedPasswordHash(hash)).toBe(false);
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
  });
});

describe('idempotent credit decision', () => {
  const order = { status: 'PENDING' as const, gatewayTranId: 'FEEABC123', total: 1500, currency: 'BDT' };
  const validVerification = { reachable: true, success: true, tranId: 'FEEABC123', amount: 1500, currency: 'BDT', gatewayRef: 'VAL-1', raw: {} };

  it('credits a valid, matching, first-time verification', () => {
    expect(decideOrderCredit(order, validVerification)).toEqual({ action: 'credit' });
  });

  it('is a safe no-op for an order that is already PAID (duplicate callback/IPN)', () => {
    expect(decideOrderCredit({ ...order, status: 'PAID' }, validVerification)).toEqual({ action: 'already-paid' });
  });

  it('is a safe no-op for an order that is already FULFILLED or REFUNDED', () => {
    expect(decideOrderCredit({ ...order, status: 'FULFILLED' }, validVerification).action).toBe('already-paid');
    expect(decideOrderCredit({ ...order, status: 'REFUNDED' }, validVerification).action).toBe('already-paid');
  });

  it('ignores when the gateway was unreachable — never fails on a network blip', () => {
    expect(decideOrderCredit(order, { reachable: false, success: false, raw: null }).action).toBe('ignore');
  });

  it('ignores a reference for a different transaction rather than crediting/failing this one', () => {
    expect(decideOrderCredit(order, { ...validVerification, tranId: 'SOMEONE-ELSE' }).action).toBe('ignore');
  });

  it('fails on an amount mismatch (tamper attempt)', () => {
    expect(decideOrderCredit(order, { ...validVerification, amount: 1 }).action).toBe('fail');
  });

  it('ignores when there is no gatewayTranId to correlate against', () => {
    expect(decideOrderCredit({ ...order, gatewayTranId: null }, validVerification).action).toBe('ignore');
  });
});
