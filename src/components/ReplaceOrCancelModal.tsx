import React, { useState, useEffect } from 'react';
import { UploadQueueItem } from '../types';
import {
  AlertTriangle,
  RefreshCw,
  X,
  ExternalLink,
  Edit2,
  Check,
  HardDrive,
  FileImage,
} from 'lucide-react';

interface ReplaceOrCancelModalProps {
  isOpen: boolean;
  item: UploadQueueItem | null;
  folderName: string;
  onReplace: (item: UploadQueueItem) => void;
  onCancel: (item: UploadQueueItem) => void;
  onRename: (item: UploadQueueItem, newName: string) => void;
  isProcessing?: boolean;
}

export const ReplaceOrCancelModal: React.FC<ReplaceOrCancelModalProps> = ({
  isOpen,
  item,
  folderName,
  onReplace,
  onCancel,
  onRename,
  isProcessing = false,
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (item) {
      setNewName(item.file.name);
      setIsRenaming(false);
    }
  }, [item]);

  if (!isOpen || !item) return null;

  const handleSaveRename = () => {
    let clean = newName.trim();
    if (!clean.toLowerCase().endsWith('.png')) {
      clean += '.png';
    }
    onRename(item, clean);
    setIsRenaming(false);
  };

  const formatBytes = (bytes?: number | string) => {
    if (!bytes) return '-';
    const num = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
    if (isNaN(num)) return '-';
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-amber-200 space-y-5"
        role="dialog"
        aria-modal="true"
      >
        {/* Header with warning icon */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 shadow-xs">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Nama File Sama Persis Ditemukan!
              </h3>
              <p className="text-xs text-amber-800 font-medium">
                Pilih apakah Anda ingin Me-Replace gambar atau Cancel
              </p>
            </div>
          </div>
          <button
            onClick={() => onCancel(item)}
            disabled={isProcessing}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
            title="Tutup / Cancel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informative message */}
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 leading-relaxed">
          File dengan nama{' '}
          <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-300 text-slate-900">
            {item.file.name}
          </strong>{' '}
          sudah pernah di-upload atau sudah ada di folder Google Drive{' '}
          <strong>{folderName}</strong>.
        </div>

        {/* Side-by-side preview comparison */}
        <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
          {/* New file to be uploaded */}
          <div className="space-y-2 border-r border-slate-200 pr-2">
            <span className="font-bold text-[11px] uppercase tracking-wider text-slate-500 block">
              Gambar Baru (Lokal):
            </span>
            <div className="w-full h-24 rounded-lg bg-slate-200 overflow-hidden flex items-center justify-center border border-slate-300">
              <img
                src={item.previewUrl}
                alt="Preview baru"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="space-y-0.5 text-[11px] text-slate-600">
              <p className="font-mono truncate font-bold text-slate-900">{item.file.name}</p>
              <p>Ukuran: {formatBytes(item.file.size)}</p>
              {item.ratioInfo && item.ratioInfo.width > 0 && (
                <p>
                  Dimensi: {item.ratioInfo.width}×{item.ratioInfo.height}px ({item.ratioInfo.ratioLabel})
                </p>
              )}
            </div>
          </div>

          {/* Existing file on Google Drive */}
          <div className="space-y-2 pl-2">
            <span className="font-bold text-[11px] uppercase tracking-wider text-amber-800 block">
              File Lama di Drive:
            </span>
            <div className="w-full h-24 rounded-lg bg-amber-50 border border-amber-200 flex flex-col items-center justify-center text-amber-700 p-2 text-center">
              {item.existingFile?.thumbnailLink ? (
                <img
                  src={item.existingFile.thumbnailLink}
                  alt="Thumbnail Drive"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover rounded"
                />
              ) : (
                <>
                  <HardDrive className="w-8 h-8 text-amber-600 mb-1" />
                  <span className="text-[10px] font-medium">Tersimpan di Drive</span>
                </>
              )}
            </div>
            <div className="space-y-0.5 text-[11px] text-slate-600">
              <p className="font-mono truncate font-bold text-slate-900">
                {item.existingFile?.name || item.file.name}
              </p>
              <p>Ukuran: {formatBytes(item.existingFile?.size)}</p>
              {item.existingFile?.createdTime && (
                <p className="text-[10px] text-slate-500">
                  Diunggah: {new Date(item.existingFile.createdTime).toLocaleDateString('id-ID')}
                </p>
              )}
              {item.existingFile?.webViewLink && (
                <a
                  href={item.existingFile.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline font-semibold mt-1"
                >
                  <span>Buka di Drive</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Optional Inline Rename Drawer */}
        {isRenaming ? (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2 text-xs">
            <label className="font-bold text-blue-950 block">
              Ketikkan Nama File 5-Digit Baru:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="contoh: 11322.png"
                className="flex-1 px-3 py-1.5 border border-blue-300 rounded-lg text-xs font-mono bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <button
                type="button"
                onClick={handleSaveRename}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors shrink-0"
              >
                Gunakan Nama Baru
              </button>
              <button
                type="button"
                onClick={() => setIsRenaming(false)}
                className="px-2.5 py-1.5 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors shrink-0"
              >
                Batal
              </button>
            </div>
            <p className="text-[11px] text-blue-700">
              Format wajib: 5 digit angka dengan ekstensi .png (contoh: 11322.png)
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
            <span>Ingin menyimpan kedua file tanpa menimpa?</span>
            <button
              type="button"
              onClick={() => setIsRenaming(true)}
              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold hover:underline"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Ganti Nama File</span>
            </button>
          </div>
        )}

        {/* Primary Action Buttons: REPLACE vs CANCEL */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => onCancel(item)}
            disabled={isProcessing}
            className="px-4 py-2.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-xl transition-colors border border-slate-300 cursor-pointer text-center disabled:opacity-50"
          >
            Cancel (Batalkan Upload)
          </button>

          <button
            type="button"
            onClick={() => onReplace(item)}
            disabled={isProcessing}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-xl transition-colors shadow-sm cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
            <span>{isProcessing ? 'Sedang Me-Replace...' : 'Replace Gambar di Drive'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
