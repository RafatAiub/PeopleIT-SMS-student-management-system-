import React from 'react';
import { Building, Upload, Trash2, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { compressImage } from '@/utils/imageCompressor';
import { Input } from '@/components/ui';

/** Shared by Institution profile and Branding — both let the admin change the logo. */
export const LogoUploader: React.FC<{ value: string; onChange: (dataUrlOrUrl: string) => void }> = ({
  value,
  onChange,
}) => {
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file');
      return;
    }
    try {
      // Max 300x300 PNG (lossless, keeps transparency) — pdfkit embeds this
      // logo server-side on report cards/timetables/receipts.
      const { dataUrl, sizeKb } = await compressImage(file, {
        maxWidth: 300,
        maxHeight: 300,
        quality: 0.82,
        format: 'image/png',
      });
      onChange(dataUrl);
      toast.success(`Logo compressed & optimized (${sizeKb} KB)`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to process image file');
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700 dark:text-slate-400 flex items-center justify-between">
        <span>Institute logo</span>
        <span className="text-xs text-slate-400 font-normal">PNG, JPG, SVG or WebP</span>
      </label>

      <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="relative w-20 h-20 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0 shadow-xs group">
          {value ? (
            <>
              <img
                src={value}
                alt="Logo preview"
                className="w-full h-full object-contain p-2"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <button
                type="button"
                onClick={() => onChange('')}
                className="absolute top-1 right-1 p-1 rounded-full bg-rose-500 text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                title="Remove logo"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <Building className="w-8 h-8 text-slate-400 dark:text-slate-500" />
          )}
        </div>

        <div className="flex-1 space-y-2.5 w-full">
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold text-xs shadow-sm active:scale-95 transition-all">
              <Upload className="w-4 h-4" />
              <span>Upload image file</span>
              <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
            </label>

            {value && (
              <button
                type="button"
                onClick={() => onChange('')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            )}
          </div>

          <Input
            id="settings-logoUrl"
            type="text"
            placeholder="Or paste direct image URL (https://...)"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="text-xs py-2"
            rightSlot={
              value ? (
                <span className="pr-1 text-emerald-500 text-xs font-bold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                </span>
              ) : undefined
            }
          />
        </div>
      </div>
    </div>
  );
};
