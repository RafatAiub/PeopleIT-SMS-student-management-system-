import React from 'react';

interface FormFieldProps {
  label: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  id: string;
  children: React.ReactNode;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  helperText,
  required,
  id,
  children,
}) => {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-sm font-medium text-slate-300"
      >
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-red-400 flex-shrink-0" />
          {error}
        </p>
      )}
      {helperText && !error && (
        <p className="text-xs text-slate-500">{helperText}</p>
      )}
    </div>
  );
};
