/**
 * Public-site chrome: top bar, header (six `theme.headerStyle` variants),
 * footer (five `theme.footerStyle` variants), the boxed-layout page frame,
 * preview bar and 404. See docs/redesign/WEBSITE_V3_PLAN.md §7 (Track C1).
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown, Eye, Home, Mail, Menu, Phone, ShoppingCart, UserRound, X } from 'lucide-react';
import { SiteLink, SiteImage } from '../blocks/shared';
import { SocialLinks } from '../blocks/content';
import { useSiteCart } from '../cart';
import { useSiteHref, useSiteRuntime, useSiteText } from '../runtime';
import { formatSiteDate } from '../strings';
import type { NavItem, SiteFooterStyle, SiteHeaderStyle, SiteLang } from '../types';

function useSiteName() {
  const { settings, institution, lang } = useSiteRuntime();
  return (lang === 'bn' && settings.siteNameBn) || settings.siteName || institution?.name || '';
}

function useIsCurrent() {
  const { pathname } = useLocation();
  const toHref = useSiteHref();
  return (href: string) => {
    if (!href.startsWith('/') || href.includes('#')) return false;
    const target = (toHref(href) ?? href).split('?')[0].replace(/\/$/, '') || '/';
    const here = pathname.replace(/\/$/, '') || '/';
    return target === here;
  };
}

export function LanguageToggle({ className = '' }: { className?: string }) {
  const { settings, lang, setLang } = useSiteRuntime();
  const { s } = useSiteText();
  if (!setLang || settings.languages.length < 2) return null;
  const opts: Array<[SiteLang, string]> = [['en', 'EN'], ['bn', 'বাং']];
  return (
    <div role="group" aria-label={s('Language')} className={`inline-flex overflow-hidden ${className}`} style={{ border: '1px solid var(--site-border)', borderRadius: 'var(--site-radius)' }}>
      {opts.filter(([l]) => settings.languages.includes(l)).map(([l, label]) => (
        <button key={l} type="button" lang={l} aria-pressed={lang === l} onClick={() => setLang(l)}
          className="min-h-[36px] min-w-[44px] px-3 text-sm font-semibold"
          style={lang === l ? { background: 'var(--site-primary)', color: 'var(--site-on-primary)' } : { background: 'transparent', color: 'var(--site-text)' }}>
          {label}
        </button>
      ))}
    </div>
  );
}

function DesktopItem({ item, linkClassName = 'site-nav-link' }: { item: NavItem; linkClassName?: string }) {
  const { navLabel } = useSiteText();
  const isCurrent = useIsCurrent();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);

  if (!item.children?.length) {
    return (
      <li>
        <SiteLink href={item.href} className={linkClassName}><span aria-current={isCurrent(item.href) ? 'page' : undefined}>{navLabel(item)}</span></SiteLink>
      </li>
    );
  }
  return (
    <li ref={ref} className="relative" onMouseLeave={() => setOpen(false)}>
      <button type="button" className={`${linkClassName} gap-1 border-0 bg-transparent`} aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((o) => !o)} onMouseEnter={() => setOpen(true)}>
        {navLabel(item)} <ChevronDown size={16} aria-hidden />
      </button>
      {open && (
        <ul id={menuId} className="site-card absolute left-0 top-full z-50 m-0 min-w-[200px] list-none p-2 shadow-lg" style={{ background: 'var(--site-bg)' }}>
          {item.href && item.href !== '#' && <li><SiteLink href={item.href} className="site-nav-link w-full">{navLabel(item)}</SiteLink></li>}
          {item.children.map((c, i) => <li key={i}><SiteLink href={c.href} className="site-nav-link w-full">{navLabel(c)}</SiteLink></li>)}
        </ul>
      )}
    </li>
  );
}

/** Cart icon (shop enabled) and account link (courses enabled) — §4 header requirement. */
function ShopAccountLinks({ className = '' }: { className?: string }) {
  const { settings, siteId } = useSiteRuntime();
  const { s } = useSiteText();
  const cart = useSiteCart(siteId);
  if (!settings.shop?.enabled && !settings.courses?.enabled) return null;
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {settings.shop?.enabled && (
        <SiteLink href="/cart" ariaLabel={s('Cart')} className="site-btn site-btn-ghost site-btn-sm relative !px-2">
          <ShoppingCart size={18} aria-hidden />
          {cart.count > 0 && <span className="site-badge site-badge-accent absolute -right-1 -top-1 !min-w-0 !px-1 text-[10px]">{cart.count}</span>}
        </SiteLink>
      )}
      {settings.courses?.enabled && (
        <SiteLink href="/account" ariaLabel={s('Account')} className="site-btn site-btn-ghost site-btn-sm !px-2">
          <UserRound size={18} aria-hidden />
        </SiteLink>
      )}
    </div>
  );
}

/* ── Top bar (portal / corporate) ────────────────────────────────────────── */

/** Bangla date/time (Intl `bn-BD`) plus contact, social and login links — theme.settings.topBar (C1). */
function TopBar({ tone }: { tone: 'portal' | 'corporate' }) {
  const { settings, institution, lang } = useSiteRuntime();
  const { navLabel } = useSiteText();
  const tb = settings.topBar;
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const c = institution?.contact ?? {};
  const hasContact = tb?.showContact !== false && (c.phone || c.email);
  const hasDate = tb?.showDate === true;
  const hasSocial = tb?.showSocial !== false;
  const hasLogin = (tb?.loginLinks?.length ?? 0) > 0;
  if (!hasContact && !hasDate && !hasSocial && !hasLogin) return null;
  return (
    <div className={`site-topbar ${tone === 'portal' ? 'site-topbar-portal' : 'site-topbar-corporate'}`}>
      <div className="site-container site-w-wide flex min-h-[36px] flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {hasDate && now && (
            <time dateTime={now.toISOString()} lang={lang === 'bn' ? 'bn' : undefined}>
              {formatSiteDate(now, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </time>
          )}
          {hasContact && (
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {c.phone && <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1"><Phone size={13} aria-hidden />{c.phone}</a>}
              {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1"><Mail size={13} aria-hidden />{c.email}</a>}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {hasLogin && tb!.loginLinks!.map((l, i) => <SiteLink key={i} href={l.href} className="font-medium">{navLabel({ label: l.label, labelBn: l.labelBn, href: l.href })}</SiteLink>)}
          {hasSocial && <SocialLinks className="!gap-1 [&_a]:!min-h-0 [&_a]:!border-0 [&_a]:!bg-transparent [&_a]:!p-1" />}
        </div>
      </div>
    </div>
  );
}

/* ── Header variants ─────────────────────────────────────────────────────── */

function BrandMark({ nameClassName = '', logoWidth = 160 }: { nameClassName?: string; logoWidth?: number }) {
  const { settings, institution } = useSiteRuntime();
  const { s } = useSiteText();
  const name = useSiteName();
  const logo = settings.logoUrl || institution?.logo;
  return (
    <SiteLink href="/" className="flex min-w-0 items-center gap-3 no-underline" ariaLabel={`${name} — ${s('Home')}`}>
      {logo && <SiteImage src={logo} alt="" width={logoWidth} eager className="h-10 w-auto max-w-[120px] object-contain" />}
      <span className={`truncate text-lg font-bold ${nameClassName}`} style={{ fontFamily: 'var(--site-heading-font)' }}>{name}</span>
    </SiteLink>
  );
}

function MobileMenu({ items, open, onClose, panelId, linkClassName = 'site-nav-link', background }: { items: NavItem[]; open: boolean; onClose: () => void; panelId: string; linkClassName?: string; background?: string }) {
  const { navLabel } = useSiteText();
  const { pathname } = useLocation();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- close on navigation only; `onClose` is a stable setState wrapper from the caller.
  useEffect(() => { onClose(); }, [pathname]);
  if (!open) return null;
  return (
    <nav id={panelId} aria-label="Main" className="lg:hidden" style={{ borderTop: '1px solid var(--site-border)', background: background ?? 'var(--site-bg)' }}>
      <ul className="site-container m-0 flex max-h-[70vh] list-none flex-col gap-1 overflow-y-auto py-3">
        {items.map((it, i) => (
          <li key={i}>
            <SiteLink href={it.href} className={`${linkClassName} w-full`}>{navLabel(it)}</SiteLink>
            {it.children?.length ? (
              <ul className="m-0 list-none pl-4">
                {it.children.map((c, j) => <li key={j}><SiteLink href={c.href} className={`${linkClassName} w-full text-sm`}>{navLabel(c)}</SiteLink></li>)}
              </ul>
            ) : null}
          </li>
        ))}
        <li className="pt-2 sm:hidden"><LanguageToggle /></li>
      </ul>
    </nav>
  );
}

function MenuToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { s } = useSiteText();
  const panelId = useId();
  return (
    <button type="button" className="site-btn site-btn-ghost site-btn-sm !px-2 site-menu-toggle" aria-expanded={open} aria-controls={panelId} aria-label={open ? s('Close menu') : s('Open menu')} onClick={onToggle}>
      {open ? <X aria-hidden /> : <Menu aria-hidden />}
    </button>
  );
}

/** `modern`: sticky, blurred (the original single design) — unchanged default. */
function ModernHeader() {
  const { navigation } = useSiteRuntime();
  const [open, setOpen] = useState(false);
  const items = navigation?.header ?? [];
  const panelId = useId();
  return (
    <header className="site-header">
      <div className="site-container site-w-wide flex min-h-[64px] items-center gap-3">
        <div className="mr-auto min-w-0"><BrandMark /></div>
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="m-0 flex list-none items-center gap-1 p-0">{items.map((it, i) => <DesktopItem key={i} item={it} />)}</ul>
        </nav>
        <LanguageToggle className="hidden sm:inline-flex" />
        <ShopAccountLinks />
        {items.length > 0 && <MenuToggle open={open} onToggle={() => setOpen((o) => !o)} />}
      </div>
      <MobileMenu items={items} open={open} onClose={() => setOpen(false)} panelId={panelId} />
    </header>
  );
}

/** `minimal`: logo + text nav, no top bar, not sticky. */
function MinimalHeader() {
  const { navigation } = useSiteRuntime();
  const [open, setOpen] = useState(false);
  const items = navigation?.header ?? [];
  const panelId = useId();
  return (
    <header style={{ borderBottom: '1px solid var(--site-border)' }}>
      <div className="site-container site-w-wide flex min-h-[72px] items-center gap-3">
        <div className="mr-auto min-w-0"><BrandMark /></div>
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="m-0 flex list-none items-center gap-4 p-0">
            {items.map((it, i) => <DesktopItem key={i} item={it} linkClassName="site-nav-link !bg-transparent !px-0 hover:!underline" />)}
          </ul>
        </nav>
        <LanguageToggle className="hidden sm:inline-flex" />
        <ShopAccountLinks />
        {items.length > 0 && <MenuToggle open={open} onToggle={() => setOpen((o) => !o)} />}
      </div>
      <MobileMenu items={items} open={open} onClose={() => setOpen(false)} panelId={panelId} />
    </header>
  );
}

/** `centered`: logo on top, nav centred underneath. */
function CenteredHeader() {
  const { navigation } = useSiteRuntime();
  const [open, setOpen] = useState(false);
  const items = navigation?.header ?? [];
  const panelId = useId();
  return (
    <header className="site-header">
      <div className="site-container site-w-wide flex flex-col items-center gap-2 py-3">
        <div className="flex w-full items-center justify-between gap-3 lg:justify-center">
          <div className="lg:hidden"><BrandMark logoWidth={120} /></div>
          <div className="hidden lg:block"><BrandMark logoWidth={140} /></div>
          <div className="flex items-center gap-1 lg:hidden">
            <ShopAccountLinks />
            {items.length > 0 && <MenuToggle open={open} onToggle={() => setOpen((o) => !o)} />}
          </div>
        </div>
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="m-0 flex list-none items-center gap-1 p-0">{items.map((it, i) => <DesktopItem key={i} item={it} />)}</ul>
        </nav>
        <div className="hidden items-center gap-2 lg:flex"><LanguageToggle /><ShopAccountLinks /></div>
      </div>
      <MobileMenu items={items} open={open} onClose={() => setOpen(false)} panelId={panelId} />
    </header>
  );
}

/** `banner`: wide gradient/image banner with the logo + name overlaid; a plain nav bar underneath. */
function BannerHeader() {
  const { navigation, settings, institution } = useSiteRuntime();
  const { s, tx } = useSiteText();
  const name = useSiteName();
  const tagline = tx(settings.tagline, settings.taglineBn);
  const logo = settings.logoUrl || institution?.logo;
  const [open, setOpen] = useState(false);
  const items = navigation?.header ?? [];
  const panelId = useId();
  return (
    <header>
      <div className="site-header-portal-banner">
        <div className="site-container site-w-wide flex flex-col items-center gap-3 py-8 text-center sm:py-10">
          {logo && <SiteImage src={logo} alt="" width={200} eager className="h-16 w-auto max-w-[180px] object-contain drop-shadow" />}
          <SiteLink href="/" ariaLabel={`${name} — ${s('Home')}`} className="no-underline">
            <span className="block text-2xl font-extrabold sm:text-3xl" style={{ fontFamily: 'var(--site-heading-font)' }}>{name}</span>
          </SiteLink>
          {tagline && <p className="max-w-xl text-sm opacity-90 sm:text-base">{tagline}</p>}
        </div>
      </div>
      <div className="site-nav-portal">
        <div className="site-container site-w-wide flex min-h-[52px] items-center gap-3">
          <nav aria-label="Main" className="hidden flex-1 lg:block">
            <ul className="m-0 flex list-none items-center gap-1 p-0">{items.map((it, i) => <DesktopItem key={i} item={it} />)}</ul>
          </nav>
          <div className="ml-auto flex items-center gap-1 lg:ml-0">
            <LanguageToggle className="hidden sm:inline-flex" />
            <ShopAccountLinks />
            {items.length > 0 && <MenuToggle open={open} onToggle={() => setOpen((o) => !o)} />}
          </div>
        </div>
      </div>
      <MobileMenu items={items} open={open} onClose={() => setOpen(false)} panelId={panelId} />
    </header>
  );
}

/** `portal`: Style A — purple top bar (Bangla date, EN/Login links), wide banner with logo+name, nav bar with a home icon and dividers between items. */
function PortalHeader() {
  const { navigation } = useSiteRuntime();
  const { s } = useSiteText();
  const items = navigation?.header ?? [];
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <header>
      <TopBar tone="portal" />
      <div className="site-header-portal-banner">
        <div className="site-container site-w-wide flex flex-col items-center gap-3 py-7 text-center sm:flex-row sm:justify-center sm:text-left">
          <BrandMark nameClassName="!text-2xl sm:!text-3xl" logoWidth={180} />
        </div>
      </div>
      <div className="site-nav-portal">
        <div className="site-container site-w-wide flex min-h-[52px] items-center gap-1">
          <SiteLink href="/" ariaLabel={s('Home')} className="site-home-tile mr-1 flex-none" style={{ borderRadius: 'var(--site-radius)' }}><Home size={18} aria-hidden /></SiteLink>
          <nav aria-label="Main" className="hidden flex-1 lg:block">
            <ul className="m-0 flex list-none items-center p-0">{items.map((it, i) => <DesktopItem key={i} item={it} />)}</ul>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <LanguageToggle className="hidden sm:inline-flex" />
            <ShopAccountLinks />
            {items.length > 0 && <MenuToggle open={open} onToggle={() => setOpen((o) => !o)} />}
          </div>
        </div>
      </div>
      <MobileMenu items={items} open={open} onClose={() => setOpen(false)} panelId={panelId} />
    </header>
  );
}

/** `corporate`: Style B — thin navy top bar (phone/email/social), white header (round logo, name, tagline), navy nav with an accent home tile and dropdowns. */
function CorporateHeader() {
  const { navigation, settings, institution } = useSiteRuntime();
  const { s, tx } = useSiteText();
  const name = useSiteName();
  const tagline = tx(settings.tagline, settings.taglineBn);
  const logo = settings.logoUrl || institution?.logo;
  const items = navigation?.header ?? [];
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <header>
      <TopBar tone="corporate" />
      <div style={{ background: '#fff', borderBottom: '1px solid var(--site-border)' }}>
        <div className="site-container site-w-wide flex min-h-[84px] items-center gap-4 py-3">
          {logo ? (
            <SiteImage src={logo} alt="" width={140} eager className="h-14 w-14 flex-none rounded-full object-cover" style={{ boxShadow: '0 0 0 2px var(--site-border)' }} />
          ) : null}
          <div className="mr-auto min-w-0">
            <SiteLink href="/" ariaLabel={`${name} — ${s('Home')}`} className="no-underline">
              <span className="block truncate text-xl font-extrabold" style={{ color: '#0f172a', fontFamily: 'var(--site-heading-font)' }}>{name}</span>
            </SiteLink>
            {tagline && <p className="truncate text-sm" style={{ color: '#475569' }}>{tagline}</p>}
          </div>
          <LanguageToggle className="hidden sm:inline-flex" />
          <ShopAccountLinks />
        </div>
      </div>
      <div className="site-nav-corporate">
        <div className="site-container site-w-wide flex min-h-[52px] items-center gap-1">
          <SiteLink href="/" ariaLabel={s('Home')} className="site-home-tile mr-1 flex-none"><Home size={18} aria-hidden /></SiteLink>
          <nav aria-label="Main" className="hidden flex-1 lg:block">
            <ul className="m-0 flex list-none items-center p-0">{items.map((it, i) => <DesktopItem key={i} item={it} linkClassName="site-nav-link" />)}</ul>
          </nav>
          {items.length > 0 && <div className="ml-auto"><MenuToggle open={open} onToggle={() => setOpen((o) => !o)} /></div>}
        </div>
      </div>
      <MobileMenu items={items} open={open} onClose={() => setOpen(false)} panelId={panelId} linkClassName="site-nav-link !text-[color:#0f172a]" />
    </header>
  );
}

const HEADER_BY_STYLE: Record<SiteHeaderStyle, () => ReactNode> = {
  modern: ModernHeader, minimal: MinimalHeader, centered: CenteredHeader, banner: BannerHeader, portal: PortalHeader, corporate: CorporateHeader,
};

export function SiteHeader() {
  const { theme } = useSiteRuntime();
  const Cmp = HEADER_BY_STYLE[theme.headerStyle ?? 'modern'] ?? ModernHeader;
  return <>{Cmp()}</>;
}

/* ── Footer variants ─────────────────────────────────────────────────────── */

function PoweredByCredit({ className = '' }: { className?: string }) {
  const { poweredBy } = useSiteRuntime();
  const { s } = useSiteText();
  if (!poweredBy) return null;
  return <p className={`text-xs opacity-75 ${className}`}>{s('Powered by')} PeopleNIT</p>;
}

function FooterBrandColumn() {
  const { settings } = useSiteRuntime();
  const { tx } = useSiteText();
  const name = useSiteName();
  const tagline = tx(settings.tagline, settings.taglineBn);
  const footerText = tx(settings.footerText, settings.footerTextBn);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-lg font-bold" style={{ fontFamily: 'var(--site-heading-font)' }}>{name}</p>
      {tagline && <p className="opacity-90">{tagline}</p>}
      {footerText && <p className="whitespace-pre-line text-sm opacity-80">{footerText}</p>}
      <SocialLinks />
    </div>
  );
}

function FooterQuickLinks({ items }: { items: NavItem[] }) {
  const { s, navLabel } = useSiteText();
  if (!items.length) return null;
  return (
    <nav aria-label={s('Quick links')}>
      <p className="mb-3 font-semibold">{s('Quick links')}</p>
      <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-2 p-0">
        {items.map((it, i) => <li key={i}><SiteLink href={it.href}>{navLabel(it)}</SiteLink></li>)}
      </ul>
    </nav>
  );
}

function FooterContactColumn() {
  const { institution } = useSiteRuntime();
  const { s } = useSiteText();
  const c = institution?.contact ?? {};
  if (!c.phone && !c.email && !c.address) return null;
  return (
    <address className="not-italic">
      <p className="mb-3 font-semibold">{s('Contact')}</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
        {c.address && <li className="whitespace-pre-line">{c.address}</li>}
        {c.phone && <li><SiteLink href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>{c.phone}</SiteLink></li>}
        {c.email && <li><SiteLink href={`mailto:${c.email}`}>{c.email}</SiteLink></li>}
      </ul>
    </address>
  );
}

function CopyrightLine({ dark }: { dark?: boolean }) {
  const { lang } = useSiteRuntime();
  const { s } = useSiteText();
  const name = useSiteName();
  return (
    <div style={{ borderTop: dark ? '1px solid rgba(255,255,255,.12)' : '1px solid var(--site-border)' }}>
      <div className="site-container site-w-wide flex flex-wrap items-center justify-between gap-2 py-4 text-sm opacity-80">
        <p className="m-0">© {new Intl.NumberFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { useGrouping: false }).format(new Date().getFullYear())} {name}. {s('All rights reserved.')}</p>
        <PoweredByCredit />
      </div>
    </div>
  );
}

/** `modern` (the original default): brand + quick links + contact, three columns. */
function ModernFooter() {
  const { navigation } = useSiteRuntime();
  return (
    <footer className="site-footer">
      <div className="site-container site-w-wide grid grid-cols-1 gap-8 py-12 sm:grid-cols-2 lg:grid-cols-3">
        <FooterBrandColumn />
        <FooterQuickLinks items={navigation?.footer ?? []} />
        <FooterContactColumn />
      </div>
      <CopyrightLine />
    </footer>
  );
}

/** `minimal`: one line. */
function MinimalFooter() {
  const name = useSiteName();
  const { s } = useSiteText();
  const { lang } = useSiteRuntime();
  return (
    <footer className="site-footer">
      <div className="site-container site-w-wide flex flex-wrap items-center justify-between gap-2 py-6 text-sm">
        <p className="m-0">© {new Intl.NumberFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { useGrouping: false }).format(new Date().getFullYear())} {name}. {s('All rights reserved.')}</p>
        <PoweredByCredit />
      </div>
    </footer>
  );
}

/** `columns`: four light columns (brand, quick links, contact, follow us). */
function ColumnsFooter() {
  const { navigation } = useSiteRuntime();
  const { s } = useSiteText();
  return (
    <footer className="site-footer">
      <div className="site-container site-w-wide grid grid-cols-1 gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <FooterBrandColumn />
        <FooterQuickLinks items={navigation?.footer ?? []} />
        <FooterContactColumn />
        <div>
          <p className="mb-3 font-semibold">{s('Follow us')}</p>
          <SocialLinks />
        </div>
      </div>
      <CopyrightLine />
    </footer>
  );
}

/** `corporate`: Style B — four dark-navy columns, darker copyright strip, orange accent line on top. */
function CorporateFooter() {
  const { navigation } = useSiteRuntime();
  const { s } = useSiteText();
  return (
    <footer className="site-footer-dark">
      <div style={{ height: 4, background: 'var(--site-accent)' }} aria-hidden />
      <div className="site-container site-w-wide grid grid-cols-1 gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <FooterBrandColumn />
        <FooterQuickLinks items={navigation?.footer ?? []} />
        <FooterContactColumn />
        <div>
          <p className="mb-3 font-semibold">{s('Follow us')}</p>
          <SocialLinks />
        </div>
      </div>
      <CopyrightLine dark />
    </footer>
  );
}

/** `portal`: Style A — skyline divider, address/phone/email, quick links, copyright + credit. No visitor counter (no real data source exists for one — never a fake number). */
function PortalFooter() {
  const { navigation } = useSiteRuntime();
  return (
    <footer className="site-footer">
      <svg className="site-skyline" viewBox="0 0 400 28" preserveAspectRatio="none" aria-hidden focusable="false">
        <path fill="currentColor" d="M0 28V18l10-4 8 4V8l14-6 12 6v6l16-8 14 8v4l18-10 16 10v2l20-6 18 6v-4l22 8 20-8v6l24-4 22 4v4l26-8 24 8v-6l28 6 26-6v8H0Z" />
      </svg>
      <div className="site-container site-w-wide grid grid-cols-1 gap-8 py-10 sm:grid-cols-2 lg:grid-cols-3">
        <FooterBrandColumn />
        <FooterQuickLinks items={navigation?.footer ?? []} />
        <FooterContactColumn />
      </div>
      <CopyrightLine />
    </footer>
  );
}

const FOOTER_BY_STYLE: Record<SiteFooterStyle, () => ReactNode> = {
  modern: ModernFooter, minimal: MinimalFooter, columns: ColumnsFooter, corporate: CorporateFooter, portal: PortalFooter,
};

export function SiteFooter() {
  const { theme } = useSiteRuntime();
  const Cmp = FOOTER_BY_STYLE[theme.footerStyle ?? 'modern'] ?? ModernFooter;
  return <>{Cmp()}</>;
}

/* ── Boxed layout + page-background pattern (theme.layout / theme.pageBackground) ── */

const PATTERN_KEYS = new Set(['dots', 'grid', 'diagonal', 'waves']);

/** Wraps the header/main/footer in a centred ~1000px column over a patterned/image background when `theme.layout === 'boxed'`; a no-op otherwise. */
export function SitePageFrame({ children }: { children: ReactNode }) {
  const { theme } = useSiteRuntime();
  if (theme.layout !== 'boxed') return <>{children}</>;
  const bg = theme.pageBackground ?? 'none';
  const isPattern = PATTERN_KEYS.has(bg);
  const isImage = /^https:\/\//i.test(bg);
  return (
    <div
      className={`site-page-outer min-h-screen ${isPattern ? `site-bg-${bg}` : ''}`}
      style={isImage ? { backgroundImage: `url(${bg})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' } : undefined}
    >
      <div className="site-page-boxed">{children}</div>
    </div>
  );
}

export function PreviewBar() {
  const { s } = useSiteText();
  return (
    <div className="site-preview-bar" role="status">
      <div className="site-container site-w-wide flex min-h-[40px] flex-wrap items-center gap-x-3 gap-y-1 py-2">
        <Eye size={16} aria-hidden />
        <strong>{s('Preview — not published')}</strong>
        <span className="text-sm opacity-90">{s('You are viewing a draft. Visitors can’t see these changes yet.')}</span>
      </div>
    </div>
  );
}

export function SiteNotFound() {
  const { s } = useSiteText();
  return (
    <section className="site-pad-lg">
      <div className="site-container site-w-narrow flex flex-col items-center gap-4 text-center">
        <p className="text-6xl font-extrabold" style={{ color: 'var(--site-primary-text)' }} aria-hidden>404</p>
        <h1 className="site-h2">{s('Page not found')}</h1>
        <p className="site-muted">{s('The page you’re looking for doesn’t exist or hasn’t been published yet.')}</p>
        <SiteLink href="/" className="site-btn site-btn-primary">{s('Go to the home page')}</SiteLink>
      </div>
    </section>
  );
}
