/**
 * The actual CodeMirror bundle. Only ever reached through a dynamic
 * `import()` (see `CodeField.tsx`), so `@uiw/react-codemirror` and the
 * `@codemirror/lang-*` packages never end up in the public-site bundle.
 */
import CodeMirror from '@uiw/react-codemirror';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import type { Extension } from '@codemirror/state';

export type CodeLanguage = 'html' | 'css' | 'javascript';

export interface CodeMirrorLazyProps {
  value: string;
  onChange: (value: string) => void;
  language: CodeLanguage;
  height?: string | number;
  placeholder?: string;
  readOnly?: boolean;
}

const LANG_EXTENSION: Record<CodeLanguage, () => Extension> = {
  html: () => html(),
  css: () => css(),
  javascript: () => javascript({ jsx: false }),
};

export default function CodeMirrorLazy({ value, onChange, language, height = 260, placeholder, readOnly }: CodeMirrorLazyProps) {
  const extension = (LANG_EXTENSION[language] ?? LANG_EXTENSION.html)();
  return (
    <CodeMirror
      value={value}
      height={typeof height === 'number' ? `${height}px` : height}
      theme="dark"
      extensions={[extension]}
      onChange={onChange}
      placeholder={placeholder}
      readOnly={readOnly}
      basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, tabSize: 2 } as never}
      style={{ fontSize: 13, borderRadius: 8, overflow: 'hidden' }}
    />
  );
}
