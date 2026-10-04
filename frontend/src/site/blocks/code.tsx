/**
 * `CustomCode`: drops a sandboxed `{ html, css, js }` block into a visual
 * page (see `code/SandboxFrame.tsx` for the security model). Different from
 * a whole code-mode *page* (`code/codePage.ts`): this is one block among
 * others on an otherwise normal page.
 */
import { useIsEditing } from '../runtime';
import { codeField } from '../fields/CodeField';
import { SandboxFrame } from '../code/SandboxFrame';
import { radioField, selectField, textField, type SiteBlock } from './shared';

export const CustomCode: SiteBlock = {
  label: 'Custom code (HTML/CSS/JS)',
  fields: {
    html: codeField('HTML', 'html'),
    css: codeField('CSS', 'css'),
    js: codeField('JavaScript', 'javascript'),
    height: selectField('Height', [['auto', 'Fit content'], ['fixed', 'Fixed']]),
    fixedHeight: textField('Fixed height in pixels (when Height = Fixed)'),
    fullBleed: radioField('Full width (ignore page container)', [[true, 'Yes'], [false, 'No']]),
  },
  defaultProps: {
    html: '<div style="padding:24px;text-align:center">\n  <h2>Custom HTML block</h2>\n  <p>Edit the HTML, CSS and JS tabs — this runs in a safe sandbox.</p>\n</div>',
    css: '', js: '', height: 'auto', fixedHeight: '400', fullBleed: false,
  },
  render: (p) => <CustomCodeView {...p} />,
};

function CustomCodeView(p: Record<string, any>) {
  const editing = useIsEditing();
  const height = p.height === 'fixed' ? Math.max(80, Number(p.fixedHeight) || 400) : 'auto';
  const frame = (
    <SandboxFrame
      html={String(p.html ?? '')}
      css={String(p.css ?? '')}
      js={String(p.js ?? '')}
      height={height}
      minHeight={editing ? 120 : 40}
      title="Custom code block"
    />
  );
  if (p.fullBleed) return frame;
  return <div className="site-container">{frame}</div>;
}
