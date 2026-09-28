import React from 'react';
import { Puck, type Config, type Data } from '@puckeditor/core';
import '@puckeditor/core/puck.css';
import { siteConfig, BLOCK_CATEGORIES } from '@/site/config';
import { useLocale } from '@/i18n';

// This module is lazy-loaded by PageEditor so the Puck bundle and its CSS are
// only downloaded when someone opens the editor.

/** siteConfig with the block palette grouped by BLOCK_CATEGORIES, titled in the dashboard language. */
function editorConfigFor(lang: string): Config {
  return {
    ...siteConfig,
    categories: Object.fromEntries(
      BLOCK_CATEGORIES.map((c) => [c.key, { title: lang === 'bn' ? c.titleBn : c.title, components: c.components as string[], defaultExpanded: true }])
    ),
  };
}

const VIEWPORTS = [
  { width: 1280, height: 'auto' as const, label: 'Desktop', icon: 'Monitor' as const },
  { width: 768, height: 'auto' as const, label: 'Tablet', icon: 'Tablet' as const },
  { width: 360, height: 'auto' as const, label: 'Mobile', icon: 'Smartphone' as const },
];

export interface PuckEditorProps {
  data: Data;
  headerTitle: string;
  onChange: (data: Data) => void;
  /** Rendered in Puck's header in place of its default Publish button. */
  actions: React.ReactNode;
}

// A stable override component that reads the (changing) actions from context,
// so Puck never remounts the header buttons (which would drop focus).
const ActionsContext = React.createContext<React.ReactNode>(null);
const HeaderActions = () => <>{React.useContext(ActionsContext)}</>;
const OVERRIDES = { headerActions: HeaderActions };
const IFRAME = { enabled: true, waitForStyles: true };

export default function PuckEditor({ data, headerTitle, onChange, actions }: PuckEditorProps) {
  const { lang } = useLocale();
  const config = React.useMemo(() => editorConfigFor(lang), [lang]);
  return (
    <ActionsContext.Provider value={actions}>
      <Puck
        config={config}
        data={data}
        onChange={onChange}
        headerTitle={headerTitle}
        viewports={VIEWPORTS}
        overrides={OVERRIDES}
        iframe={IFRAME}
        height="100%"
      />
    </ActionsContext.Provider>
  );
}
