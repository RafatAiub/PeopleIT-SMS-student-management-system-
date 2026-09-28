/** `/cart` — the shopping cart (products and course enrolments together). */
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { optimiseImage, SiteLink, SkeletonRows } from '../blocks/shared';
import { cartTotals, useSiteCart } from '../cart';
import { useSiteRuntime, useSiteText } from '../runtime';
import { formatSiteMoney } from '../strings';
import { useSiteSeo } from './seo';

export function CartView() {
  const { siteId, api, lang, settings } = useSiteRuntime();
  const { s } = useSiteText();
  const cart = useSiteCart(siteId);
  const optionsQ = useQuery({
    queryKey: ['site-checkout-options', siteId],
    queryFn: () => api.checkoutOptions(siteId!),
    enabled: Boolean(siteId),
    staleTime: 5 * 60_000,
  });
  useSiteSeo({ title: `${s('Cart')} | ${settings.siteName}`, lang, siteName: settings.siteName, noindex: true });

  const currency = optionsQ.data?.currency ?? 'BDT';
  const totals = cartTotals(cart.items, { shippingFee: optionsQ.data?.shippingFee ?? 0, freeShippingOver: optionsQ.data?.freeShippingOver });

  if (!cart.items.length) {
    return (
      <section className="site-pad-lg">
        <div className="site-container site-w-narrow flex flex-col items-center gap-4 text-center">
          <ShoppingBag size={40} className="opacity-60" aria-hidden />
          <h1 className="site-h2">{s('Your cart is empty')}</h1>
          <p className="site-muted">{s('Add some products or courses to get started.')}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <SiteLink href="/shop" className="site-btn site-btn-primary">{s('Continue shopping')}</SiteLink>
            <SiteLink href="/courses" className="site-btn site-btn-outline">{s('Browse courses')}</SiteLink>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="site-pad-md">
      <div className="site-container grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <h1 className="site-h1 mb-6">{s('Cart')}</h1>
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {cart.items.map((item) => (
              <li key={item.refId} className="site-card site-card-pad flex items-center gap-4">
                {item.image ? (
                  <img src={optimiseImage(item.image, 200)} alt="" loading="lazy" className="h-16 w-16 flex-none rounded object-cover" />
                ) : (
                  <div aria-hidden className="flex h-16 w-16 flex-none items-center justify-center rounded" style={{ background: 'var(--site-surface-2)' }}><ShoppingBag size={22} className="opacity-40" /></div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{item.name}</p>
                  <p className="site-muted text-sm">{formatSiteMoney(item.price, currency, lang)}{item.kind === 'COURSE' ? ` · ${s('Enrol')}` : ''}</p>
                </div>
                {item.kind === 'PRODUCT' ? (
                  <div className="flex flex-none items-center gap-1" role="group" aria-label={s('Quantity')}>
                    <button type="button" className="site-btn site-btn-outline site-btn-sm !min-h-[36px] !px-2" onClick={() => cart.setQty(item.refId, item.qty - 1)} aria-label="-"><Minus size={14} /></button>
                    <span className="w-8 text-center tabular-nums">{item.qty}</span>
                    <button type="button" className="site-btn site-btn-outline site-btn-sm !min-h-[36px] !px-2" onClick={() => cart.setQty(item.refId, item.qty + 1)} aria-label="+"><Plus size={14} /></button>
                  </div>
                ) : null}
                <p className="w-24 flex-none text-right font-bold">{formatSiteMoney(item.price * item.qty, currency, lang)}</p>
                <button type="button" className="site-btn site-btn-ghost site-btn-sm !min-h-[36px] !px-2 flex-none" onClick={() => cart.remove(item.refId)} aria-label={s('Remove')}><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        </div>
        <aside className="site-card site-card-pad flex h-fit flex-col gap-3">
          <h2 className="site-h4">{s('Order summary')}</h2>
          <div className="flex justify-between text-sm"><span className="site-muted">{s('Subtotal')}</span><span>{formatSiteMoney(totals.subtotal, currency, lang)}</span></div>
          <div className="flex justify-between text-sm"><span className="site-muted">{s('Shipping')}</span><span>{totals.shipping > 0 ? formatSiteMoney(totals.shipping, currency, lang) : s('Free')}</span></div>
          <div className="flex justify-between border-t pt-3 text-lg font-bold" style={{ borderColor: 'var(--site-border)' }}><span>{s('Total')}</span><span>{formatSiteMoney(totals.total, currency, lang)}</span></div>
          <SiteLink href="/checkout" className="site-btn site-btn-primary w-full">{s('Checkout')}</SiteLink>
          {optionsQ.isLoading && <SkeletonRows rows={1} className="h-4" />}
        </aside>
      </div>
    </section>
  );
}
