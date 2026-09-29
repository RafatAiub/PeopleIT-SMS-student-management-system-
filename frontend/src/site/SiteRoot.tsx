/**
 * `.site-root` scope: applies the theme's CSS variables, the site language
 * and lite mode. Nested SiteRoots collapse into the outer one, so the Puck
 * root wrapper and the public renderer can both use it safely.
 */
import { createContext, useContext, useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { useSiteRuntime } from './runtime';
import { themeFontUrl, themeToCssVars } from './theme';
import './site.css';

const InsideSiteRoot = createContext(false);

export function SiteRoot({ children, className = '' }: { children: ReactNode; className?: string }) {
  const nested = useContext(InsideSiteRoot);
  const rt = useSiteRuntime();
  const ref = useRef<HTMLDivElement>(null);
  const vars = useMemo(() => themeToCssVars(rt.theme, { liteMode: rt.liteMode }), [rt.theme, rt.liteMode]);
  const fontUrl = nested || rt.liteMode ? null : themeFontUrl(rt.theme);

  // Load the theme's web font into the document the site renders in (the
  // Puck preview is an iframe, so this can differ from the app document).
  useEffect(() => {
    if (!fontUrl) return;
    const doc = ref.current?.ownerDocument ?? document;
    const id = `site-font-${fontUrl.length}-${fontUrl.slice(-40).replace(/[^a-z0-9]/gi, '')}`;
    if (doc.getElementById(id)) return;
    const link = doc.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = fontUrl;
    doc.head.appendChild(link);
  }, [fontUrl]);

  if (nested) return <>{children}</>;
  return (
    <InsideSiteRoot.Provider value={true}>
      <div
        ref={ref}
        className={`site-root ${className}`}
        style={vars as CSSProperties}
        lang={rt.lang}
        data-lite={rt.liteMode ? 'true' : undefined}
        data-mode={rt.theme.mode}
        data-editing={rt.mode === 'editor' ? 'true' : undefined}
      >
        {children}
      </div>
    </InsideSiteRoot.Provider>
  );
}
