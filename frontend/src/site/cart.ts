/**
 * Shop cart: pure maths (unit-tested) plus a tiny localStorage-backed store
 * shared by every component on the page (`site-cart:<siteId>`, try/catch —
 * private browsing / storage-full must never crash the site).
 *
 * Course items are always qty 1 (enrolment, not a quantity purchase) and
 * never trigger shipping. Shipping applies only when a physical product is
 * in the cart, mirroring the server's pricing rule in the API contract.
 */
import { useCallback, useSyncExternalStore } from 'react';
import type { SiteApi } from './api';
import type { PublicProduct, SiteProductKind } from './types';

export interface CartLine {
  kind: 'PRODUCT' | 'COURSE';
  refId: string;
  slug: string;
  name: string;
  price: number;
  qty: number;
  image?: string;
  /** Only meaningful for `kind: 'PRODUCT'`; DIGITAL products never trigger shipping. */
  productKind?: SiteProductKind;
}

export interface CartTotals {
  count: number;
  subtotal: number;
  shipping: number;
  total: number;
}

export interface ShopShippingRule {
  shippingFee: number;
  freeShippingOver?: number | null;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

function isValidLine(v: unknown): v is CartLine {
  if (!v || typeof v !== 'object') return false;
  const l = v as Record<string, unknown>;
  return (
    (l.kind === 'PRODUCT' || l.kind === 'COURSE') &&
    typeof l.refId === 'string' &&
    l.refId.length > 0 &&
    typeof l.slug === 'string' &&
    typeof l.name === 'string' &&
    typeof l.price === 'number' &&
    Number.isFinite(l.price) &&
    typeof l.qty === 'number' &&
    Number.isFinite(l.qty)
  );
}

/** Clamp qty (courses are always exactly 1) and drop non-positive lines. */
function normaliseLine(line: CartLine): CartLine {
  const qty = line.kind === 'COURSE' ? 1 : Math.max(1, Math.min(99, Math.round(line.qty)));
  return { ...line, qty, price: Math.max(0, round2(line.price)) };
}

/** Add `line` to `items` (merging by refId for products; courses never duplicate). */
export function addLine(items: CartLine[], line: CartLine): CartLine[] {
  const next = normaliseLine(line);
  const idx = items.findIndex((i) => i.kind === next.kind && i.refId === next.refId);
  if (idx === -1) return [...items, next];
  if (next.kind === 'COURSE') return items; // already in the cart; enrolment isn't a quantity
  const merged = [...items];
  merged[idx] = { ...merged[idx], qty: Math.max(1, Math.min(99, merged[idx].qty + next.qty)) };
  return merged;
}

export function setLineQty(items: CartLine[], refId: string, qty: number): CartLine[] {
  if (qty <= 0) return items.filter((i) => i.refId !== refId);
  return items.map((i) => (i.refId === refId ? { ...i, qty: i.kind === 'COURSE' ? 1 : Math.max(1, Math.min(99, Math.round(qty))) } : i));
}

export function removeLine(items: CartLine[], refId: string): CartLine[] {
  return items.filter((i) => i.refId !== refId);
}

export function cartCount(items: CartLine[]): number {
  return items.reduce((n, i) => n + i.qty, 0);
}

export function cartSubtotal(items: CartLine[]): number {
  return round2(items.reduce((s, i) => s + i.price * i.qty, 0));
}

/** True when any physical (non-digital) product line is present. */
export function hasPhysicalItem(items: CartLine[]): boolean {
  return items.some((i) => i.kind === 'PRODUCT' && i.productKind !== 'DIGITAL');
}

export function hasCourseItem(items: CartLine[]): boolean {
  return items.some((i) => i.kind === 'COURSE');
}

/** Mirrors the server's shipping rule: only when a physical item exists; free over the threshold. */
export function cartTotals(items: CartLine[], shop: ShopShippingRule): CartTotals {
  const subtotal = cartSubtotal(items);
  const count = cartCount(items);
  const free = shop.freeShippingOver != null && shop.freeShippingOver >= 0 && subtotal >= shop.freeShippingOver;
  const shipping = items.length && hasPhysicalItem(items) && !free ? round2(Math.max(0, shop.shippingFee)) : 0;
  return { count, subtotal, shipping, total: round2(subtotal + shipping) };
}

/* ── localStorage-backed store, shared by every hook instance ───────────── */

type Listener = () => void;

interface CartStore {
  getSnapshot: () => CartLine[];
  subscribe: (l: Listener) => () => void;
  add: (line: CartLine) => void;
  setQty: (refId: string, qty: number) => void;
  remove: (refId: string) => void;
  clear: () => void;
}

const stores = new Map<string, CartStore>();

function keyFor(siteId: string): string {
  return `site-cart:${siteId}`;
}

function readStorage(siteId: string): CartLine[] {
  try {
    const raw = localStorage.getItem(keyFor(siteId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isValidLine) : [];
  } catch {
    return [];
  }
}

function writeStorage(siteId: string, items: CartLine[]) {
  try {
    localStorage.setItem(keyFor(siteId), JSON.stringify(items));
  } catch {
    /* private mode or storage full: cart just won't persist */
  }
}

function createStore(siteId: string): CartStore {
  let items: CartLine[] = readStorage(siteId);
  const listeners = new Set<Listener>();
  const emit = () => listeners.forEach((l) => l());
  const set = (next: CartLine[]) => {
    items = next;
    writeStorage(siteId, items);
    emit();
  };
  return {
    getSnapshot: () => items,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    add: (line) => set(addLine(items, line)),
    setQty: (refId, qty) => set(setLineQty(items, refId, qty)),
    remove: (refId) => set(removeLine(items, refId)),
    clear: () => set([]),
  };
}

function storeFor(siteId: string): CartStore {
  let s = stores.get(siteId);
  if (!s) {
    s = createStore(siteId);
    stores.set(siteId, s);
  }
  return s;
}

const EMPTY: CartLine[] = [];

/** Reactive cart for `siteId` (pass `null` when not connected: reads/writes are no-ops). */
export function useSiteCart(siteId: string | null) {
  const store = siteId ? storeFor(siteId) : null;
  const items = useSyncExternalStore(
    store ? store.subscribe : () => () => {},
    store ? store.getSnapshot : () => EMPTY,
    () => EMPTY,
  );
  const add = useCallback((line: CartLine) => store?.add(line), [store]);
  const setQty = useCallback((refId: string, qty: number) => store?.setQty(refId, qty), [store]);
  const remove = useCallback((refId: string) => store?.remove(refId), [store]);
  const clear = useCallback(() => store?.clear(), [store]);
  return { items, add, setQty, remove, clear, count: cartCount(items) };
}

/** Used by the sandbox bridge (`SITE.addToCart(slug, qty)`): looks the product up, then adds it. */
export async function addProductBySlug(siteId: string | null, api: SiteApi, slug: string, qty = 1): Promise<PublicProduct | null> {
  if (!siteId || !slug) return null;
  const product = await api.product(siteId, slug);
  storeFor(siteId).add({
    kind: 'PRODUCT',
    refId: product.id,
    slug: product.slug,
    name: product.name,
    price: product.price,
    qty,
    image: product.images[0],
    productKind: product.kind,
  });
  return product;
}
