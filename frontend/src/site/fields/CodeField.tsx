/**
 * `CodeEditor`: a lazy-loaded CodeMirror 6 editor (HTML/CSS/JS), reused by
 * the `CustomCode` block, the code-mode page editor and Engineer C's admin
 * "Code" tab (site-wide Custom CSS / Head HTML / Body-end HTML). The heavy
 * CodeMirror bundle is only fetched when the field actually mounts
 * (`React.lazy` + dynamic `import()`), so it never ships in the public-site
 * bundle.
 *
 * `codeField(label, language)` wraps `CodeEditor` as a Puck `custom` field
 * for block configs (see `blocks/code.tsx`).
 */
import { lazy, Suspense } from 'react';
import type { Field } from '@puckeditor/core';
import type { CodeLanguage } from './CodeMirrorLazy';

export type { CodeLanguage } from './CodeMirrorLazy';

const LazyCodeMirror = lazy(() => import('./CodeMirrorLazy'));

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: CodeLanguage;
  height?: string | number;
  placeholder?: string;
  readOnly?: boolean;
}

function EditorFallback({ height }: { height?: string | number }) {
  return (
    <div
      aria-hidden
      style={{
        height: typeof height === 'number' ? `${height}px` : height ?? 260,
        background: '#0b1220',
        color: '#94a3b8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        borderRadius: 8,
      }}
    >
      Loading editor…
    </div>
  );
}

export function CodeEditor(props: CodeEditorProps) {
  return (
    <Suspense fallback={<EditorFallback height={props.height} />}>
      <LazyCodeMirror {...props} />
    </Suspense>
  );
}

/** A Puck `custom` field rendering `CodeEditor` for the given language. */
export function codeField(label: string, language: CodeLanguage): Field {
  return {
    type: 'custom',
    label,
    render: ({ value, onChange, readOnly }) => (
      <CodeEditor value={typeof value === 'string' ? value : ''} onChange={onChange} language={language} height={260} readOnly={readOnly} />
    ),
  } as Field;
}
