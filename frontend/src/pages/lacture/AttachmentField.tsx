import React, { useRef, useState } from 'react';
import { UploadCloud, Loader2, CheckCircle2, Paperclip, RefreshCw, ExternalLink, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { uploadToCloudinary, isCloudinaryConfigured } from '../../utils/cloudinaryUpload';

const ACCEPT_BY_TYPE: Record<string, string> = {
  VIDEO: 'video/*',
  IMAGE: 'image/*',
  PDF: 'application/pdf',
};

// Types that are picked from device storage and uploaded directly to
// Cloudinary. Everything else (LINK, and NOTE/SLIDE which are typically
// external Drive/Docs links to lesson content) stays a plain URL field.
const UPLOAD_TYPES = new Set(['VIDEO', 'IMAGE', 'PDF']);

interface AttachmentFieldProps {
  resourceType: string;
  value: string;
  onChange: (url: string) => void;
  required?: boolean;
  label?: string;
}

export default function AttachmentField({ resourceType, value, onChange, required, label = 'Attachment' }: AttachmentFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!UPLOAD_TYPES.has(resourceType)) {
    return (
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">{label} Link</label>
        <input
          required={required}
          type="url"
          placeholder="https://drive.google.com/... or https://youtube.com/..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input-field placeholder:text-slate-400 dark:placeholder:text-slate-600"
        />
        <p className="text-xs text-slate-400 dark:text-slate-500">Paste a link to Google Drive, YouTube, OneDrive, or any hosted file.</p>
      </div>
    );
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isCloudinaryConfigured()) {
      toast.error('File uploads are not set up yet — ask an administrator to configure storage.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setUploading(true);
    setProgress(0);
    setFileName(file.name);
    try {
      const url = await uploadToCloudinary(file, setProgress);
      onChange(url);
      toast.success('File uploaded');
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
      setFileName(null);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = () => {
    onChange('');
    setFileName(null);
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">{label}</label>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_BY_TYPE[resourceType]}
        onChange={handleFileChange}
        className="hidden"
        id="attachment-file-input"
      />

      {uploading ? (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/40">
          <Loader2 className="w-5 h-5 text-blue-500 animate-spin flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-700 dark:text-slate-300 truncate">{fileName}</p>
            <div className="w-full h-1.5 bg-slate-200 dark:bg-white/10 rounded-full mt-1.5 overflow-hidden">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <span className="text-xs font-semibold text-slate-500 flex-shrink-0">{progress}%</span>
        </div>
      ) : value ? (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <a href={value} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 text-sm text-emerald-700 dark:text-emerald-300 truncate hover:underline flex items-center gap-1">
            {fileName || 'File uploaded'} <ExternalLink className="w-3 h-3 flex-shrink-0" />
          </a>
          <button type="button" onClick={() => inputRef.current?.click()} title="Replace file" className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex-shrink-0">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button type="button" onClick={handleRemove} title="Remove file" className="p-1.5 text-slate-500 hover:text-rose-600 dark:hover:text-red-400 transition-colors flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-slate-300 dark:border-white/15 hover:border-blue-400 dark:hover:border-blue-500/50 bg-slate-50 dark:bg-slate-900/30 transition-colors text-center"
        >
          <UploadCloud className="w-6 h-6 text-slate-400" />
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Choose a file from your device</span>
          <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
            <Paperclip className="w-3 h-3" /> {resourceType === 'PDF' ? 'PDF' : resourceType === 'VIDEO' ? 'Video' : 'Image'} files only
          </span>
        </button>
      )}
    </div>
  );
}
