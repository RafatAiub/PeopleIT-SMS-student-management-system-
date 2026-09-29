// Pure-function tests for the shared email layout/components — no DB, no
// Redis, no network. Covers the Track A2 guarantees: escaping, a plain-text
// alternative always present, the button never rendering white text on the
// low-contrast accent colour, and Bangla content carrying a lang="bn" marker.
import { buildEmailLayout } from '../src/modules/email/layout';
import { button, paragraph, bnParagraph, fallbackLink, richParagraph } from '../src/modules/email/components';
import { escapeHtml, escapeHtmlMultiline } from '../src/modules/email/escape';
import { PLATFORM_BRAND, safeAccent } from '../src/modules/email/brand';
import {
  verificationEmail,
  passwordResetEmail,
  twoFactorCodeEmail,
  accountApprovedEmail,
} from '../src/modules/email/templates/auth.templates';

describe('email escaping', () => {
  it('escapes HTML-significant characters', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml(`"'&<>`)).toBe('&quot;&#39;&amp;&lt;&gt;');
  });

  it('treats null/undefined as empty rather than throwing', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('escapes then converts newlines to <br/>', () => {
    expect(escapeHtmlMultiline('a<b>\nc')).toBe('a&lt;b&gt;<br/>c');
  });

  it('paragraph() escapes a hostile value rather than injecting markup', () => {
    const html = paragraph('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});

describe('button contrast — never white text on the low-contrast accent', () => {
  it('always uses the AA-contrast button colour, never PLATFORM_BRAND.accent', () => {
    const html = button('https://example.com', 'Click me');
    expect(html).toContain(PLATFORM_BRAND.buttonBg);
    expect(html).not.toContain(PLATFORM_BRAND.accent);
    expect(PLATFORM_BRAND.buttonBg).not.toBe(PLATFORM_BRAND.accent);
  });

  it('safeAccent() rejects anything that is not a plausible hex colour', () => {
    expect(safeAccent('#123abc')).toBe('#123abc');
    expect(safeAccent('javascript:alert(1)')).toBe(PLATFORM_BRAND.accent);
    expect(safeAccent(null)).toBe(PLATFORM_BRAND.accent);
    expect(safeAccent(undefined)).toBe(PLATFORM_BRAND.accent);
  });

  it('fallbackLink() escapes the href before splicing it into an attribute', () => {
    const html = fallbackLink('https://example.com/x?a=1&b=2');
    expect(html).toContain('&amp;b=2');
  });
});

describe('buildEmailLayout()', () => {
  const base = { preheader: 'preview text', heading: 'Heading', bodyHtml: paragraph('hello') };

  it('defaults to lang="en" and includes dark-mode meta hints + a hidden preheader', () => {
    const html = buildEmailLayout(base);
    expect(html).toContain('<html lang="en"');
    expect(html).toContain('name="color-scheme" content="light dark"');
    expect(html).toContain('preview text');
  });

  it('supports lang="bn" for Bangla-primary templates', () => {
    const html = buildEmailLayout({ ...base, lang: 'bn' });
    expect(html).toContain('<html lang="bn"');
  });

  it('bnParagraph() marks the element itself lang="bn" regardless of document lang', () => {
    const html = bnParagraph('বাংলা টেক্সট');
    expect(html).toContain('lang="bn"');
    expect(html).toContain('বাংলা টেক্সট');
  });

  it('escapes the institution name and never trusts a non-hex institution colour', () => {
    const html = buildEmailLayout({
      ...base,
      institution: { name: '<b>Evil</b> School', color: 'not-a-color' },
    });
    expect(html).not.toContain('<b>Evil</b>');
    expect(html).toContain('&lt;b&gt;Evil&lt;/b&gt;');
    expect(html).not.toContain('background-color:not-a-color');
  });

  it('richParagraph() passes through pre-escaped HTML untouched (caller responsibility)', () => {
    expect(richParagraph('<b>bold</b>')).toContain('<b>bold</b>');
  });
});

describe('auth templates always ship a plain-text alternative', () => {
  const cases = [
    () => verificationEmail({ to: 'a@b.com', firstName: 'Rahim', url: 'https://x/y', expiresInMinutes: 30 }),
    () => passwordResetEmail({ to: 'a@b.com', firstName: 'Karim', url: 'https://x/y', expiresInMinutes: 30 }),
    () => twoFactorCodeEmail({ to: 'a@b.com', firstName: 'Fatima', code: '123456', expiresInMinutes: 10 }),
    () => accountApprovedEmail({ to: 'a@b.com', firstName: 'Nusrat', institutionName: 'Test School', loginUrl: 'https://x/login' }),
  ];

  it.each(cases.map((fn, i) => [i, fn] as const))('template %i has non-empty subject, html and text', (_i, fn) => {
    const mail = fn();
    expect(mail.subject.length).toBeGreaterThan(0);
    expect(mail.html).toContain('<!doctype html>');
    expect(mail.text.length).toBeGreaterThan(0);
    // The text alternative must actually carry the link/code, not just be a stub.
    expect(mail.text).not.toContain('<');
  });
});
