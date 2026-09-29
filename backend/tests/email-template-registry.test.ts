// Pure — no DB, no Redis, no network (same guarantee scripts/email-preview.ts
// relies on). Every entry must render without throwing and produce a
// non-empty subject/html/text — this is what backs both the admin preview
// gallery and the preview script.
import { EMAIL_TEMPLATE_REGISTRY, findTemplate } from '../src/modules/email/templates/registry';

describe('EMAIL_TEMPLATE_REGISTRY', () => {
  it.each(EMAIL_TEMPLATE_REGISTRY.map((t) => [t.key, t] as const))('%s renders a complete EmailContent', (_key, entry) => {
    const mail = entry.render();
    expect(mail.subject.length).toBeGreaterThan(0);
    expect(mail.html).toContain('<!doctype html>');
    expect(mail.text.length).toBeGreaterThan(0);
  });

  it('has no duplicate keys', () => {
    const keys = EMAIL_TEMPLATE_REGISTRY.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every ".bn" variant actually renders lang="bn" (not just an English fallback)', () => {
    const bnEntries = EMAIL_TEMPLATE_REGISTRY.filter((t) => t.key.endsWith('.bn'));
    expect(bnEntries.length).toBeGreaterThan(0);
    for (const entry of bnEntries) {
      expect(entry.render().html).toContain('<html lang="bn"');
    }
  });

  it('findTemplate() returns undefined for an unknown key', () => {
    expect(findTemplate('not-a-real-template')).toBeUndefined();
  });

  it('the bundled-notification-default previews (support/results/payslip/export) render through the shared layout', () => {
    const notificationEntries = EMAIL_TEMPLATE_REGISTRY.filter((t) => t.key.startsWith('notification.'));
    expect(notificationEntries.length).toBe(6);
    for (const entry of notificationEntries) {
      expect(entry.render().html).toContain('<html lang="en"');
    }
  });
});
