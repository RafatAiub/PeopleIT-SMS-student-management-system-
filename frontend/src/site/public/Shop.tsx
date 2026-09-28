/** Public shop routes: `/shop` (catalogue) and `/shop/:slug` (product detail). */
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBag } from 'lucide-react';
import { SiteApiError } from '../api';
import { optimiseImage, SiteImage, SiteLink, SkeletonRows } from '../blocks/shared';
import { sanitizeRichText } from '../sanitize';
import { useSiteCart } from '../cart';
import { useSiteRuntime, useSiteText } from '../runtime';
import { formatSiteMoney } from '../strings';
import { useSiteSeo } from './seo';
import { NotFoundWithSeo } from './Pages';

const PAGE_SIZE = 12;

export function ShopListView() {
  const { siteId, api, lang, settings } = useSiteRuntime();
  const { s } = useSiteText();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const category = params.get('category') || undefined;
  const [term, setTerm] = useState(params.get('q') || '');
  const q = useQuery({
    queryKey: ['site-shop-products', siteId, page, category, params.get('q')],
    queryFn: () => api.products(siteId!, { page, pageSize: PAGE_SIZE, category, q: params.get('q') || undefined }),
    enabled: Boolean(siteId),
    staleTime: 30_000,
  });
  useSiteSeo({ title: `${s('Shop')} | ${settings.siteName}`, lang, siteName: settings.siteName });

  const go = (n: number) => { const next = new URLSearchParams(params); next.set('page', String(n)); setParams(next); window.scrollTo({ top: 0 }); };
  const search = (e: FormEvent) => { e.preventDefault(); const next = new URLSearchParams(params); if (term.trim()) next.set('q', term.trim()); else next.delete('q'); next.set('page', '1'); setParams(next); };
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / PAGE_SIZE)) : 1;

  if (!settings.shop?.enabled) return <NotFoundWithSeo />;

  return (
    <section className="site-pad-md">
      <div className="site-container">
        <h1 className="site-h1 mb-6">{s('Shop')}</h1>
        <form onSubmit={search} className="mb-8 flex max-w-sm gap-2">
          <label className="sr-only" htmlFor="shop-search">{s('Search products')}</label>
          <input id="shop-search" type="search" className="site-input" placeholder={s('Search products')} value={term} onChange={(e) => setTerm(e.target.value)} />
          <button type="submit" className="site-btn site-btn-outline flex-none">{s('Search products')}</button>
        </form>
        {q.isLoading ? <SkeletonRows rows={1} className="h-64" /> : q.isError ? (
          <p className="site-alert site-alert-error" role="alert">{s('Something went wrong')}</p>
        ) : !q.data?.items.length ? (
          <div className="site-empty"><ShoppingBag size={28} className="opacity-70" /><p className="site-empty-title">{s('No products yet')}</p><p className="text-sm">{s('Products will appear here once they’re published.')}</p></div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {q.data.items.map((product) => (
              <SiteLink key={product.id} href={`/shop/${product.slug}`} className="site-card flex flex-col no-underline">
                {product.images[0] ? (
                  <img src={optimiseImage(product.images[0], 500)} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                ) : (
                  <div aria-hidden className="flex aspect-square w-full items-center justify-center" style={{ background: 'var(--site-surface-2)' }}><ShoppingBag size={28} className="opacity-40" /></div>
                )}
                <div className="site-card-pad flex flex-1 flex-col gap-1">
                  <h2 className="site-h4 line-clamp-2">{lang === 'bn' && product.nameBn ? product.nameBn : product.name}</h2>
                  <p className="mt-auto font-bold">{formatSiteMoney(product.price, product.currency, lang)}</p>
                  {!product.inStock && <span className="site-badge w-fit">{s('Out of stock')}</span>}
                </div>
              </SiteLink>
            ))}
          </div>
        )}
        {pages > 1 && (
          <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
            <button type="button" className="site-btn site-btn-outline site-btn-sm" disabled={page <= 1} onClick={() => go(page - 1)}>{s('Previous')}</button>
            <span className="site-muted text-sm">{s('Page {page} of {pages}', { page, pages })}</span>
            <button type="button" className="site-btn site-btn-outline site-btn-sm" disabled={page >= pages} onClick={() => go(page + 1)}>{s('Next')}</button>
          </nav>
        )}
      </div>
    </section>
  );
}

export function ShopProductView({ slug }: { slug: string }) {
  const { siteId, api, lang, settings } = useSiteRuntime();
  const { s } = useSiteText();
  const cart = useSiteCart(siteId);
  const [added, setAdded] = useState(false);
  const [active, setActive] = useState(0);
  const q = useQuery({
    queryKey: ['site-shop-product', siteId, slug],
    queryFn: () => api.product(siteId!, slug),
    enabled: Boolean(siteId),
    staleTime: 30_000,
    retry: (n, e) => n < 1 && !(e instanceof SiteApiError && e.status === 404),
  });
  const product = q.data;
  useSiteSeo(product ? { title: `${lang === 'bn' && product.nameBn ? product.nameBn : product.name} | ${settings.siteName}`, description: product.description.replace(/<[^>]*>/g, '').slice(0, 160), ogImage: product.images[0], lang, siteName: settings.siteName } : null);

  if (!settings.shop?.enabled) return <NotFoundWithSeo />;
  if (q.isLoading) return <div className="site-container site-pad-md"><SkeletonRows rows={1} className="h-96" /></div>;
  if (q.isError || !product) return <NotFoundWithSeo />;

  const name = lang === 'bn' && product.nameBn ? product.nameBn : product.name;
  const addToCart = () => {
    cart.add({ kind: 'PRODUCT', refId: product.id, slug: product.slug, name, price: product.price, qty: 1, image: product.images[0], productKind: product.kind });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2000);
  };

  return (
    <section className="site-pad-md">
      <div className="site-container grid grid-cols-1 gap-10 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="overflow-hidden" style={{ borderRadius: 'var(--site-radius-lg)', background: 'var(--site-surface-2)' }}>
            {product.images[active] ? <SiteImage src={product.images[active]} alt={name} width={1000} eager className="aspect-square w-full object-cover" /> : (
              <div aria-hidden className="flex aspect-square w-full items-center justify-center"><ShoppingBag size={40} className="opacity-40" /></div>
            )}
          </div>
          {product.images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {product.images.map((img, i) => (
                <button key={img} type="button" onClick={() => setActive(i)} className="h-16 w-16 flex-none overflow-hidden border-2 p-0" style={{ borderRadius: 'var(--site-radius)', borderColor: i === active ? 'var(--site-primary)' : 'transparent' }}>
                  <img src={optimiseImage(img, 200)} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4">
          {product.category && <span className="site-eyebrow">{product.category}</span>}
          <h1 className="site-h1">{name}</h1>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-extrabold">{formatSiteMoney(product.price, product.currency, lang)}</span>
            {product.compareAtPrice != null && product.compareAtPrice > product.price && <span className="site-muted text-lg line-through">{formatSiteMoney(product.compareAtPrice, product.currency, lang)}</span>}
          </div>
          {product.description && <div className="site-prose" dangerouslySetInnerHTML={{ __html: sanitizeRichText(product.description) }} />}
          <div className="flex flex-wrap items-center gap-3">
            {product.inStock ? (
              <button type="button" className="site-btn site-btn-primary site-btn-lg" onClick={addToCart}>{added ? s('Added to cart') : s('Add to cart')}</button>
            ) : (
              <span className="site-badge text-base">{s('Out of stock')}</span>
            )}
            <SiteLink href="/cart" className="site-btn site-btn-outline site-btn-lg">{s('View cart')}</SiteLink>
          </div>
        </div>
      </div>
    </section>
  );
}
