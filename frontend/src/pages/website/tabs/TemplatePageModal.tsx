import React from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Button, Modal } from '@/components/ui';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { templateCollections, type CollectionMeta } from '@/site/collections';
import { blankTemplatePage, defaultTemplatePage, hasDefaultTemplate } from '@/site/templates/collectionDefaults';
import { useCreatePage } from '../sites.queries';
import { useCollectionRegistry } from '../siteCollections';
import type { PuckData, SiteMeResponse } from '../sites.types';

/**
 * Create the profile-page design for one collection (`SitePage.kind = TEMPLATE`,
 * docs/plans/FEATURES_V4_PLAN.md §8.8). One template per collection (a second is a 409),
 * and only collections that have a public route base can have one. Starts from the
 * ready-made design (notices, albums, admissions, teachers, classes, events) or blank.
 */
export const TemplatePageModal: React.FC<{ isOpen: boolean; onClose: () => void; me: SiteMeResponse }> = ({ isOpen, onClose, me }) => {
  const t = useT();
  const navigate = useNavigate();
  const create = useCreatePage();
  const registry = useCollectionRegistry(me.site?.id, me.previewToken);
  const [key, setKey] = React.useState('');
  const [start, setStart] = React.useState<'default' | 'blank'>('default');
  const used = React.useMemo(() => new Set(me.pages.filter((p) => p.kind === 'TEMPLATE').map((p) => p.collectionKey)), [me.pages]);
  const options = React.useMemo(() => templateCollections(registry.data), [registry.data]);
  const chosen: CollectionMeta | undefined = options.find((c) => c.key === key);

  React.useEffect(() => {
    if (!isOpen) return;
    setKey(options.find((c) => !used.has(c.key))?.key ?? '');
    setStart('default');
  }, [isOpen, options, used]);

  const hasDefault = chosen ? hasDefaultTemplate(chosen.key) : false;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen || used.has(chosen.key)) return;
    const def = start === 'default' && hasDefault ? defaultTemplatePage(chosen.key) : null;
    const blank = def ? null : blankTemplatePage(chosen.titleField);
    create.mutate(
      {
        title: def?.title ?? `${chosen.label} page`,
        titleBn: def?.titleBn,
        kind: 'TEMPLATE',
        collectionKey: chosen.key,
        data: (def?.data ?? blank!.data) as unknown as PuckData,
        seo: def?.seo ?? blank!.seo,
      },
      {
        onSuccess: (p) => {
          toast.success(t('Template page created.'));
          onClose();
          if (p?.id) navigate(`/website-builder/pages/${p.id}`);
        },
      }
    );
  };

  const startOptions = [
    { id: 'default' as const, label: t('Ready-made design'), desc: t('Styled like the built-in detail page. Edit anything.'), disabled: !hasDefault },
    { id: 'blank' as const, label: t('Blank'), desc: t('Just a title. Add and bind your own blocks.'), disabled: false },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={create.isPending ? () => {} : onClose}
      title={t('New template page')}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={create.isPending}>{t('Cancel')}</Button>
          <Button type="submit" form="site-template-page" isLoading={create.isPending} disabled={!chosen || used.has(chosen.key)}>{t('Create and open editor')}</Button>
        </>
      }
    >
      <form id="site-template-page" className="space-y-4" onSubmit={submit}>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {t('A template page is designed once and shown for every item of a collection, for example one page per teacher at /teachers/their-name.')}
        </p>
        {registry.isLoading ? (
          <p className="text-sm text-slate-500">{t('Loading…')}</p>
        ) : registry.isError ? (
          <p className="text-sm text-red-600">{t('Could not load the list of collections.')}</p>
        ) : (
          <fieldset className="space-y-2">
            <legend className="field-label">{t('Collection')}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {options.map((c) => {
                const taken = used.has(c.key);
                return (
                  <label
                    key={c.key}
                    className={cn(
                      'flex flex-col gap-0.5 rounded-lg border p-3 text-sm',
                      taken ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                      key === c.key && !taken ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-500/10' : 'border-slate-200 dark:border-white/10'
                    )}
                  >
                    <span className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                      <input type="radio" name="site-template-collection" className="accent-primary-600" disabled={taken} checked={key === c.key} onChange={() => setKey(c.key)} />
                      {c.labelPlural}
                    </span>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{c.routeBase}/:name</span>
                    {taken && <span className="text-xs text-slate-500">{t('Already has a template page')}</span>}
                  </label>
                );
              })}
            </div>
            {options.length === 0 && <p className="text-sm text-slate-500">{t('None of your collections can have their own pages yet.')}</p>}
          </fieldset>
        )}
        {chosen && (
          <fieldset className="space-y-2">
            <legend className="field-label">{t('Start from')}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {startOptions.map((opt) => (
                <label
                  key={opt.id}
                  className={cn(
                    'flex flex-col gap-1 rounded-lg border p-3 text-sm',
                    opt.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                    start === opt.id && !opt.disabled ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-500/10' : 'border-slate-200 dark:border-white/10'
                  )}
                >
                  <span className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                    <input type="radio" name="site-template-start" className="accent-primary-600" disabled={opt.disabled} checked={start === opt.id} onChange={() => setStart(opt.id)} />
                    {opt.label}
                  </span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">{opt.desc}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </form>
    </Modal>
  );
};
