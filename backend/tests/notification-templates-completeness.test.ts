// Pure/structural — no DB, no Redis. DEFAULT_TEMPLATES is keyed by a plain
// `${type}:${channel}` string (not a typed Record), so a new NotificationType
// missing its EMAIL/IN_APP bundled default is NOT a compile error — only a
// 400 at first send. This test is the regression guard for that gap,
// especially now that support tickets / results / payslips / data export
// were added on top of the original set.
import { NOTIFICATION_TYPES } from '../src/modules/notifications/notifications.dto';
import { DEFAULT_TEMPLATES, defaultTemplateKey } from '../src/modules/notifications/templates.defaults';
import { interpolate } from '../src/modules/notifications/renderer';
import { DEFAULT_CHANNELS } from '../src/modules/notifications/notifications.service';

describe('DEFAULT_TEMPLATES completeness', () => {
  it.each(NOTIFICATION_TYPES)('%s has a bundled IN_APP default', (type) => {
    expect(DEFAULT_TEMPLATES[defaultTemplateKey(type, 'IN_APP')]).toBeDefined();
  });

  // Only types that actually go out over EMAIL by default need a bundled
  // EMAIL template — e.g. EVENT_PUBLISHED is IN_APP-only by design (see
  // DEFAULT_CHANNELS's comment: a bulk email/SMS blast per event would be
  // costly and noisy), so it deliberately has no EMAIL default.
  const emailTypes = NOTIFICATION_TYPES.filter((type) => DEFAULT_CHANNELS[type]?.includes('EMAIL'));
  it.each(emailTypes)('%s has a bundled EMAIL default', (type) => {
    expect(DEFAULT_TEMPLATES[defaultTemplateKey(type, 'EMAIL')]).toBeDefined();
  });

  it('PAYSLIP_ISSUED:EMAIL subject never carries a salary figure', () => {
    const template = DEFAULT_TEMPLATES[defaultTemplateKey('PAYSLIP_ISSUED', 'EMAIL')];
    const subject = interpolate(template.subject ?? '', { payPeriod: '2026-09', payslipNo: 'PS-1', netAmount: '999,999.00' });
    expect(subject).not.toContain('999,999.00');
    expect(subject).not.toMatch(/Tk\s*\d/i);
  });

  it('RESULTS_PUBLISHED body renders with exam + student vars', () => {
    const template = DEFAULT_TEMPLATES[defaultTemplateKey('RESULTS_PUBLISHED', 'EMAIL')];
    const body = interpolate(template.body, { examName: 'Final Term', studentName: 'Ayesha Rahman' });
    expect(body).toContain('Final Term');
    expect(body).toContain('Ayesha Rahman');
  });

  it('DATA_EXPORT_READY body includes the download link and expiry', () => {
    const template = DEFAULT_TEMPLATES[defaultTemplateKey('DATA_EXPORT_READY', 'EMAIL')];
    const body = interpolate(template.body, { downloadUrl: 'https://app.example.com/data-export', expiresAt: 'Thu Oct 08 2026' });
    expect(body).toContain('https://app.example.com/data-export');
    expect(body).toContain('Thu Oct 08 2026');
  });
});
