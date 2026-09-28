/**
 * Shop and course-catalogue blocks: ProductGrid, FeaturedProduct, CartButton,
 * CourseGrid, FeaturedCourse, AccountButton. Data comes from the public shop
 * catalogue (`GET /products`, `GET /courses`) — never staff/admin endpoints.
 */
import { BookOpenCheck, ShoppingBag, ShoppingCart, UserRound } from 'lucide-react';
import { useSiteCart } from '../cart';
import { useSiteData, useSiteRuntime, useSiteText } from '../runtime';
import { sanitizeRichText } from '../sanitize';
import { formatSiteMoney } from '../strings';
import type { PublicCourse, PublicProduct } from '../types';
import {
  BlockSection, EmptyBlock, ErrorBlock, i18nField, introFields, NotConnected, numberField, optimiseImage, radioField,
  sectionDefaults, sectionFields, SectionIntro, selectField, SiteLink, SkeletonRows, textField, type SectionProps, type SiteBlock,
} from './shared';

const introDefaults = { eyebrow: '', eyebrowBn: '', intro: '', introBn: '', align: 'left' };
const COLS: Record<string, string> = { '2': 'sm:grid-cols-2', '3': 'sm:grid-cols-2 lg:grid-cols-3', '4': 'sm:grid-cols-2 lg:grid-cols-4' };

/* ── Product grid ───────────────────────────────────────────────────────── */

export const ProductGrid: SiteBlock = {
  label: 'Product grid (shop)',
  fields: {
    ...introFields,
    category: textField('Only this category (optional)'),
    limit: numberField('How many', 1, 24),
    columns: selectField('Columns', [['2', '2'], ['3', '3'], ['4', '4']]),
    showAddToCart: radioField('Show "Add to cart"', [[true, 'Yes'], [false, 'No']]),
    ...sectionFields,
  },
  defaultProps: { ...introDefaults, heading: 'Shop', headingBn: 'দোকান', category: '', limit: 8, columns: '4', showAddToCart: true, ...sectionDefaults },
  render: (p) => <ProductGridView {...p} />,
};

function ProductCard({ product, showAddToCart }: { product: PublicProduct; showAddToCart: boolean }) {
  const { tx, s, lang } = useSiteText();
  const { siteId } = useSiteRuntime();
  const cart = useSiteCart(siteId);
  const name = tx(product.name, product.nameBn);
  const img = product.images[0];
  return (
    <div className="site-anim site-card flex flex-col">
      <SiteLink href={`/shop/${product.slug}`} className="block no-underline">
        {img ? (
          <img src={optimiseImage(img, 700)} alt={name} loading="lazy" className="aspect-square w-full object-cover" />
        ) : (
          <div aria-hidden className="flex aspect-square w-full items-center justify-center" style={{ background: 'var(--site-surface-2)' }}><ShoppingBag size={32} className="opacity-40" /></div>
        )}
      </SiteLink>
      <div className="site-card-pad flex flex-1 flex-col gap-2">
        <SiteLink href={`/shop/${product.slug}`} className="no-underline"><h3 className="site-h4 line-clamp-2">{name}</h3></SiteLink>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-extrabold">{formatSiteMoney(product.price, product.currency, lang)}</span>
          {product.compareAtPrice != null && product.compareAtPrice > product.price && (
            <span className="site-muted text-sm line-through">{formatSiteMoney(product.compareAtPrice, product.currency, lang)}</span>
          )}
        </div>
        {!product.inStock ? (
          <span className="site-badge mt-auto w-fit">{s('Out of stock')}</span>
        ) : showAddToCart ? (
          <button
            type="button"
            className="site-btn site-btn-outline site-btn-sm mt-auto w-full"
            onClick={() => cart.add({ kind: 'PRODUCT', refId: product.id, slug: product.slug, name, price: product.price, qty: 1, image: img, productKind: product.kind })}
          >
            {s('Add to cart')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ProductGridView(p: Record<string, any>) {
  const { s } = useSiteText();
  const limit = Math.max(1, Math.min(24, Number(p.limit) || 8));
  const category = String(p.category ?? '').trim() || undefined;
  const q = useSiteData(['products', category, limit], (id, api) => api.products(id, { category, pageSize: limit }));
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!q.connected ? <NotConnected /> : q.isLoading ? <SkeletonRows rows={1} className="h-64" /> : q.isError ? <ErrorBlock onRetry={() => void q.refetch()} /> : !q.data?.items.length ? (
        <EmptyBlock icon={<ShoppingBag size={28} />} title={s('No products yet')} hint={s('Products will appear here once they’re published.')} />
      ) : (
        <div className={`grid grid-cols-2 gap-4 md:gap-6 ${COLS[p.columns] ?? COLS['4']}`}>
          {q.data.items.slice(0, limit).map((product) => <ProductCard key={product.id} product={product} showAddToCart={p.showAddToCart !== false} />)}
        </div>
      )}
    </BlockSection>
  );
}

/* ── Featured product ───────────────────────────────────────────────────── */

export const FeaturedProduct: SiteBlock = {
  label: 'Featured product',
  fields: { slug: textField('Product slug'), ...sectionFields },
  defaultProps: { slug: '', ...sectionDefaults, tone: 'surface' },
  render: (p) => <FeaturedProductView {...p} />,
};

function FeaturedProductView(p: Record<string, any>) {
  const { s, tx, lang } = useSiteText();
  const { siteId } = useSiteRuntime();
  const cart = useSiteCart(siteId);
  const slug = String(p.slug ?? '').trim();
  const q = useSiteData(['product', slug], (id, api) => api.product(id, slug), { enabled: Boolean(slug) });
  if (!slug) return <BlockSection {...(p as SectionProps)}><EmptyBlock title={s('Add content in the editor')} /></BlockSection>;
  const product = q.data;
  return (
    <BlockSection {...(p as SectionProps)}>
      {!q.connected ? <NotConnected /> : q.isLoading ? <SkeletonRows rows={1} className="h-72" /> : q.isError || !product ? <ErrorBlock onRetry={() => void q.refetch()} /> : (
        <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-2">
          {product.images[0] ? (
            <img src={optimiseImage(product.images[0], 1000)} alt={tx(product.name, product.nameBn)} className="aspect-square w-full object-cover" style={{ borderRadius: 'var(--site-radius-lg)' }} />
          ) : (
            <div aria-hidden className="flex aspect-square w-full items-center justify-center" style={{ background: 'var(--site-surface-2)', borderRadius: 'var(--site-radius-lg)' }}><ShoppingBag size={40} className="opacity-40" /></div>
          )}
          <div className="flex flex-col gap-4">
            <h2 className="site-h2">{tx(product.name, product.nameBn)}</h2>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-extrabold">{formatSiteMoney(product.price, product.currency, lang)}</span>
              {product.compareAtPrice != null && product.compareAtPrice > product.price && <span className="site-muted text-lg line-through">{formatSiteMoney(product.compareAtPrice, product.currency, lang)}</span>}
            </div>
            {product.description && <div className="site-prose" dangerouslySetInnerHTML={{ __html: sanitizeRichText(product.description) }} />}
            <div className="flex flex-wrap gap-3">
              {product.inStock ? (
                <button type="button" className="site-btn site-btn-primary site-btn-lg" onClick={() => cart.add({ kind: 'PRODUCT', refId: product.id, slug: product.slug, name: tx(product.name, product.nameBn), price: product.price, qty: 1, image: product.images[0], productKind: product.kind })}>{s('Add to cart')}</button>
              ) : (
                <span className="site-badge">{s('Out of stock')}</span>
              )}
              <SiteLink href={`/shop/${product.slug}`} className="site-btn site-btn-outline site-btn-lg">{s('Read more')}</SiteLink>
            </div>
          </div>
        </div>
      )}
    </BlockSection>
  );
}

/* ── Cart button ────────────────────────────────────────────────────────── */

export const CartButton: SiteBlock = {
  label: 'Cart button',
  fields: { ...i18nField('label', 'Label'), style: selectField('Style', [['primary', 'Primary'], ['outline', 'Outline'], ['ghost', 'Plain']]) },
  defaultProps: { label: 'Cart', labelBn: 'কার্ট', style: 'outline' },
  render: (p) => <CartButtonView {...p} />,
};

function CartButtonView(p: Record<string, any>) {
  const { tx } = useSiteText();
  const { siteId } = useSiteRuntime();
  const cart = useSiteCart(siteId);
  return (
    <div className="site-pad-sm">
      <div className="site-container">
        <SiteLink href="/cart" className={`site-btn site-btn-${p.style ?? 'outline'} inline-flex items-center gap-2`}>
          <ShoppingCart size={18} aria-hidden />
          {tx(p.label, p.labelBn)}
          {cart.count > 0 && <span className="site-badge site-badge-accent">{cart.count}</span>}
        </SiteLink>
      </div>
    </div>
  );
}

/* ── Course grid ────────────────────────────────────────────────────────── */

export const CourseGrid: SiteBlock = {
  label: 'Course grid',
  fields: {
    ...introFields,
    category: textField('Only this category (optional)'),
    limit: numberField('How many', 1, 24),
    columns: selectField('Columns', [['2', '2'], ['3', '3'], ['4', '4']]),
    ...sectionFields,
  },
  defaultProps: { ...introDefaults, heading: 'Courses', headingBn: 'কোর্সসমূহ', category: '', limit: 6, columns: '3', ...sectionDefaults },
  render: (p) => <CourseGridView {...p} />,
};

export function CourseCard({ course }: { course: PublicCourse }) {
  const { tx, s, lang } = useSiteText();
  const title = tx(course.title, course.titleBn);
  return (
    <div className="site-anim site-card flex flex-col">
      <SiteLink href={`/courses/${course.slug}`} className="block no-underline">
        {course.coverUrl ? (
          <img src={optimiseImage(course.coverUrl, 700)} alt={title} loading="lazy" className="aspect-video w-full object-cover" />
        ) : (
          <div aria-hidden className="flex aspect-video w-full items-center justify-center" style={{ background: 'var(--site-primary-soft)' }}><BookOpenCheck size={32} /></div>
        )}
      </SiteLink>
      <div className="site-card-pad flex flex-1 flex-col gap-2">
        {course.category && <span className="site-eyebrow">{course.category}</span>}
        <SiteLink href={`/courses/${course.slug}`} className="no-underline"><h3 className="site-h4 line-clamp-2">{title}</h3></SiteLink>
        {course.summary && <p className="site-muted line-clamp-2 text-sm">{course.summary}</p>}
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-lg font-extrabold">{course.price > 0 ? formatSiteMoney(course.price, course.currency, lang) : s('Free')}</span>
          <SiteLink href={`/courses/${course.slug}`} className="site-btn site-btn-outline site-btn-sm">{s('View course')}</SiteLink>
        </div>
      </div>
    </div>
  );
}

function CourseGridView(p: Record<string, any>) {
  const { s } = useSiteText();
  const limit = Math.max(1, Math.min(24, Number(p.limit) || 6));
  const category = String(p.category ?? '').trim() || undefined;
  const q = useSiteData(['courses-catalogue', category, limit], (id, api) => api.coursesCatalogue(id, { category, pageSize: limit }));
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!q.connected ? <NotConnected /> : q.isLoading ? <SkeletonRows rows={1} className="h-64" /> : q.isError ? <ErrorBlock onRetry={() => void q.refetch()} /> : !q.data?.items.length ? (
        <EmptyBlock icon={<BookOpenCheck size={28} />} title={s('No courses yet')} hint={s('Courses will appear here once they’re published.')} />
      ) : (
        <div className={`grid grid-cols-1 gap-5 ${COLS[p.columns] ?? COLS['3']}`}>
          {q.data.items.slice(0, limit).map((course) => <CourseCard key={course.id} course={course} />)}
        </div>
      )}
    </BlockSection>
  );
}

/* ── Featured course ─────────────────────────────────────────────────────── */

export const FeaturedCourse: SiteBlock = {
  label: 'Featured course',
  fields: { slug: textField('Course slug'), ...sectionFields },
  defaultProps: { slug: '', ...sectionDefaults, tone: 'soft' },
  render: (p) => <FeaturedCourseView {...p} />,
};

function FeaturedCourseView(p: Record<string, any>) {
  const { s, tx, lang } = useSiteText();
  const slug = String(p.slug ?? '').trim();
  const q = useSiteData(['course-detail', slug], (id, api) => api.courseDetail(id, slug), { enabled: Boolean(slug) });
  if (!slug) return <BlockSection {...(p as SectionProps)}><EmptyBlock title={s('Add content in the editor')} /></BlockSection>;
  const course = q.data;
  return (
    <BlockSection {...(p as SectionProps)}>
      {!q.connected ? <NotConnected /> : q.isLoading ? <SkeletonRows rows={1} className="h-72" /> : q.isError || !course ? <ErrorBlock onRetry={() => void q.refetch()} /> : (
        <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-2">
          {course.coverUrl ? (
            <img src={optimiseImage(course.coverUrl, 1000)} alt={tx(course.title, course.titleBn)} className="aspect-video w-full object-cover" style={{ borderRadius: 'var(--site-radius-lg)' }} />
          ) : (
            <div aria-hidden className="flex aspect-video w-full items-center justify-center" style={{ background: 'var(--site-primary-soft)', borderRadius: 'var(--site-radius-lg)' }}><BookOpenCheck size={40} /></div>
          )}
          <div className="flex flex-col gap-4">
            {course.category && <span className="site-eyebrow">{course.category}</span>}
            <h2 className="site-h2">{tx(course.title, course.titleBn)}</h2>
            {course.summary && <p className="site-lead site-muted">{course.summary}</p>}
            <div className="flex flex-wrap items-center gap-4 text-sm">
              {course.instructorName && <span>{s('Instructor')}: <strong>{course.instructorName}</strong></span>}
              {course.lessonCount > 0 && <span>{course.lessonCount} {s('lessons')}</span>}
              {course.level && <span className="site-badge">{course.level}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-3xl font-extrabold">{course.price > 0 ? formatSiteMoney(course.price, course.currency, lang) : s('Free')}</span>
              <SiteLink href={`/courses/${course.slug}`} className="site-btn site-btn-primary site-btn-lg">{s('View course')}</SiteLink>
            </div>
          </div>
        </div>
      )}
    </BlockSection>
  );
}

/* ── Account button ─────────────────────────────────────────────────────── */

export const AccountButton: SiteBlock = {
  label: 'Account button',
  fields: { ...i18nField('label', 'Label'), style: selectField('Style', [['primary', 'Primary'], ['outline', 'Outline'], ['ghost', 'Plain']]) },
  defaultProps: { label: 'My account', labelBn: 'আমার অ্যাকাউন্ট', style: 'outline' },
  render: (p) => <AccountButtonView {...p} />,
};

function AccountButtonView(p: Record<string, any>) {
  const { tx } = useSiteText();
  return (
    <div className="site-pad-sm">
      <div className="site-container">
        <SiteLink href="/account" className={`site-btn site-btn-${p.style ?? 'outline'} inline-flex items-center gap-2`}>
          <UserRound size={18} aria-hidden />
          {tx(p.label, p.labelBn)}
        </SiteLink>
      </div>
    </div>
  );
}
