import React, { useRef } from 'react';

// Matches the reference's "text field + Upload button" file-picker pattern —
// a hidden native input triggered by either the button or the read-only
// display field, so the visual doesn't depend on a native file input's
// browser-specific chrome. Moved verbatim out of StudentsAdmission.tsx.
export const UploadButtonField: React.FC<{
  label: string;
  required?: boolean;
  fileName: string;
  accept: string;
  onFileSelected: (file: File) => void;
  helperText?: string;
}> = ({ label, required, fileName, accept, onFileSelected, helperText }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          readOnly
          value={fileName}
          placeholder={label}
          onClick={() => inputRef.current?.click()}
          className="input-field flex-1 cursor-pointer bg-slate-50 dark:bg-white/5"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="px-5 rounded-xl bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold whitespace-nowrap"
        >
          Upload
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileSelected(file);
            e.target.value = '';
          }}
        />
      </div>
      {helperText && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{helperText}</p>}
    </div>
  );
};
