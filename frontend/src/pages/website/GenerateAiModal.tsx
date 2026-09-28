import React from 'react';
import { Sparkles, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, Button, Select, Checkbox, Alert, AiGeneratedNotice } from '@/components/ui';
import { useT } from '@/i18n';
import { useGenerateSite, useApplyTemplate } from './sites.queries';
import { pagePath } from './siteUtils';
import type { ApplyMode, GenerateSiteResponse } from './sites.types';

const TONES = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'formal', label: 'Formal' },
  { value: 'inspiring', label: 'Inspiring' },
  { value: 'modern', label: 'Modern' },
];

/**
 * AI site generator: POST /sites/me/generate returns page drafts built from
 * the institution's real data (template text in demo mode). Nothing is saved
 * until the admin reviews the list and applies it as drafts.
 */
export const GenerateAiModal: React.FC<{ isOpen: boolean; onClose: () => void; currentTemplate: string | null }> = ({ isOpen, onClose, currentTemplate }) => {
  const t = useT();
  const generate = useGenerateSite();
  const apply = useApplyTemplate();
  const [tone, setTone] = React.useState('friendly');
  const [en, setEn] = React.useState(true);
  const [bn, setBn] = React.useState(true);
  const [mode, setMode] = React.useState<ApplyMode>('merge');
  const [result, setResult] = React.useState<GenerateSiteResponse | null>(null);

  React.useEffect(() => {
    if (!isOpen) {
      setResult(null);
      generate.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const run = () => {
    const languages = [en && 'en', bn && 'bn'].filter(Boolean) as string[];
    generate.mutate({ tone, languages: languages.length ? languages : ['en'] }, { onSuccess: setResult });
  };

  const onApply = () => {
    if (!result?.pages.length) return;
    apply.mutate(
      {
        templateKey: result.templateKey || currentTemplate || 'modern-campus',
        mode,
        pages: result.pages.map((p) => ({ slug: p.slug, title: p.title, titleBn: p.titleBn, seo: p.seo, data: p.data })),
      },
      {
        onSuccess: () => {
          toast.success(t('Generated pages saved as drafts. Review them before publishing.'));
          onClose();
        },
      }
    );
  };

  const busy = generate.isPending || apply.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={busy ? () => {} : onClose}
      title={t('Generate your website with AI')}
      description={t('Drafts pages from your school’s real information. You review and edit everything before it goes live.')}
      size="xl"
      footer={
        result ? (
          <>
            <Button variant="secondary" onClick={() => setResult(null)} disabled={busy}>{t('Back')}</Button>
            <Button onClick={onApply} isLoading={apply.isPending} disabled={!result.pages.length}>{t('Save as drafts')}</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>{t('Cancel')}</Button>
            <Button onClick={run} isLoading={generate.isPending} leftIcon={<Sparkles className="w-4 h-4" />} disabled={!en && !bn}>
              {generate.isPending ? t('Generating…') : t('Generate')}
            </Button>
          </>
        )
      }
    >
      {!result ? (
        <div className="space-y-4">
          <Select id="site-ai-tone" label={t('Tone')} value={tone} onChange={(e) => setTone(e.target.value)} options={TONES.map((o) => ({ value: o.value, label: t(o.label) }))} />
          <fieldset className="space-y-2">
            <legend className="field-label">{t('Languages')}</legend>
            <Checkbox label="English" checked={en} onChange={(e) => setEn(e.target.checked)} />
            <Checkbox label="বাংলা (Bangla)" checked={bn} onChange={(e) => setBn(e.target.checked)} />
          </fieldset>
          <Alert tone="info">{t('Only facts stored in the system (name, contact, classes, staff counts) are used. Anything the AI cannot know is left as sample text for you to replace.')}</Alert>
        </div>
      ) : (
        <div className="space-y-4">
          {result.demo && (
            <Alert tone="warning" title={t('Demo mode')}>
              {result.aiError
                ? `${t('The AI provider could not be used, so template text built from your school’s real data is shown.')} (${result.aiError})`
                : t('AI API key not configured — these pages use template text built from your school’s real data; no AI model was called.')}
            </Alert>
          )}
          <AiGeneratedNotice>
            <p className="text-sm text-slate-700 dark:text-slate-200 mb-2">{result.notice ? t(result.notice) : t('AI-generated draft. Review and edit every page before publishing.')}</p>
            <ul className="divide-y divide-blue-200/60 dark:divide-blue-400/15">
              {result.pages.map((p) => (
                <li key={p.slug} className="py-2 flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4 text-blue-700 dark:text-blue-300 shrink-0" aria-hidden />
                  <span className="font-medium text-slate-900 dark:text-slate-100">{p.title}</span>
                  {p.titleBn && <span className="text-slate-500 dark:text-slate-400" lang="bn">· {p.titleBn}</span>}
                  <span className="ml-auto font-mono text-xs text-slate-500">{pagePath(p.slug)}</span>
                  <span className="text-xs text-slate-500">{t('{n} blocks', { n: p.data?.content?.length ?? 0 })}</span>
                </li>
              ))}
            </ul>
          </AiGeneratedNotice>
          <fieldset className="space-y-2">
            <legend className="field-label">{t('How to save them')}</legend>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="radio" name="site-ai-mode" className="mt-1 accent-primary-600" checked={mode === 'merge'} onChange={() => setMode('merge')} />
              <span><span className="font-medium">{t('Merge')}</span> — {t('add only pages you don’t have yet; your existing pages are untouched.')}</span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="radio" name="site-ai-mode" className="mt-1 accent-primary-600" checked={mode === 'replace'} onChange={() => setMode('replace')} />
              <span><span className="font-medium">{t('Replace')}</span> — {t('overwrite the drafts of pages with the same address and delete other pages (the home page is kept). A version is saved first so you can restore.')}</span>
            </label>
          </fieldset>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('Pages are saved as drafts only. Nothing is public until you publish.')}</p>
        </div>
      )}
    </Modal>
  );
};
