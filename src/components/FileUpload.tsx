'use client';

import { useState, useCallback, useRef } from 'react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  onMultiFileSelect?: (files: File[]) => void;
  disabled?: boolean;
  allowPdf?: boolean;
  maxFiles?: number;
}

export function FileUpload({
  onFileSelect,
  onMultiFileSelect,
  disabled = false,
  allowPdf = true,
  maxFiles = 1,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const accept = allowPdf
    ? '.pdf,.png,.jpg,.jpeg,.webp'
    : '.png,.jpg,.jpeg,.webp';

  const validExtensions = allowPdf
    ? ['.pdf', '.png', '.jpg', '.jpeg', '.webp']
    : ['.png', '.jpg', '.jpeg', '.webp'];

  const validateAndSetFiles = useCallback((incomingFiles: File[]) => {
    setError(null);

    // Filter to valid extensions
    const validFiles: File[] = [];
    for (const file of incomingFiles) {
      const name = file.name.toLowerCase();
      const isValid = validExtensions.some(ext => name.endsWith(ext));
      if (!isValid) {
        const typeMsg = allowPdf
          ? 'Only PDF and image files (PNG, JPG, WebP) are supported.'
          : 'Only image files (PNG, JPG, WebP) are supported. PDFs require a Pro plan or higher.';
        setError(typeMsg);
        return;
      }
      validFiles.push(file);
    }

    // Check max files
    if (validFiles.length > maxFiles) {
      setError(`You can upload up to ${maxFiles} file${maxFiles > 1 ? 's' : ''} at a time.`);
      return;
    }

    setSelectedFiles(validFiles);

    // Notify parent
    if (validFiles.length === 1) {
      onFileSelect(validFiles[0]);
    }
    if (onMultiFileSelect && validFiles.length >= 1) {
      onMultiFileSelect(validFiles);
    }
  }, [validExtensions, allowPdf, maxFiles, onFileSelect, onMultiFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      validateAndSetFiles(files);
    }
  }, [disabled, validateAndSetFiles]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      validateAndSetFiles(Array.from(files));
    }
  }, [validateAndSetFiles]);

  const handleClick = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const removeFile = (index: number) => {
    const updated = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(updated);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    // Notify parent of change
    if (updated.length === 0) {
      onFileSelect(null as unknown as File); // Signal no file selected
    } else if (updated.length === 1) {
      onFileSelect(updated[0]);
    }
    if (onMultiFileSelect) {
      onMultiFileSelect(updated);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const helperText = allowPdf
    ? `PDF or images including handwritten notes (max ${maxFiles} file${maxFiles > 1 ? 's' : ''}, 100 pages)`
    : `Images only — screenshots & handwritten notes (max ${maxFiles} file${maxFiles > 1 ? 's' : ''})`;

  return (
    <div className="w-full">
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
          transition-all duration-300
          ${isDragging
            ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_30px_-10px_rgba(99,102,241,0.5)]'
            : 'border-white/20 hover:border-indigo-500/50 hover:bg-white/5'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={maxFiles > 1}
          onChange={handleFileChange}
          disabled={disabled}
          className="hidden"
        />

        <div className="space-y-3">
          <div className="mx-auto h-14 w-14 rounded-full bg-indigo-500/10 flex items-center justify-center">
            <svg
              className="h-7 w-7 text-indigo-400"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="text-sm text-slate-400">
            <span className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors">
              Click to upload
            </span>
            {' '}or drag and drop
          </div>
          <p className="text-xs text-slate-500">{helperText}</p>
          <p className="text-xs text-purple-400/80 mt-1">Supports 100+ languages - clear handwriting works best</p>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Selected files list */}
      {selectedFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          {selectedFiles.map((file, index) => (
            <div key={`${file.name}-${index}`} className="p-4 glass-card rounded-xl flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                  <svg
                    className="h-5 w-5 text-indigo-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{file.name}</p>
                  <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(index);
                }}
                disabled={disabled}
                className="text-slate-500 hover:text-slate-300 disabled:opacity-50 transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          {selectedFiles.length > 1 && (
            <p className="text-xs text-slate-500 text-right">
              {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
            </p>
          )}
        </div>
      )}
    </div>
  );
}
