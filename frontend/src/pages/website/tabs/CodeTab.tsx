import React from 'react';
import { Code2, Save, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Button, Alert } from '@/components/ui';
import { CodeEditor } from '@/site/fields/CodeField';
import { useT } from '@/i18n';
import { useUpdateSite } from '../sites.queries';
import type { SiteMeResponse } from '../sites.types';

const CSS_MAX = 100 * 1024;
const HTML_MAX = 50 * 1024;

const bytes = (s: string) => new Blob([s]).size;

/** Site-wide custom code (WEBSITE_V2_BRIEF.md §2 & §5): saved through `PUT /sites/me` settings. */
export const CodeTab: React.FC<{ me: SiteMeResponse }> = ({ me }) => {
  const t = useT();
  const update = useUpdateSite();
  const [customCss, setCustomCss] = React.useState(me.site.settings?.customCss ?? '');
  const [headHtml, setHeadHtml] = React.useState(me.site.settings?.headHtml ?? '');
  const [bodyEndHtml, setBodyEndHtml] = React.useState(me.site.settings?.bodyEndHtml ?? '');
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    setCustomCss(me.site.settings?.customCss ?? '');
    setHeadHtml(me.site.settings?.headHtml ?? '');
    setBodyEndHtml(me.site.settings?.bodyEndHtml ?? '');
    setDirty(false);
  }, [me.site.settings]);

  const cssTooBig = bytes(customCss) > CSS_MAX;
  const headTooBig = bytes(headHtml) > HTML_MAX;
  const bodyTooBig = bytes(bodyEndHtml) > HTML_MAX;
  const hasError = cssTooBig || headTooBig || bodyTooBig;

  const save = () => {
    if (hasError) {
      toast.error(t('One of the code boxes is too large. Reduce it and try again.'));
      return;
    }
    update.mutate(
      { settings: { ...me.site.settings, customCss, headHtml, bodyEndHtml } },
      { onSuccess: () => { setDirty(false); toast.success(t('Code saved. Publish the site to make it public.')); } }
    );
  };

  const mark = <T,>(setter: React.Dispatch<React.SetStateAction<T>>) => (v: T) => { setter(v); setDirty(true); };

  return (
    <div className="space-y-4">
      <Alert tone="warning" title={t('Trust this code before you save it')}>
        {t('Custom CSS is applied on your website and in the editor preview. Head and body scripts (trackers, chat widgets) run only on your live domain or subdomain — never in the editor or in path preview — and only after you publish. Anything you paste here runs with full access to your visitors’ browser; only add code you trust.')}
      </Alert>

      <Card>
        <CardHeader icon={<Code2 className="w-4 h-4" />} title={t('Custom CSS')} description={t('Applied to every page of your website. Maximum 100 KB.')} />
        <CodeEditor value={customCss} onChange={mark(setCustomCss)} language="css" height={220} placeholder=".site-root h1 { letter-spacing: -0.02em; }" />
        {cssTooBig && <p className="field-error mt-1" role="alert">{t('Custom CSS is {size} KB — the limit is 100 KB.', { size: Math.ceil(bytes(customCss) / 1024) })}</p>}
      </Card>

      <Card>
        <CardHeader icon={<ShieldAlert className="w-4 h-4" />} title={t('Head HTML')} description={t('Inserted just before </head> — analytics, fonts, meta tags. Live domain/subdomain only. Maximum 50 KB.')} />
        <CodeEditor value={headHtml} onChange={mark(setHeadHtml)} language="html" height={180} placeholder="<meta name=&quot;…&quot; content=&quot;…&quot; />" />
        {headTooBig && <p className="field-error mt-1" role="alert">{t('Head HTML is {size} KB — the limit is 50 KB.', { size: Math.ceil(bytes(headHtml) / 1024) })}</p>}
      </Card>

      <Card>
        <CardHeader icon={<ShieldAlert className="w-4 h-4" />} title={t('Body-end HTML')} description={t('Inserted just before </body> — chat widgets, tracking pixels. Live domain/subdomain only. Maximum 50 KB.')} />
        <CodeEditor value={bodyEndHtml} onChange={mark(setBodyEndHtml)} language="html" height={180} placeholder="<script>…</script>" />
        {bodyTooBig && <p className="field-error mt-1" role="alert">{t('Body-end HTML is {size} KB — the limit is 50 KB.', { size: Math.ceil(bytes(bodyEndHtml) / 1024) })}</p>}
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} isLoading={update.isPending} disabled={!dirty || hasError} leftIcon={<Save className="w-4 h-4" />}>{t('Save code')}</Button>
      </div>
    </div>
  );
};
