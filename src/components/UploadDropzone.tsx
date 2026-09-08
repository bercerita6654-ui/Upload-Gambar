import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  FileCheck,
  ShieldCheck,
  FileImage,
  Boxes,
  ShoppingBag,
  Square,
  RectangleVertical,
} from 'lucide-react';
import { FolderCategory } from '../types';
import { TARGET_FOLDERS } from '../config/driveConfig';

interface UploadDropzoneProps {
  category: FolderCategory;
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({
  category,
  onFilesSelected,
  disabled = false,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeFolder = TARGET_FOLDERS[category];
  const isAio = category === 'aio';

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const fileList = Array.from(e.dataTransfer.files);
      onFilesSelected(fileList);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileList = Array.from(e.target.files);
      onFilesSelected(fileList);
      e.target.value = '';
    }
  };

  return (
    <div className="w-full space-y-3">
      <div
        id="upload-dropzone-container"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          if (!disabled && fileInputRef.current) {
            fileInputRef.current.click();
          }
        }}
        className={`relative border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition-all cursor-pointer ${
          isAio
            ? isDragOver
              ? 'border-indigo-600 bg-indigo-100/70 shadow-lg scale-[0.995]'
              : 'border-indigo-300 hover:border-indigo-500 bg-indigo-50/30 hover:bg-indigo-50/60'
            : isDragOver
            ? 'border-emerald-600 bg-emerald-100/70 shadow-lg scale-[0.995]'
            : 'border-emerald-300 hover:border-emerald-500 bg-emerald-50/30 hover:bg-emerald-50/60'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,.png"
          multiple
          disabled={disabled}
          onChange={handleFileInputChange}
          className="hidden"
          id="file-input-element"
        />

        <div className="flex flex-col items-center justify-center space-y-3.5 max-w-2xl mx-auto">
          {/* Target Folder & Ratio Confirmation Tag */}
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <div
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border shadow-xs ${
                isAio
                  ? 'bg-indigo-600 text-white border-indigo-700'
                  : 'bg-emerald-600 text-white border-emerald-700'
              }`}
            >
              {isAio ? <Boxes className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
              <span>Target Aktif: {activeFolder.name}</span>
            </div>

            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border shadow-xs ${
                isAio
                  ? 'bg-indigo-100 text-indigo-900 border-indigo-300'
                  : 'bg-emerald-100 text-emerald-900 border-emerald-300'
              }`}
            >
              {isAio ? <Square className="w-3.5 h-3.5 text-indigo-700" /> : <RectangleVertical className="w-3.5 h-3.5 text-emerald-700" />}
              <span>Acuan: {activeFolder.ratioDescription}</span>
            </div>
          </div>

          {/* Center Upload Icon */}
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${
              isAio
                ? isDragOver
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-white text-indigo-600 border border-indigo-200 shadow-xs'
                : isDragOver
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-white text-emerald-600 border border-emerald-200 shadow-xs'
            }`}
          >
            <UploadCloud className="w-8 h-8" />
          </div>

          <div>
            <p className="text-base sm:text-lg font-bold text-slate-800">
              Tarik & Lepas gambar PNG di sini, atau{' '}
              <span
                className={`underline underline-offset-2 ${
                  isAio ? 'text-indigo-600' : 'text-emerald-600'
                }`}
              >
                klik untuk memilih
              </span>
            </p>
            <p className="text-xs text-slate-500 mt-1">
              File otomatis disimpan ke Google Drive:{' '}
              <span className="font-semibold text-slate-700">{activeFolder.name}</span>{' '}
              dengan acuan rasio <strong className="text-slate-900">{isAio ? '1:1 (Persegi)' : '4:5 (Portrait)'}</strong>
            </p>
          </div>

          {/* Upload Rules Pill Box */}
          <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-left">
            <div className="flex items-center gap-2 bg-white/90 border border-slate-200/90 rounded-xl p-2.5 text-xs text-slate-700 shadow-2xs">
              <FileImage
                className={`w-4 h-4 shrink-0 ${isAio ? 'text-indigo-600' : 'text-emerald-600'}`}
              />
              <span>
                Format: <strong className="text-slate-900 font-mono">.png</strong> (5 digit nama)
              </span>
            </div>

            <div className="flex items-center gap-2 bg-white/90 border border-slate-200/90 rounded-xl p-2.5 text-xs text-slate-700 shadow-2xs">
              {isAio ? (
                <Square className="w-4 h-4 text-indigo-600 shrink-0" />
              ) : (
                <RectangleVertical className="w-4 h-4 text-emerald-600 shrink-0" />
              )}
              <span>
                Rasio: <strong className="text-slate-900 font-bold">{isAio ? '1:1 (Square)' : '4:5 (Portrait)'}</strong>
              </span>
            </div>

            <div className="flex items-center gap-2 bg-white/90 border border-slate-200/90 rounded-xl p-2.5 text-xs text-slate-700 shadow-2xs">
              <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                Deteksi otomatis:{' '}
                <strong className="text-slate-900">Cek duplikasi</strong>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
