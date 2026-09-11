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
  Sparkles,
  Zap,
  ArrowRight,
} from 'lucide-react';
import { TARGET_FOLDERS } from '../config/driveConfig';

interface UploadDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({
  onFilesSelected,
  disabled = false,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const openFilePicker = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="w-full space-y-3">
      <div
        id="single-smart-upload-dropzone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openFilePicker}
        className={`relative border-2 border-dashed rounded-3xl p-6 sm:p-9 text-center transition-all cursor-pointer overflow-hidden ${
          isDragOver
            ? 'border-blue-600 bg-blue-50/90 shadow-xl scale-[0.995] ring-4 ring-blue-500/20'
            : 'border-slate-300 hover:border-blue-500 bg-white hover:bg-slate-50/70 shadow-xs'
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
          id="single-file-input-element"
        />

        <div className="flex flex-col items-center justify-center space-y-4 max-w-3xl mx-auto">
          {/* Header Tag Pintar */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-indigo-50 via-blue-50 to-emerald-50 border border-slate-200 text-slate-800 shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>1 Tombol Pintar • 2 Fungsi Otomatis Berdasarkan Rasio Ukuran</span>
          </div>

          {/* 2 Fungsi Otomatis Kartu Visual */}
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
            {/* Fungsi 1: Gambar AIO (1:1) */}
            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Square className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-200/80 text-indigo-900">
                    FUNGSI 1
                  </span>
                  <h4 className="font-bold text-xs text-indigo-950">
                    Rasio 1:1 (Persegi / Square)
                  </h4>
                </div>
                <p className="text-[11px] text-indigo-800/90 mt-0.5">
                  Otomatis diarahkan &amp; diunggah ke folder <strong>Gambar AIO</strong>.
                </p>
                <div className="text-[10px] font-mono text-indigo-700 mt-1 flex items-center gap-1">
                  <span>Target: {TARGET_FOLDERS.aio.name} (cth: 1080×1080px)</span>
                </div>
              </div>
            </div>

            {/* Fungsi 2: Gambar Story Product (4:5) */}
            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <RectangleVertical className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-200/80 text-emerald-900">
                    FUNGSI 2
                  </span>
                  <h4 className="font-bold text-xs text-emerald-950">
                    Rasio 4:5 (Portrait / Story Feed)
                  </h4>
                </div>
                <p className="text-[11px] text-emerald-800/90 mt-0.5">
                  Otomatis diarahkan &amp; diunggah ke folder <strong>Story Product</strong>.
                </p>
                <div className="text-[10px] font-mono text-emerald-700 mt-1 flex items-center gap-1">
                  <span>Target: {TARGET_FOLDERS.story.name} (cth: 1080×1350px)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tombol Upload Utama Tunggal */}
          <div className="pt-2">
            <button
              type="button"
              id="main-single-upload-button"
              onClick={(e) => {
                e.stopPropagation();
                openFilePicker();
              }}
              disabled={disabled}
              className="inline-flex items-center gap-2.5 px-6 py-3.5 bg-gradient-to-r from-indigo-600 via-blue-600 to-emerald-600 hover:from-indigo-700 hover:via-blue-700 hover:to-emerald-700 text-white rounded-2xl text-sm font-bold shadow-md hover:shadow-lg transition-all cursor-pointer transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UploadCloud className="w-5 h-5 animate-pulse" />
              <span>Pilih Gambar (Auto-Detect Rasio 1:1 &amp; 4:5)</span>
            </button>

            <p className="text-xs text-slate-500 mt-2">
              Atau tarik &amp; lepas file gambar PNG Anda langsung ke dalam kotak ini (bisa memilih banyak file sekaligus)
            </p>
          </div>

          {/* Aturan Validasi Ringkas */}
          <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-left">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-xs text-slate-700">
              <FileImage className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                Format: <strong className="text-slate-900 font-mono">.png</strong> (5 digit angka)
              </span>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-xs text-slate-700">
              <Zap className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                Rasio: <strong className="text-slate-900">1:1 (AIO) &amp; 4:5 (Story)</strong>
              </span>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-xs text-slate-700">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Duplikasi: <strong className="text-slate-900">Cek Otomatis ke Drive</strong>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
