/**
 * Renders every statically-defined email template (modules/email/templates)
 * with realistic sample data (English + inline Bangla, per template) to a
 * folder of standalone .html files plus an index.html — no network calls, no
 * database, no queue. Safe to run in any environment.
 *
 *   npx ts-node scripts/email-preview.ts <output-dir>
 *   npx ts-node scripts/email-preview.ts ./tmp/email-preview
 *
 * Does NOT include the ~19 notification-pipeline templates (invoices,
 * receipts, leave, subscription events, etc.) — those are tenant-editable
 * freeform text resolved at send time; see scripts/preview-email.ts for those.
 */
import fs from 'fs';
import path from 'path';
import { EMAIL_TEMPLATE_REGISTRY } from '../src/modules/email/templates/registry';

function slugify(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, '-');
}

function main(): void {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error('Usage: npx ts-node scripts/email-preview.ts <output-dir>');
    process.exit(1);
  }

  const resolved = path.resolve(outDir);
  fs.mkdirSync(resolved, { recursive: true });

  const rows: { key: string; description: string; file: string; subject: string }[] = [];

  for (const entry of EMAIL_TEMPLATE_REGISTRY) {
    let content;
    try {
      content = entry.render();
    } catch (error) {
      console.error(`Failed to render "${entry.key}":`, error instanceof Error ? error.message : error);
      continue;
    }
    const file = `${slugify(entry.key)}.html`;
    fs.writeFileSync(path.join(resolved, file), content.html, 'utf8');
    fs.writeFileSync(path.join(resolved, `${slugify(entry.key)}.txt`), content.text, 'utf8');
    rows.push({ key: entry.key, description: entry.description, file, subject: content.subject });
    console.log(`Rendered ${entry.key} -> ${file}`);
  }

  const indexHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
  <title>Email template previews</title>
  <style>
    body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #111827; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
    a { color: #c2550a; }
  </style>
  </head><body>
  <h1>Email template previews</h1>
  <p>Generated ${new Date().toISOString()} — ${rows.length} template(s). Each includes English copy with an inline Bangla (lang="bn") paragraph, per the shared layout (modules/email/layout.ts).</p>
  <table>
    <tr><th>Key</th><th>Description</th><th>Subject</th><th>Preview</th></tr>
    ${rows
      .map(
        (r) =>
          `<tr><td><code>${r.key}</code></td><td>${r.description}</td><td>${r.subject}</td><td><a href="${r.file}" target="_blank">Open</a></td></tr>`,
      )
      .join('\n    ')}
  </table>
  </body></html>`;

  fs.writeFileSync(path.join(resolved, 'index.html'), indexHtml, 'utf8');
  console.log(`\nWrote ${rows.length} template(s) + index.html to ${resolved}`);
}

main();
