import React, { useCallback, useState } from 'react';
import { Upload, X, FileText, Image } from 'lucide-react';

interface FileUploadProps {
  id: string;
  label?: string;
  accept?: string;
  multiple?: boolean;
  onFilesSelected: (files: File[]) => void;
  maxSizeMB?: number;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  id,
  label = 'Upload File',
  accept = '*/*',
  multiple = false,
  onFilesSelected,
  maxSizeMB = 5,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const processFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter((f) => {
      if (f.size > maxSizeMB * 1024 * 1024) {
        setError(`File "${f.name}" exceeds ${maxSizeMB}MB limit.`);
        return false;
      }
      return true;
    });
    setSelectedFiles(multiple ? (prev) => [...prev, ...validFiles] : validFiles);
    onFilesSelected(multiple ? validFiles : validFiles.slice(0, 1));
    setError(null);
  }, [maxSizeMB, multiple, onFilesSelected]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const removeFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    onFilesSelected(newFiles);
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <Image className="w-4 h-4 text-teal-400" />;
    return <FileText className="w-4 h-4 text-indigo-400" />;
  };

  const getPreviewUrl = (file: File) => {
    if (file.type.startsWith('image/')) return URL.createObjectURL(file);
    return null;
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        id={id}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer ${
          isDragging
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-white/10 bg-white/3 hover:border-white/20 hover:bg-white/5'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById(`${id}-input`)?.click()}
      >
        <input
          id={`${id}-input`}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => processFiles(e.target.files)}
        />
        <Upload className="w-10 h-10 text-slate-500 mx-auto mb-3" />
        <p className="text-sm font-medium text-slate-300">{label}</p>
        <p className="text-xs text-slate-500 mt-1">
          Drag & drop or click to browse · Max {maxSizeMB}MB
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {selectedFiles.length > 0 && (
        <div className="flex flex-col gap-2">
          {selectedFiles.map((file, index) => {
            const preview = getPreviewUrl(file);
            return (
              <div
                key={index}
                className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10"
              >
                {preview ? (
                  <img src={preview} alt={file.name} className="w-10 h-10 rounded-lg object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                    {getFileIcon(file)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{file.name}</p>
                  <p className="text-xs text-slate-500">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                  className="p-1 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
