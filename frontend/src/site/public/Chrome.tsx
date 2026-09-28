/** Public-site chrome: header (menu, language toggle, mobile menu), footer, preview bar, 404. */
import { useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown, Eye, Menu, X } from 'lucide-react';
import { SiteLink, SiteImage } from '../blocks/shared';
import { SocialLinks } from '../blocks/content';
import { useSiteHref, useSiteRuntime, useSiteText } from '../runtime';
import type { NavItem, SiteLang } from '../types';

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

function DesktopItem({ item }: { item: NavItem }) {
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
        <SiteLink href={item.href} className="site-nav-link"><span aria-current={isCurrent(item.href) ? 'page' : undefined}>{navLabel(item)}</span></SiteLink>
      </li>
    );
  }
  return (
    <li ref={ref} className="relative" onMouseLeave={() => setOpen(false)}>
      <button type="button" className="site-nav-link gap-1 border-0 bg-transparent" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((o) => !o)} onMouseEnter={() => setOpen(true)}>
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

export function SiteHeader() {
  const { navigation, settings, institution } = useSiteRuntime();
  const { s, navLabel } = useSiteText();
  const name = useSiteName();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  const logo = settings.logoUrl || institution?.logo;
  const items = navigation?.header ?? [];
  const panelId = useId();

  return (
    <header className="site-header">
      <div className="site-container site-w-wide flex min-h-[64px] items-center gap-3">
        <SiteLink href="/" className="mr-auto flex min-w-0 items-center gap-3 no-underline" ariaLabel={`${name} — ${s('Home')}`}>
          {logo && <SiteImage src={logo} alt="" width={160} eager className="h-10 w-auto max-w-[120px] object-contain" />}
          <span className="truncate text-lg font-bold" style={{ color: 'var(--site-text)', fontFamily: 'var(--site-heading-font)' }}>{name}</span>
        </SiteLink>
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="m-0 flex list-none items-center gap-1 p-0">{items.map((it, i) => <DesktopItem key={i} item={it} />)}</ul>
        </nav>
        <LanguageToggle className="hidden sm:inline-flex" />
        {items.length > 0 && (
          <button type="button" className="site-btn site-btn-ghost site-btn-sm !px-2 site-menu-toggle" aria-expanded={open} aria-controls={panelId} aria-label={open ? s('Close menu') : s('Open menu')} onClick={() => setOpen((o) => !o)}>
            {open ? <X aria-hidden /> : <Menu aria-hidden />}
          </button>
        )}
      </div>
      {open && (
        <nav id={panelId} aria-label="Main" className="lg:hidden" style={{ borderTop: '1px solid var(--site-border)', background: 'var(--site-bg)' }}>
          <ul className="site-container m-0 flex max-h-[70vh] list-none flex-col gap-1 overflow-y-auto py-3">
            {items.map((it, i) => (
              <li key={i}>
                <SiteLink href={it.href} className="site-nav-link w-full">{navLabel(it)}</SiteLink>
                {it.children?.length ? (
                  <ul className="m-0 list-none pl-4">
                    {it.children.map((c, j) => <li key={j}><SiteLink href={c.href} className="site-nav-link w-full text-sm">{navLabel(c)}</SiteLink></li>)}
                  </ul>
                ) : null}
              </li>
            ))}
            <li className="pt-2 sm:hidden"><LanguageToggle /></li>
          </ul>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  const { navigation, institution, settings, lang } = useSiteRuntime();
  const { s, navLabel, tx } = useSiteText();
  const name = useSiteName();
  const c = institution?.contact ?? {};
  const footerText = tx(settings.footerText, settings.footerTextBn);
  const tagline = tx(settings.tagline, settings.taglineBn);
  const items = navigation?.footer ?? [];
  return (
    <footer className="site-footer">
      <div className="site-container site-w-wide grid grid-cols-1 gap-8 py-12 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-3">
          <p className="text-lg font-bold" style={{ fontFamily: 'var(--site-heading-font)' }}>{name}</p>
          {tagline && <p className="site-muted">{tagline}</p>}
          {footerText && <p className="site-muted whitespace-pre-line text-sm">{footerText}</p>}
          <SocialLinks />
        </div>
        {items.length > 0 && (
          <nav aria-label={s('Quick links')}>
            <p className="mb-3 font-semibold">{s('Quick links')}</p>
            <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-2 p-0">
              {items.map((it, i) => <li key={i}><SiteLink href={it.href}>{navLabel(it)}</SiteLink></li>)}
            </ul>
          </nav>
        )}
        {(c.phone || c.email || c.address) && (
          <address className="not-italic">
            <p className="mb-3 font-semibold">{s('Contact')}</p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
              {c.address && <li className="whitespace-pre-line">{c.address}</li>}
              {c.phone && <li><SiteLink href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>{c.phone}</SiteLink></li>}
              {c.email && <li><SiteLink href={`mailto:${c.email}`}>{c.email}</SiteLink></li>}
            </ul>
          </address>
        )}
      </div>
      <div style={{ borderTop: '1px solid var(--site-border)' }}>
        <p className="site-container site-w-wide site-muted py-4 text-sm">
          © {new Intl.NumberFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { useGrouping: false }).format(new Date().getFullYear())} {name}. {s('All rights reserved.')}
        </p>
      </div>
    </footer>
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
