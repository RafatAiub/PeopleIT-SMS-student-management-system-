/** `/checkout` (incl. the labelled demo checkout) and `/order/:orderNo` (order status). */
import { useEffect, useId, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Download, PackageCheck, XCircle } from 'lucide-react';
import { useSiteAccount } from '../account';
import { SiteApiError } from '../api';
import { SiteLink, SkeletonRows } from '../blocks/shared';
import { cartTotals, hasCourseItem, hasPhysicalItem, useSiteCart } from '../cart';
import { useSiteRuntime, useSiteText } from '../runtime';
import { formatSiteDate, formatSiteMoney, siteString } from '../strings';
import type { PublicOrder, SiteOrderStatus } from '../types';
import { useSiteSeo } from './seo';

const STATUS_LABEL: Record<SiteOrderStatus, string> = { PENDING: 'Pending', PAID: 'Paid', FULFILLED: 'Fulfilled', CANCELLED: 'Cancelled', REFUNDED: 'Refunded' };

function currentOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export function CheckoutView() {
  const { siteId, api, basePath, lang, settings } = useSiteRuntime();
  const { s } = useSiteText();
  const navigate = useNavigate();
  const cart = useSiteCart(siteId);
  const account = useSiteAccount();
  const uid = useId();

  const optionsQ = useQuery({ queryKey: ['site-checkout-options', siteId], queryFn: () => api.checkoutOptions(siteId!), enabled: Boolean(siteId), staleTime: 5 * 60_000 });
  const needsAddress = hasPhysicalItem(cart.items);
  const needsAccount = hasCourseItem(cart.items);

  const [name, setName] = useState(account.customer?.name ?? '');
  const [email, setEmail] = useState(account.customer?.email ?? '');
  const [phone, setPhone] = useState(account.customer?.phone ?? '');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [postcode, setPostcode] = useState('');
  const [method, setMethod] = useState<'COD' | string>('COD');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (account.customer) { setName(account.customer.name); setEmail(account.customer.email); setPhone(account.customer.phone ?? ''); }
  }, [account.customer]);

  useSiteSeo({ title: `${s('Checkout')} | ${settings.siteName}`, lang, siteName: settings.siteName, noindex: true });

  const currency = optionsQ.data?.currency ?? 'BDT';
  const totals = cartTotals(cart.items, { shippingFee: optionsQ.data?.shippingFee ?? 0, freeShippingOver: optionsQ.data?.freeShippingOver });
  const gateways = optionsQ.data?.gateways ?? [];
  const codAvailable = optionsQ.data?.codEnabled && !needsAccount;

  if (!cart.items.length) return <RedirectToCart />;
  if (needsAccount && !account.token) {
    return (
      <section className="site-pad-lg">
        <div className="site-container site-w-narrow flex flex-col items-center gap-4 text-center">
          <h1 className="site-h2">{s('You need an account to enrol in this course.')}</h1>
          <div className="flex flex-wrap justify-center gap-3">
            <SiteLink href="/account/login" className="site-btn site-btn-primary">{s('Sign in')}</SiteLink>
            <SiteLink href="/account/register" className="site-btn site-btn-outline">{s('Sign up')}</SiteLink>
          </div>
        </div>
      </section>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!siteId || busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await api.createOrder(
        siteId,
        {
          items: cart.items.map((i) => ({ kind: i.kind, refId: i.refId, qty: i.qty })),
          customer: { name: name.trim(), email: email.trim(), phone: phone.trim(), address: needsAddress ? { line1, city, area, postcode } : undefined },
          paymentMethod: method as never,
          returnUrl: `${currentOrigin()}${basePath}`,
        },
        account.token,
      );
      cart.clear();
      if (res.paymentUrl) { window.location.href = res.paymentUrl; return; }
      navigate(`${basePath}/order/${res.order.orderNo}?email=${encodeURIComponent(res.order.email)}${res.demo ? '&demo=1' : ''}`);
    } catch (err) {
      setError(err instanceof SiteApiError ? err.message : s('Something went wrong'));
      setBusy(false);
    }
  };

  return (
    <section className="site-pad-md">
      <div className="site-container grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <h1 className="site-h1">{s('Checkout')}</h1>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="site-label" htmlFor={`${uid}-name`}>{s('Full name')} *</label>
              <input id={`${uid}-name`} className="site-input" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
            <div>
              <label className="site-label" htmlFor={`${uid}-email`}>{s('Email')} *</label>
              <input id={`${uid}-email`} type="email" className="site-input" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div>
              <label className="site-label" htmlFor={`${uid}-phone`}>{s('Mobile number')} *</label>
              <input id={`${uid}-phone`} type="tel" className="site-input" required value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
            </div>
          </div>
          {needsAddress && (
            <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
              <legend className="site-label">{s('Delivery address')}</legend>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="site-label" htmlFor={`${uid}-line1`}>{s('Address line')} *</label>
                  <input id={`${uid}-line1`} className="site-input" required value={line1} onChange={(e) => setLine1(e.target.value)} />
                </div>
                <div><label className="site-label" htmlFor={`${uid}-city`}>{s('City')} *</label><input id={`${uid}-city`} className="site-input" required value={city} onChange={(e) => setCity(e.target.value)} /></div>
                <div><label className="site-label" htmlFor={`${uid}-area`}>{s('Area')}</label><input id={`${uid}-area`} className="site-input" value={area} onChange={(e) => setArea(e.target.value)} /></div>
                <div><label className="site-label" htmlFor={`${uid}-postcode`}>{s('Postcode')}</label><input id={`${uid}-postcode`} className="site-input" value={postcode} onChange={(e) => setPostcode(e.target.value)} /></div>
              </div>
            </fieldset>
          )}
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="site-label">{s('Payment method')}</legend>
            {codAvailable && (
              <label className="site-card site-card-pad flex min-h-[44px] cursor-pointer items-center gap-3">
                <input type="radio" name="pay" checked={method === 'COD'} onChange={() => setMethod('COD')} /> {s('Cash on delivery')}
              </label>
            )}
            {gateways.map((g) => (
              <label key={g.gateway} className="site-card site-card-pad flex min-h-[44px] cursor-pointer items-center justify-between gap-3">
                <span className="flex items-center gap-3"><input type="radio" name="pay" checked={method === g.gateway} onChange={() => setMethod(g.gateway)} /> {g.label}</span>
                {g.demo && <span className="site-badge">{s('Demo mode')}</span>}
              </label>
            ))}
          </fieldset>
          {error && <p className="site-alert site-alert-error" role="alert">{error}</p>}
          <button type="submit" className="site-btn site-btn-primary site-btn-lg" disabled={busy}>{busy ? s('Placing order…') : s('Place order')}</button>
        </form>
        <aside className="site-card site-card-pad flex h-fit flex-col gap-3">
          <h2 className="site-h4">{s('Order summary')}</h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
            {cart.items.map((i) => <li key={i.refId} className="flex justify-between gap-2"><span className="truncate">{i.name} × {i.qty}</span><span className="flex-none">{formatSiteMoney(i.price * i.qty, currency, lang)}</span></li>)}
          </ul>
          <div className="flex justify-between border-t pt-3 text-sm" style={{ borderColor: 'var(--site-border)' }}><span className="site-muted">{s('Subtotal')}</span><span>{formatSiteMoney(totals.subtotal, currency, lang)}</span></div>
          <div className="flex justify-between text-sm"><span className="site-muted">{s('Shipping')}</span><span>{totals.shipping > 0 ? formatSiteMoney(totals.shipping, currency, lang) : s('Free')}</span></div>
          <div className="flex justify-between text-lg font-bold"><span>{s('Total')}</span><span>{formatSiteMoney(totals.total, currency, lang)}</span></div>
        </aside>
      </div>
    </section>
  );
}

function RedirectToCart() {
  const { s } = useSiteText();
  return (
    <section className="site-pad-lg">
      <div className="site-container site-w-narrow flex flex-col items-center gap-4 text-center">
        <h1 className="site-h2">{s('Your cart is empty')}</h1>
        <SiteLink href="/cart" className="site-btn site-btn-primary">{s('View cart')}</SiteLink>
      </div>
    </section>
  );
}

export function OrderStatusView({ orderNo }: { orderNo: string }) {
  const { siteId, api, lang, settings } = useSiteRuntime();
  const { s } = useSiteText();
  const account = useSiteAccount();
  const [params] = useSearchParams();
  const email = params.get('email') || undefined;
  const isDemoHint = params.get('demo') === '1';
  const [pendingOutcome, setPendingOutcome] = useState<'success' | 'fail' | null>(null);

  const q = useQuery({
    queryKey: ['site-order', siteId, orderNo, email, account.token],
    queryFn: () => api.getOrder(siteId!, orderNo, { email, token: account.token }),
    enabled: Boolean(siteId),
    retry: (n, e) => n < 1 && !(e instanceof SiteApiError && e.status === 404),
  });

  useSiteSeo({ title: `${s('Order status')} | ${settings.siteName}`, lang, siteName: settings.siteName, noindex: true });

  const demoPay = async (outcome: 'success' | 'fail') => {
    if (!siteId || !email) return;
    setPendingOutcome(outcome);
    try { await api.demoPay(siteId, orderNo, { email, outcome }); } finally { setPendingOutcome(null); void q.refetch(); }
  };

  if (q.isLoading) return <div className="site-container site-pad-md"><SkeletonRows rows={1} className="h-64" /></div>;
  if (q.isError || !q.data) {
    return (
      <section className="site-pad-lg">
        <div className="site-container site-w-narrow flex flex-col items-center gap-3 text-center">
          <h1 className="site-h2">{s('Order not found')}</h1>
          <p className="site-muted">{s('Check the order number and email address.')}</p>
        </div>
      </section>
    );
  }

  const order: PublicOrder = q.data;
  const showDemoPay = order.isDemo && order.status === 'PENDING' && Boolean(email);

  return (
    <section className="site-pad-md">
      <div className="site-container site-w-narrow flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          {order.status === 'PAID' || order.status === 'FULFILLED' ? <CheckCircle2 size={40} style={{ color: 'var(--site-primary-text)' }} aria-hidden /> : <PackageCheck size={40} className="opacity-70" aria-hidden />}
          <h1 className="site-h2">{s('Order placed')}</h1>
          <p className="site-muted">{s('Order number')}: <strong>{order.orderNo}</strong></p>
          <span className="site-badge site-badge-accent">{s(STATUS_LABEL[order.status])}</span>
        </div>

        {(isDemoHint || order.isDemo) && (
          <div className="site-alert site-alert-warning text-center">
            <strong>{s('Demo payment — no money moves')}.</strong> {s('This is a simulated checkout for testing.')}
          </div>
        )}
        {showDemoPay && (
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" className="site-btn site-btn-primary" disabled={Boolean(pendingOutcome)} onClick={() => demoPay('success')}>{pendingOutcome === 'success' ? s('Placing order…') : s('Simulate a successful payment')}</button>
            <button type="button" className="site-btn site-btn-outline" disabled={Boolean(pendingOutcome)} onClick={() => demoPay('fail')}>{pendingOutcome === 'fail' ? s('Placing order…') : s('Simulate a failed payment')}<XCircle size={16} className="ml-1 inline" aria-hidden /></button>
          </div>
        )}

        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {order.items.map((item, i) => (
            <li key={i} className="site-card site-card-pad flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{item.name} × {item.qty}</p>
                <p className="site-muted text-sm">{formatSiteMoney(item.unitPrice, order.currency, lang)}</p>
              </div>
              <div className="flex flex-none items-center gap-3">
                {item.downloadUrl && <SiteLink href={item.downloadUrl} className="site-btn site-btn-outline site-btn-sm"><Download size={14} className="mr-1 inline" aria-hidden />{s('Download')}</SiteLink>}
                {item.courseSlug && <SiteLink href={`/learn/${item.courseSlug}`} className="site-btn site-btn-primary site-btn-sm">{s('Go to your course')}</SiteLink>}
              </div>
            </li>
          ))}
        </ul>

        <div className="site-card site-card-pad flex flex-col gap-2">
          <div className="flex justify-between text-sm"><span className="site-muted">{s('Subtotal')}</span><span>{formatSiteMoney(order.subtotal, order.currency, lang)}</span></div>
          <div className="flex justify-between text-sm"><span className="site-muted">{s('Shipping')}</span><span>{order.shipping > 0 ? formatSiteMoney(order.shipping, order.currency, lang) : s('Free')}</span></div>
          <div className="flex justify-between text-lg font-bold"><span>{s('Total')}</span><span>{formatSiteMoney(order.total, order.currency, lang)}</span></div>
          {order.createdAt && <p className="site-muted text-xs">{formatSiteDate(order.createdAt, lang, { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
        </div>
      </div>
    </section>
  );
}

/** Order-lookup form for visitors who arrive without a link (`/order` with no number). */
export function OrderLookupView() {
  const { siteId, api, basePath, lang, settings } = useSiteRuntime();
  const { s } = useSiteText();
  const navigate = useNavigate();
  const [orderNo, setOrderNo] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  useSiteSeo({ title: `${s('Look up an order')} | ${settings.siteName}`, lang, siteName: settings.siteName, noindex: true });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!siteId) return;
    setError(null);
    try {
      await api.getOrder(siteId, orderNo.trim(), { email: email.trim() });
      navigate(`${basePath}/order/${encodeURIComponent(orderNo.trim())}?email=${encodeURIComponent(email.trim())}`);
    } catch {
      setError(s('Order not found'));
    }
  };

  return (
    <section className="site-pad-lg">
      <div className="site-container site-w-narrow flex flex-col gap-4">
        <h1 className="site-h2 text-center">{s('Look up an order')}</h1>
        <form onSubmit={submit} className="site-card site-card-pad mx-auto flex w-full max-w-sm flex-col gap-3">
          <div><label className="site-label" htmlFor="order-no">{s('Order number')}</label><input id="order-no" className="site-input" required value={orderNo} onChange={(e) => setOrderNo(e.target.value)} /></div>
          <div><label className="site-label" htmlFor="order-email">{s('Email')}</label><input id="order-email" type="email" className="site-input" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {error && <p className="site-error" role="alert">{error}</p>}
          <button type="submit" className="site-btn site-btn-primary">{s('Track your order')}</button>
        </form>
      </div>
    </section>
  );
}

// Re-export for callers that only need the status label translation helper.
export function orderStatusLabel(status: SiteOrderStatus, lang: 'en' | 'bn'): string {
  return siteString(lang, STATUS_LABEL[status]);
}
