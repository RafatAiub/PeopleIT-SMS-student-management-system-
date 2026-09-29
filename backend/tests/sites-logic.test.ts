// Pure-logic tests for the website builder (Sites). No database, no network:
// DNS lookups go through a fake resolver.

import {
  buildRobots,
  buildSitemap,
  dobMatches,
  isDangerousUrl,
  mapEnquiryValues,
  maskName,
  normalizePuckData,
  PageDataError,
  publicSettings,
  sanitizeHtml,
  sanitizeJson,
  sanitizeText,
  slugify,
  subdomainFromSlug,
  uniqueSlug,
  validateFormDefinition,
  validateSubmission,
  versionsToPrune,
  type FormField,
} from '../src/modules/sites/sites.logic';
import { hostnameProblem, isPlatformHostname, looksLikeApex, normalizeHostname, wwwAlternate } from '../src/modules/sites/domains/hostname';
import { checkDns, dnsInstructions, evaluateDns, txtRecordName, txtRecordValue, type DnsResolver } from '../src/modules/sites/domains/dns';
import { decideDomainStatus, DNS_GIVE_UP_MS } from '../src/modules/sites/domains/decide';

describe('hostname validation', () => {
  it('normalises pasted URLs', () => {
    expect(normalizeHostname('HTTPS://www.School.edu.bd:443/about?x=1')).toBe('www.school.edu.bd');
    expect(normalizeHostname(' school.com. ')).toBe('school.com');
    expect(normalizeHostname('user:pw@evil.com/x')).toBe('evil.com');
  });

  it('accepts real hostnames and rejects bad ones', () => {
    expect(hostnameProblem('www.school.edu.bd')).toBeNull();
    expect(hostnameProblem('xn--p1ai.xn--p1ai')).toBeNull();
    expect(hostnameProblem('')).toBe('EMPTY');
    expect(hostnameProblem('localhost')).toBe('NO_DOT');
    expect(hostnameProblem('10.0.0.1')).toBe('IP_ADDRESS');
    expect(hostnameProblem('*.school.com')).toBe('WILDCARD');
    expect(hostnameProblem('-bad.school.com')).toBe('BAD_LABEL');
    expect(hostnameProblem('bad_label.school.com')).toBe('BAD_LABEL');
    expect(hostnameProblem('school.c0m')).toBe('BAD_TLD');
    expect(hostnameProblem(`${'a'.repeat(250)}.com`)).toBe('TOO_LONG');
  });

  it('refuses the platform’s own hostnames', () => {
    const roots = ['peoplenit.app', 'trycloudflare.com'];
    const exact = ['peopleitsms.vercel.app'];
    expect(isPlatformHostname('peoplenit.app', roots, exact)).toBe(true);
    expect(isPlatformHostname('abc.peoplenit.app', roots, exact)).toBe(true);
    expect(isPlatformHostname('x.trycloudflare.com', roots, exact)).toBe(true);
    expect(isPlatformHostname('peopleitsms.vercel.app', roots, exact)).toBe(true);
    expect(isPlatformHostname('other.vercel.app', roots, exact)).toBe(false);
    expect(isPlatformHostname('notpeoplenit.app', roots, exact)).toBe(false);
    expect(isPlatformHostname('school.com', [''], [])).toBe(false);
  });

  it('www alternate and apex heuristic', () => {
    expect(wwwAlternate('www.a.com')).toBe('a.com');
    expect(wwwAlternate('a.com')).toBe('www.a.com');
    expect(looksLikeApex('school.com')).toBe(true);
    expect(looksLikeApex('school.edu.bd')).toBe(true);
    expect(looksLikeApex('www.school.com')).toBe(false);
    expect(looksLikeApex('portal.school.com')).toBe(false);
  });
});

describe('DNS verification', () => {
  const token = 'abc123';
  const expected = { cnameTarget: 'peoplenit.app', token };

  it('passes on a matching CNAME (case/trailing dot insensitive)', () => {
    const r = evaluateDns({ cname: ['PeopleNIT.app.'], txt: [], a: [] }, expected);
    expect(r.ok).toBe(true);
    expect(r.method).toBe('CNAME');
  });

  it('passes on the TXT token, including split strings and bare token', () => {
    expect(evaluateDns({ cname: [], txt: [['peoplenit-verify=', 'abc123']], a: [] }, expected).method).toBe('TXT');
    expect(evaluateDns({ cname: [], txt: [['abc123']], a: [] }, expected).ok).toBe(true);
  });

  it('passes on apex A records only when every IP is ours', () => {
    const exp = { ...expected, apexIps: ['1.2.3.4'] };
    expect(evaluateDns({ cname: [], txt: [], a: ['1.2.3.4'] }, exp).method).toBe('A');
    expect(evaluateDns({ cname: [], txt: [], a: ['1.2.3.4', '9.9.9.9'] }, exp).ok).toBe(false);
  });

  it('fails with a helpful detail otherwise', () => {
    const r = evaluateDns({ cname: ['other.host'], txt: [['wrong']], a: [] }, expected);
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/other\.host/);
  });

  it('checkDns treats lookup errors as empty and uses the TXT name', async () => {
    const asked: string[] = [];
    const resolver: DnsResolver = {
      resolveCname: async () => {
        throw Object.assign(new Error('nodata'), { code: 'ENODATA' });
      },
      resolveTxt: async (h) => {
        asked.push(h);
        return [[txtRecordValue(token)]];
      },
      resolve4: async () => [],
    };
    const r = await checkDns('www.school.com', expected, resolver);
    expect(r.ok).toBe(true);
    expect(asked[0]).toBe(txtRecordName('www.school.com'));
    expect(asked[0]).toBe('_peoplenit-verify.www.school.com');
  });

  it('dnsInstructions gives CNAME for subdomains and A for apex when IPs are set', () => {
    const sub = dnsInstructions('www.school.com', { cnameTarget: 'peoplenit.app', token, apex: false });
    expect(sub.map((r) => r.type)).toEqual(['CNAME', 'TXT']);
    const apex = dnsInstructions('school.com', { cnameTarget: 'peoplenit.app', token, apex: true, apexIps: ['1.2.3.4'] });
    expect(apex.map((r) => r.type)).toEqual(['A', 'TXT']);
    const none = dnsInstructions('www.school.com', { cnameTarget: null, token, apex: false });
    expect(none.map((r) => r.type)).toEqual(['TXT']);
  });

  it('decideDomainStatus', () => {
    const now = new Date('2026-09-28T00:00:00Z');
    const base = { dnsDetail: 'nope', createdAt: now, now };
    expect(decideDomainStatus({ ...base, dnsOk: true, provider: { state: 'dns' } }).status).toBe('ACTIVE');
    expect(decideDomainStatus({ ...base, dnsOk: false, provider: { state: 'dns' } }).status).toBe('PENDING_DNS');
    expect(decideDomainStatus({ ...base, dnsOk: true, provider: { state: 'pending' } }).status).toBe('VERIFYING');
    expect(decideDomainStatus({ ...base, dnsOk: false, provider: { state: 'active' } }).status).toBe('ACTIVE');
    expect(decideDomainStatus({ ...base, dnsOk: true, provider: { state: 'failed', detail: 'x' } }).status).toBe('FAILED');
    expect(decideDomainStatus({ ...base, dnsOk: true, provider: null, providerError: 'down' }).status).toBe('VERIFYING');
    const old = new Date(now.getTime() - DNS_GIVE_UP_MS - 1);
    expect(decideDomainStatus({ ...base, createdAt: old, dnsOk: false, provider: null }).status).toBe('FAILED');
    expect(decideDomainStatus({ ...base, createdAt: old, dnsOk: false, provider: null, manualCheck: true }).status).toBe('PENDING_DNS');
  });
});

describe('sanitiser', () => {
  it('removes scripts, handlers and dangerous URLs', () => {
    expect(sanitizeHtml('<p>Hi<script>alert(1)</script></p>')).toBe('<p>Hi</p>');
    expect(sanitizeHtml('<img src=x onerror=alert(1)>')).toBe('<img src=x>');
    expect(sanitizeHtml('<img/onerror=alert(1) src=x>')).not.toContain('onerror');
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a href="#">x</a>');
    expect(sanitizeHtml('<a href="&#106;avascript:alert(1)">x</a>')).toBe('<a href="#">x</a>');
    expect(sanitizeHtml('<a href="https://ok.com" onclick="x()" onmouseover="y()">x</a>')).toBe('<a href="https://ok.com">x</a>');
    expect(sanitizeHtml('<form action="https://evil"><input name=p></form>')).toBe('');
    expect(sanitizeHtml('<div style="background:url(javascript:alert(1))">x</div>')).toBe('<div style="">x</div>');
  });

  it('keeps allow-listed iframes and plain text', () => {
    const yt = '<iframe src="https://www.youtube.com/embed/abc"></iframe>';
    expect(sanitizeHtml(yt)).toBe(yt);
    expect(sanitizeHtml('<iframe src="https://evil.com/x"></iframe>')).toBe('');
    expect(sanitizeHtml('Grade < 5 and > 2')).toBe('Grade < 5 and > 2');
  });

  it('isDangerousUrl', () => {
    expect(isDangerousUrl(' JaVa\tScript:alert(1)')).toBe(true);
    expect(isDangerousUrl('data:text/html,<b>')).toBe(true);
    expect(isDangerousUrl('data:image/png;base64,AAA')).toBe(false);
    expect(isDangerousUrl('https://x.com')).toBe(false);
  });

  it('sanitizeJson cleans deep strings, url keys and prototype keys', () => {
    const out = sanitizeJson(
      JSON.parse('{"a":{"href":"javascript:x","text":"<script>x</script>ok"},"__proto__":{"polluted":true},"n":1}'),
    ) as Record<string, any>;
    expect(out.a.href).toBe('');
    expect(out.a.text).toBe('ok');
    expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(false);
    expect(out.n).toBe(1);
  });

  it('sanitizeText strips tags and control characters', () => {
    expect(sanitizeText('  <b>Rahim</b>\u0007 ')).toBe('Rahim');
    expect(sanitizeText('x'.repeat(50), 10)).toHaveLength(10);
  });
});

describe('Puck data validation', () => {
  it('accepts and cleans a valid document', () => {
    const d = normalizePuckData({ root: { props: {} }, content: [{ type: 'Hero', props: { title: '<script>x</script>Hi' } }] });
    expect(d.content[0].props.title).toBe('Hi');
  });

  it('defaults empty input', () => {
    expect(normalizePuckData(undefined)).toEqual({ root: { props: {} }, content: [] });
  });

  it('rejects bad shapes', () => {
    const bad = [[], { content: 'x' }, { content: [{ props: {} }] }, { content: [{ type: 'a b', props: {} }] }, { content: [], zones: { z: 'x' } }];
    for (const b of bad) {
      let threw = false;
      try {
        normalizePuckData(b);
      } catch (e) {
        threw = e instanceof PageDataError;
      }
      expect(threw).toBe(true);
    }
  });

  it('rejects oversized data', () => {
    let threw = false;
    try {
      normalizePuckData({ content: [{ type: 'RichText', props: { text: 'x'.repeat(2 * 1024 * 1024 + 10) } }] });
    } catch (e) {
      threw = e instanceof PageDataError;
    }
    expect(threw).toBe(true);
  });
});

describe('forms', () => {
  const fields: FormField[] = [
    { key: 'studentName', label: 'Student name', type: 'text', required: true },
    { key: 'phone', label: 'Phone', type: 'phone', required: true },
    { key: 'email', label: 'Email', type: 'email', required: false },
    { key: 'classInterested', label: 'Class', type: 'select', required: false, options: ['Class 1', 'Class 2'] },
    { key: 'agree', label: 'Agree', type: 'checkbox', required: true },
  ];

  it('validates definitions', () => {
    expect(validateFormDefinition(fields, 'ENQUIRY')).toEqual([]);
    expect(validateFormDefinition([fields[0]], 'ENQUIRY').length).toBeGreaterThan(0);
    expect(validateFormDefinition([{ ...fields[0] }, { ...fields[0] }], 'INBOX')[0]).toMatch(/Duplicate/);
    expect(validateFormDefinition([{ key: 'website', label: 'x', type: 'text', required: false }], 'INBOX')[0]).toMatch(/reserved/);
    expect(validateFormDefinition([{ key: 'c', label: 'c', type: 'select', required: false }], 'INBOX')[0]).toMatch(/option/);
  });

  it('validates submissions and drops unknown keys', () => {
    const ok = validateSubmission(fields, {
      studentName: '<b>Rahim</b>',
      phone: '01711 000000',
      classInterested: 'Class 1',
      agree: 'on',
      hacker: 'x',
    });
    expect(ok.ok).toBe(true);
    expect(ok.values.studentName).toBe('Rahim');
    expect(ok.values.agree).toBe(true);
    expect('hacker' in ok.values).toBe(false);

    const bad = validateSubmission(fields, { studentName: '', phone: 'abc', email: 'nope', classInterested: 'Class 9' });
    expect(bad.ok).toBe(false);
    expect(bad.errors.map((e) => e.field).sort()).toEqual(['agree', 'classInterested', 'email', 'phone', 'studentName']);
  });

  it('maps enquiry values', () => {
    const m = mapEnquiryValues({ studentName: 'Rahim', phone: '01711000000', message: 'Hello', agree: true });
    expect(m.studentName).toBe('Rahim');
    expect(m.notes).toContain('Website message: Hello');
    expect(m.notes).toContain('agree: yes');
    expect(m.email).toBeNull();
  });
});

describe('version pruning', () => {
  it('keeps the newest 30', () => {
    const versions = Array.from({ length: 35 }, (_, i) => ({ id: `v${String(i).padStart(2, '0')}`, createdAt: new Date(2026, 0, 1, 0, i) }));
    const pruned = versionsToPrune(versions);
    expect(pruned).toHaveLength(5);
    expect(pruned.sort()).toEqual(['v00', 'v01', 'v02', 'v03', 'v04']);
    expect(versionsToPrune(versions.slice(0, 30))).toEqual([]);
  });

  it('is deterministic on ties', () => {
    const t = new Date();
    expect(versionsToPrune([{ id: 'a', createdAt: t }, { id: 'b', createdAt: t }], 1)).toEqual(['a']);
  });
});

describe('helpers', () => {
  it('slugs', () => {
    expect(slugify('Annual Sports Day 2026!')).toBe('annual-sports-day-2026');
    expect(uniqueSlug('news', ['news', 'news-2'])).toBe('news-3');
    expect(subdomainFromSlug('www')).toBe('www-school');
    expect(subdomainFromSlug('Dhaka Model School')).toBe('dhaka-model-school');
  });

  it('masks names for toppers', () => {
    expect(maskName('Rahim', 'uddin')).toBe('Rahim U.');
    expect(maskName('Nusrat Jahan', '')).toBe('Nusrat');
  });

  it('matches DOB stored as UTC or Dhaka midnight', () => {
    expect(dobMatches(new Date('2012-05-10T00:00:00Z'), '2012-05-10')).toBe(true);
    expect(dobMatches(new Date('2012-05-09T18:00:00Z'), '2012-05-10')).toBe(true);
    expect(dobMatches(new Date('2012-05-10T00:00:00Z'), '2012-05-11')).toBe(false);
  });

  it('exposes only whitelisted settings', () => {
    expect(publicSettings({ siteName: 'X', secretNote: 'y' })).toEqual({ siteName: 'X' });
  });

  it('sitemap and robots', () => {
    const xml = buildSitemap('https://s.com/', [{ path: '/', lastmod: new Date('2026-01-02T00:00:00Z') }, { path: 'a&b' }]);
    expect(xml).toContain('<loc>https://s.com/</loc><lastmod>2026-01-02</lastmod>');
    expect(xml).toContain('https://s.com/a&amp;b');
    expect(buildRobots('https://s.com', true)).toContain('Sitemap: https://s.com/sitemap.xml');
    expect(buildRobots(null, false)).toContain('Disallow: /');
  });
});
