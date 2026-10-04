import React from 'react';
import { Upload, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, Button, Input, Alert, Tabs } from '@/components/ui';
import { useT } from '@/i18n';
import { useCreateMedia } from '../sites.queries';
import { formatBytes, guessKind, isMediaUploadConfigured, uploadMediaFile } from '../siteUtils';
import type { MediaKind, SiteMedia } from '../sites.types';

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Upload one file to Cloudinary (unsigned preset) and record it in the media
 * library. Alt text is required: the public site is WCAG AA, and a missing
 * alt is the most common failure. "Add by URL" covers images already hosted
 * elsewhere, and is the only option when Cloudinary isn't configured.
 */
export const MediaUploadModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onUploaded?: (media: SiteMedia) => void;
  accept?: string;
}> = ({ isOpen, onClose, onUploaded, accept = 'image/*,video/*,application/pdf' }) => {
  const t = useT();
  const configured = isMediaUploadConfigured();
  const [mode, setMode] = React.useState<'file' | 'url'>(configured ? 'file' : 'url');
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [url, setUrl] = React.useState('');
  const [urlKind, setUrlKind] = React.useState<MediaKind>('IMAGE');
  const [name, setName] = React.useState('');
  const [alt, setAlt] = React.useState('');
  const [progress, setProgress] = React.useState<number | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const create = useCreateMedia();

  React.useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setUrl('');
      setName('');
      setAlt('');
      setProgress(null);
      setErrors({});
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setPreviewUrl(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const busy = progress !== null || create.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (mode === 'file' && !file) errs.file = t('Choose a file to upload.');
    if (mode === 'file' && file && file.size > MAX_BYTES) errs.file = t('Files must be 25 MB or smaller.');
    if (mode === 'url' && !/^https:\/\/\S+$/i.test(url.trim())) errs.url = t('Enter a full https:// address.');
    if (!alt.trim()) errs.alt = t('Describe the file for screen-reader users. This is required.');
    setErrors(errs);
    if (Object.keys(errs).length) return;

    // Upload failures toast here; metadata-save failures toast from the mutation.
    let uploading = false;
    try {
      let payload;
      if (mode === 'file' && file) {
        setProgress(0);
        uploading = true;
        const up = await uploadMediaFile(file, setProgress);
        uploading = false;
        payload = { url: up.url, kind: up.kind ?? guessKind(file), name: name.trim() || file.name, alt: alt.trim(), size: up.size, width: up.width, height: up.height };
      } else {
        const clean = url.trim();
        payload = { url: clean, kind: urlKind, name: name.trim() || clean.split('/').pop() || clean, alt: alt.trim() };
      }
      const media = await create.mutateAsync(payload);
      toast.success(t('Added to the media library.'));
      onUploaded?.(media);
      onClose();
    } catch (err) {
      if (uploading) toast.error(err instanceof Error ? err.message : t('Upload failed'));
    } finally {
      setProgress(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={busy ? () => {} : onClose}
      title={t('Add media')}
      description={t('Images, videos and PDFs for your website.')}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>{t('Cancel')}</Button>
          <Button type="submit" form="site-media-upload" isLoading={busy} leftIcon={<Upload className="w-4 h-4" />}>
            {progress !== null ? t('Uploading… {p}%', { p: progress }) : t('Add to library')}
          </Button>
        </>
      }
    >
      <form id="site-media-upload" onSubmit={submit} className="space-y-4" noValidate>
        <Tabs
          variant="pills"
          idPrefix="media-mode"
          label={t('Upload method')}
          value={mode}
          onChange={(v) => setMode(v as 'file' | 'url')}
          tabs={[
            { id: 'file', label: t('Upload a file'), icon: <Upload />, disabled: !configured },
            { id: 'url', label: t('Add by URL'), icon: <Link2 /> },
          ]}
        />

        {!configured && (
          <Alert tone="warning" title={t('Uploads not configured')}>
            {t('Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET (an unsigned preset) in the frontend environment to upload files. You can still add files that are already online by URL.')}
          </Alert>
        )}

        {mode === 'file' ? (
          <div className="space-y-3">
            <label
              htmlFor="site-media-file"
              className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 dark:border-white/15 px-4 py-8 text-center cursor-pointer hover:border-primary-500 focus-within:border-primary-500"
            >
              <Upload className="w-6 h-6 text-slate-400" aria-hidden />
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                {file ? file.name : t('Choose a file')}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {file ? formatBytes(file.size) : t('JPG, PNG, WebP, SVG, MP4 or PDF — up to 25 MB')}
              </span>
              <input
                id="site-media-file"
                type="file"
                accept={accept}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''));
                }}
              />
            </label>
            {errors.file && <p className="field-error" role="alert">{errors.file}</p>}
            {previewUrl && (
              <img src={previewUrl} alt="" className="max-h-48 mx-auto rounded-lg object-contain border border-slate-200 dark:border-white/10" />
            )}
            {progress !== null && (
              <div className="h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={t('Upload progress')}>
                <div className="h-full bg-primary-600 transition-[width]" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <Input
              id="site-media-url"
              label={t('File address')}
              placeholder="https://"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              error={errors.url}
              required
            />
            <label className="flex flex-col">
              <span className="field-label">{t('Type')}</span>
              <select className="input-field" value={urlKind} onChange={(e) => setUrlKind(e.target.value as MediaKind)}>
                <option value="IMAGE">{t('Image')}</option>
                <option value="VIDEO">{t('Video')}</option>
                <option value="FILE">{t('Document')}</option>
              </select>
            </label>
          </div>
        )}

        <Input id="site-media-name" label={t('Name')} value={name} onChange={(e) => setName(e.target.value)} helperText={t('Only you see this, to find the file later.')} />
        <Input
          id="site-media-alt"
          label={t('Alt text')}
          required
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          error={errors.alt}
          helperText={t('What the image shows, e.g. “Students in the science lab”.')}
        />
      </form>
    </Modal>
  );
};
