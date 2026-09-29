import React from 'react';
import toast from 'react-hot-toast';
import { Drawer, Button, Input, Textarea, Checkbox, Alert } from '@/components/ui';
import { useT } from '@/i18n';
import { useUpdatePage } from '../sites.queries';
import type { SitePage } from '../sites.types';
import { MediaField } from '../media/MediaPicker';

const toLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Page title, SEO fields and scheduled publishing. */
export const SeoDrawer: React.FC<{ page: SitePage; isOpen: boolean; onClose: () => void }> = ({ page, isOpen, onClose }) => {
  const t = useT();
  const update = useUpdatePage();
  const [title, setTitle] = React.useState(page.title);
  const [titleBn, setTitleBn] = React.useState(page.titleBn ?? '');
  const [seoTitle, setSeoTitle] = React.useState('');
  const [desc, setDesc] = React.useState('');
  const [ogImage, setOgImage] = React.useState('');
  const [noindex, setNoindex] = React.useState(false);
  const [schedule, setSchedule] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!isOpen) return;
    setTitle(page.title);
    setTitleBn(page.titleBn ?? '');
    setSeoTitle(page.seo?.title ?? '');
    setDesc(page.seo?.description ?? '');
    setOgImage(page.seo?.ogImage ?? '');
    setNoindex(Boolean(page.seo?.noindex));
    setSchedule(toLocalInput(page.scheduledPublishAt));
    setErrors({});
  }, [isOpen, page]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = t('Enter a page title.');
    if (ogImage && !/^https?:\/\/\S+$/i.test(ogImage)) errs.ogImage = t('Enter a full https:// address.');
    const when = schedule ? new Date(schedule) : null;
    if (when && when.getTime() <= Date.now()) errs.schedule = t('Choose a time in the future.');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    update.mutate(
      {
        id: page.id,
        data: {
          title: title.trim(),
          titleBn: titleBn.trim() || null,
          seo: { title: seoTitle.trim(), description: desc.trim(), ogImage: ogImage.trim(), noindex },
          scheduledPublishAt: when ? when.toISOString() : null,
        },
      },
      { onSuccess: () => { toast.success(t('Page settings saved.')); onClose(); } }
    );
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={update.isPending ? () => {} : onClose}
      title={t('Page settings and SEO')}
      width="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={update.isPending}>{t('Cancel')}</Button>
          <Button type="submit" form="site-seo-form" isLoading={update.isPending}>{t('Save')}</Button>
        </>
      }
    >
      <form id="site-seo-form" className="space-y-4" onSubmit={submit} noValidate>
        <Input id="seo-page-title" label={t('Page title')} required value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} />
        <Input id="seo-page-titleBn" label={t('Page title (Bangla)')} lang="bn" value={titleBn} onChange={(e) => setTitleBn(e.target.value)} />
        <hr className="border-slate-100 dark:border-white/6" />
        <Input
          id="seo-title"
          label={t('Search title')}
          maxLength={120}
          value={seoTitle}
          onChange={(e) => setSeoTitle(e.target.value)}
          helperText={t('{n}/60 characters recommended. Defaults to the page title.', { n: seoTitle.length })}
        />
        <Textarea
          id="seo-description"
          label={t('Search description')}
          rows={3}
          maxLength={320}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          helperText={t('{n}/160 characters recommended.', { n: desc.length })}
        />
        <MediaField id="seo-og" label={t('Share image')} value={ogImage} onChange={setOgImage} helperText={errors.ogImage ?? t('Shown when the page is shared on Facebook or WhatsApp. 1200×630 works best.')} />
        <Checkbox label={t('Hide from search engines')} description={t('Adds “noindex” so Google does not list this page.')} checked={noindex} onChange={(e) => setNoindex(e.target.checked)} />
        <hr className="border-slate-100 dark:border-white/6" />
        <Input
          id="seo-schedule"
          type="datetime-local"
          label={t('Publish automatically at')}
          value={schedule}
          onChange={(e) => setSchedule(e.target.value)}
          error={errors.schedule}
          helperText={t('Optional. The saved draft is published at this time. Clear it to cancel.')}
        />
        {schedule && <Alert tone="info">{t('Remember to save your draft before the scheduled time — the last saved draft is what gets published.')}</Alert>}
      </form>
    </Drawer>
  );
};
