import React from 'react';
import type { Data } from '@puckeditor/core';
import { Monitor, Tablet, Smartphone } from 'lucide-react';
import { CodeEditor } from '@/site/fields/CodeField';
import { SandboxFrame } from '@/site/code/SandboxFrame';
import { readCodePageProps } from '@/site/code/codePage';
import { Tabs, Checkbox } from '@/components/ui';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';

export interface CodePageEditorProps {
  /** Puck `Data` holding `root.props = { mode: 'code', code: { html, css, js }, chrome }` (see `@/site/code/codePage`). */
  data: Data;
  onChange: (data: Data) => void;
}

const DEVICES: { id: 'desktop' | 'tablet' | 'mobile'; label: string; icon: typeof Monitor; width: string | number }[] = [
  { id: 'desktop', label: 'Desktop', icon: Monitor, width: '100%' },
  { id: 'tablet', label: 'Tablet', icon: Tablet, width: 768 },
  { id: 'mobile', label: 'Mobile', icon: Smartphone, width: 375 },
];

/**
 * Code-mode page editor: HTML / CSS / JS tabs (CodeMirror via `@/site/fields/CodeField`)
 * with a debounced live preview rendered through `@/site/code/SandboxFrame` — the
 * same sandboxed iframe the public site uses, so what you see here is what a
 * visitor gets. The surrounding chrome (back button, Save draft / Publish /
 * SEO / Version history) is shared with the visual editor in `PageEditor.tsx`.
 */
export default function CodePageEditor({ data, onChange }: CodePageEditorProps) {
  const t = useT();
  // Read once: this component is remounted (via a `key`) whenever the page or a
  // restored version changes, so re-reading `data` on every render would fight
  // with the user's own edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = React.useMemo(() => readCodePageProps(data), []);
  const [tab, setTab] = React.useState<'html' | 'css' | 'js'>('html');
  const [html, setHtml] = React.useState(initial.code.html);
  const [css, setCss] = React.useState(initial.code.css);
  const [js, setJs] = React.useState(initial.code.js);
  const [chrome, setChrome] = React.useState<'full' | 'none'>(initial.chrome);
  const [device, setDevice] = React.useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [preview, setPreview] = React.useState({ html, css, js });
  const [showPreview, setShowPreview] = React.useState(false);

  // Debounce the live preview so the sandbox iframe isn't rebuilt on every keystroke.
  React.useEffect(() => {
    const id = window.setTimeout(() => setPreview({ html, css, js }), 400);
    return () => window.clearTimeout(id);
  }, [html, css, js]);

  const firstRun = React.useRef(true);
  React.useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    onChange({
      root: { props: { ...(data.root?.props ?? {}), mode: 'code', chrome, code: { html, css, js } } },
      content: [],
    } as unknown as Data);
    // `data` is only read at mount (see `initial` above); including it here would
    // re-fire this effect every time the parent stores our own last update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, css, js, chrome]);

  const deviceWidth = DEVICES.find((d) => d.id === device)?.width ?? '100%';

  const codeTabs = (
    <Tabs
      idPrefix="code-page-lang"
      label={t('Code language')}
      value={tab}
      onChange={(v) => setTab(v as typeof tab)}
      variant="pills"
      tabs={[
        { id: 'html', label: 'HTML' },
        { id: 'css', label: 'CSS' },
        { id: 'js', label: 'JS' },
      ]}
    />
  );

  const codePane = (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 dark:border-white/10 shrink-0">
        {codeTabs}
        <Checkbox
          label={t('Header & footer')}
          checked={chrome === 'full'}
          onChange={(e) => setChrome(e.target.checked ? 'full' : 'none')}
          className="shrink-0"
        />
      </div>
      <div className="flex-1 min-h-0">
        {tab === 'html' && <CodeEditor value={html} onChange={setHtml} language="html" height="100%" placeholder="<section>…</section>" />}
        {tab === 'css' && <CodeEditor value={css} onChange={setCss} language="css" height="100%" placeholder=".hero { … }" />}
        {tab === 'js' && <CodeEditor value={js} onChange={setJs} language="javascript" height="100%" placeholder="// runs in a sandboxed iframe" />}
      </div>
    </div>
  );

  const previewPane = (
    <div className="flex flex-col min-h-0 h-full bg-slate-100 dark:bg-slate-950">
      <div className="flex items-center justify-center gap-1 px-3 py-2 border-b border-slate-200 dark:border-white/10 shrink-0">
        {DEVICES.map((d) => {
          const Icon = d.icon;
          const active = device === d.id;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setDevice(d.id)}
              aria-pressed={active}
              aria-label={t(d.label)}
              title={t(d.label)}
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                active ? 'bg-primary-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
              )}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-3">
        <div
          className="mx-auto bg-white dark:bg-slate-900 rounded-lg shadow-sm overflow-hidden transition-[width] duration-200"
          style={{ width: deviceWidth, maxWidth: '100%' }}
        >
          <SandboxFrame html={preview.html} css={preview.css} js={preview.js} height="auto" minHeight={240} title={t('Live preview')} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* A segmented control stacks the two panes on narrow screens; each pane mounts exactly once
          (CSS `hidden`/`md:flex` toggles visibility) so the editor and the sandbox iframe are never duplicated. */}
      <div className="md:hidden flex p-2 gap-1 border-b border-slate-200 dark:border-white/10 shrink-0" role="group" aria-label={t('Code or preview')}>
        <button type="button" onClick={() => setShowPreview(false)} className={cn('flex-1 h-8 rounded-md text-sm font-medium', !showPreview ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300')}>
          {t('Code')}
        </button>
        <button type="button" onClick={() => setShowPreview(true)} className={cn('flex-1 h-8 rounded-md text-sm font-medium', showPreview ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300')}>
          {t('Preview')}
        </button>
      </div>
      <div className="flex-1 min-h-0 md:grid md:grid-cols-2 divide-x divide-slate-200 dark:divide-white/10">
        <div className={cn('h-full min-h-0', showPreview ? 'hidden md:flex md:flex-col' : 'flex flex-col')}>{codePane}</div>
        <div className={cn('h-full min-h-0', !showPreview ? 'hidden md:flex md:flex-col' : 'flex flex-col')}>{previewPane}</div>
      </div>
    </div>
  );
}
