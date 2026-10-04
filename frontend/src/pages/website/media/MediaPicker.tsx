import React from 'react';
import { Check, FileText, Film, Image as ImageIcon, Plus, X } from 'lucide-react';
import { Modal, Button, Input, Skeleton, ErrorState } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { useMedia, apiError } from '../sites.queries';
import type { MediaKind, SiteMedia } from '../sites.types';
import { MediaUploadModal } from './MediaUploadModal';

export const MediaThumb: React.FC<{ media: Pick<SiteMedia, 'url' | 'kind' | 'alt' | 'name'>; className?: string }> = ({ media, className }) =>
  media.kind === 'IMAGE' ? (
    <img src={media.url} alt={media.alt ?? ''} loading="lazy" className={cn('w-full h-full object-cover', className)} />
  ) : (
    <div className={cn('w-full h-full flex flex-col items-center justify-center gap-1 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400', className)}>
      {media.kind === 'VIDEO' ? <Film className="w-6 h-6" aria-hidden /> : <FileText className="w-6 h-6" aria-hidden />}
      <span className="text-[11px] px-2 truncate max-w-full">{media.name}</span>
    </div>
  );

/**
 * Library chooser. `kind` limits the grid (e.g. images only for a logo).
 * `multiple` switches to a checkbox grid that calls `onSelectMultiple` with
 * every chosen file at once (used by the album photos picker); the default
 * single-select mode is unchanged for every other caller.
 */
export const MediaPickerModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (media: SiteMedia) => void;
  onSelectMultiple?: (media: SiteMedia[]) => void;
  multiple?: boolean;
  kind?: MediaKind;
  title?: string;
}> = ({ isOpen, onClose, onSelect, onSelectMultiple, multiple = false, kind, title }) => {
  const t = useT();
  const q = useMedia(isOpen);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<SiteMedia | null>(null);
  const [selectedMulti, setSelectedMulti] = React.useState<SiteMedia[]>([]);
  const [search, setSearch] = React.useState('');

  React.useEffect(() => {
    if (!isOpen) {
      setSelected(null);
      setSelectedMulti([]);
      setSearch('');
    }
  }, [isOpen]);

  const items = (q.data ?? []).filter(
    (m) => (!kind || m.kind === kind) && (!search || `${m.name} ${m.alt ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  );

  const toggleMulti = (m: SiteMedia) =>
    setSelectedMulti((prev) => (prev.some((s) => s.id === m.id) ? prev.filter((s) => s.id !== m.id) : [...prev, m]));

  const confirm = () => {
    if (multiple) onSelectMultiple?.(selectedMulti);
    else if (selected) onSelect?.(selected);
    onClose();
  };

  return (
    <>
      <Modal
        isOpen={isOpen && !uploadOpen}
        onClose={onClose}
        title={title ?? t('Choose from media library')}
        size="2xl"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
            <Button type="button" disabled={multiple ? selectedMulti.length === 0 : !selected} onClick={confirm}>
              {multiple ? t('Add {n} photo(s)', { n: selectedMulti.length }) : t('Use selected')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <Input
            aria-label={t('Search media')}
            placeholder={t('Search by name or alt text')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            containerClassName="flex-1"
          />
          <Button type="button" variant="outline" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setUploadOpen(true)}>
            {t('Upload new')}
          </Button>
        </div>
        {q.isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}
          </div>
        ) : q.isError ? (
          <ErrorState compact message={apiError(q.error, t('Could not load the media library.'))} onRetry={() => q.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            compact
            icon={<ImageIcon />}
            title={search ? t('No matching files') : t('Your media library is empty')}
            description={t('Upload a file to use it here.')}
          />
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3" role="listbox" aria-label={t('Media files')} aria-multiselectable={multiple}>
            {items.map((m) => {
              const on = multiple ? selectedMulti.some((s) => s.id === m.id) : selected?.id === m.id;
              return (
                <li key={m.id} role="option" aria-selected={on}>
                  <button
                    type="button"
                    onClick={() => (multiple ? toggleMulti(m) : setSelected(m))}
                    onDoubleClick={() => {
                      if (multiple) return;
                      onSelect?.(m);
                      onClose();
                    }}
                    className={cn(
                      'relative block w-full aspect-square rounded-lg overflow-hidden border-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                      on ? 'border-primary-600' : 'border-transparent hover:border-slate-300 dark:hover:border-white/20'
                    )}
                    title={m.alt || m.name}
                  >
                    <MediaThumb media={m} />
                    {on && (
                      <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-primary-600 text-white flex items-center justify-center">
                        <Check className="w-4 h-4" aria-hidden />
                      </span>
                    )}
                    <span className="sr-only">{m.alt || m.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
      <MediaUploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        accept={kind === 'IMAGE' ? 'image/*' : undefined}
        onUploaded={(m) => (multiple ? setSelectedMulti((prev) => [...prev, m]) : setSelected(m))}
      />
    </>
  );
};

/** URL field with a thumbnail and a "Choose" button that opens the library. */
export const MediaField: React.FC<{
  id: string;
  label: string;
  value: string | null | undefined;
  onChange: (url: string) => void;
  helperText?: string;
  kind?: MediaKind;
}> = ({ id, label, value, onChange, helperText, kind = 'IMAGE' }) => {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="field-label">{label}</label>
      <div className="flex items-center gap-2">
        <div className="w-11 h-11 rounded-lg overflow-hidden border border-slate-200 dark:border-white/10 shrink-0 bg-slate-50 dark:bg-white/5 flex items-center justify-center">
          {value ? <img src={value} alt="" className="w-full h-full object-contain" /> : <ImageIcon className="w-4 h-4 text-slate-400" aria-hidden />}
        </div>
        <input id={id} className="input-field flex-1 min-w-0" value={value ?? ''} placeholder="https://" onChange={(e) => onChange(e.target.value)} />
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>{t('Choose')}</Button>
        {value && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t('Clear')} onClick={() => onChange('')}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
      {helperText && <p className="field-hint">{helperText}</p>}
      <MediaPickerModal isOpen={open} onClose={() => setOpen(false)} kind={kind} onSelect={(m) => onChange(m.url)} />
    </div>
  );
};
