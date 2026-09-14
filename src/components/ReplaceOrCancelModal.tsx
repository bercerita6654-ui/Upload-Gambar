import React, { useState, useEffect } from 'react';
import { UploadQueueItem } from '../types';
import { lookupProductName } from '../services/productCatalogService';
import {
  AlertTriangle,
  RefreshCw,
  X,
  ExternalLink,
  Edit2,
  Check,
  HardDrive,
  FileImage,
  ZoomIn,
  Maximize2,
  Trash2,
  Loader2,
  ShoppingBag,
} from 'lucide-react';

interface ReplaceOrCancelModalProps {
  isOpen: boolean;
  item: UploadQueueItem | null;
  folderName: string;
  onReplace: (item: UploadQueueItem) => void;
  onCancel: (item: UploadQueueItem) => void;
  onRename: (item: UploadQueueItem, newName: string) => void;
  onDeleteExisting?: (item: UploadQueueItem) => void;
  isProcessing?: boolean;
  isDeletingExisting?: boolean;
  skuMap?: Record<string, string>;
}

export const ReplaceOrCancelModal: React.FC<ReplaceOrCancelModalProps> = ({
  isOpen,
  item,
  folderName,
  onReplace,
  onCancel,
  onRename,
  onDeleteExisting,
  isProcessing = false,
  isDeletingExisting = false,
  skuMap,
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [expandedImage, setExpandedImage] = useState<'local' | 'drive' | null>(null);

  useEffect(() => {
    if (item) {
      setNewName(item.file.name);
      setIsRenaming(false);
      setExpandedImage(null);
    }
  }, [item]);

  // Handle Escape key to close expanded image lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && expandedImage) {
        setExpandedImage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expandedImage]);

  if (!isOpen || !item) return null;

  // Helper to load high-res thumbnail from Google Drive CDN
  const getHighResDriveThumbnail = (thumbnailLink?: string) => {
    if (!thumbnailLink) return undefined;
    if (thumbnailLink.includes('=s')) {
      return thumbnailLink.replace(/=s\d+.*$/, '=s1600');
    }
    return thumbnailLink;
  };

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
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 leading-relaxed space-y-2">
          <p>
            File dengan nama{' '}
            <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-300 text-slate-900">
              {item.file.name}
            </strong>{' '}
            sudah terdeteksi di folder Google Drive <strong>{folderName}</strong>.
          </p>

          {/* Nama Produk dari Sheet STOCK LIST */}
          {(() => {
            const productName =
              item.productName || (skuMap ? lookupProductName(item.file.name, skuMap) : undefined);
            if (!productName) return null;
            return (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-950 font-semibold text-xs">
                <ShoppingBag className="w-4 h-4 text-indigo-600 shrink-0" />
                <div className="min-w-0">
                  <span className="text-[10px] text-indigo-600 uppercase tracking-wider block font-bold">
                    Produk di Sheet STOCK LIST:
                  </span>
                  <span className="text-indigo-900 font-bold">{productName}</span>
                </div>
              </div>
            );
          })()}

          {item.existingFile?.duplicateCount && item.existingFile.duplicateCount > 1 && (
            <div className="p-2 bg-amber-100/70 border border-amber-300 rounded-lg text-amber-900 font-medium text-[11px] flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span>
                <strong>Perhatian:</strong> Ditemukan <strong>{item.existingFile.duplicateCount} file kembar</strong> di Google Drive dengan nama ini. Me-replace akan memperbarui file utama dan otomatis membersihkan file duplikat berlebih.
              </span>
            </div>
          )}
        </div>

        {/* Side-by-side preview comparison */}
        <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
          {/* New file to be uploaded */}
          <div className="space-y-2 border-r border-slate-200 pr-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[11px] uppercase tracking-wider text-slate-500 block">
                Gambar Baru (Lokal):
              </span>
              <span className="text-[10px] text-blue-600 font-semibold cursor-pointer hover:underline" onClick={() => setExpandedImage('local')}>
                🔍 Perbesar
              </span>
            </div>
            <div
              onClick={() => setExpandedImage('local')}
              className="group relative w-full h-28 rounded-xl bg-slate-200 overflow-hidden flex items-center justify-center border border-slate-300 cursor-pointer shadow-2xs hover:border-blue-500 transition-all"
              title="Klik untuk perbesar gambar lokal secara luas dan full"
            >
              <img
                src={item.previewUrl}
                alt="Preview baru"
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white gap-1 backdrop-blur-2xs">
                <ZoomIn className="w-5 h-5 text-white drop-shadow-md" />
                <span className="text-[10px] font-bold bg-black/60 px-2 py-0.5 rounded-full shadow-xs">Perbesar Gambar</span>
              </div>
              <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded backdrop-blur-xs flex items-center gap-1">
                <Maximize2 className="w-2.5 h-2.5" />
                <span>Full</span>
              </div>
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
            <div className="flex items-center justify-between">
              <span className="font-bold text-[11px] uppercase tracking-wider text-amber-800 block">
                File Lama di Drive:
              </span>
              {item.existingFile?.thumbnailLink && (
                <span className="text-[10px] text-amber-700 font-semibold cursor-pointer hover:underline" onClick={() => setExpandedImage('drive')}>
                  🔍 Perbesar
                </span>
              )}
            </div>
            <div
              onClick={() => {
                if (item.existingFile?.thumbnailLink) {
                  setExpandedImage('drive');
                } else if (item.existingFile?.webViewLink) {
                  window.open(item.existingFile.webViewLink, '_blank');
                }
              }}
              className={`group relative w-full h-28 rounded-xl border flex flex-col items-center justify-center text-center transition-all ${
                item.existingFile?.thumbnailLink
                  ? 'bg-amber-50 border-amber-200 cursor-pointer hover:border-amber-500 shadow-2xs overflow-hidden'
                  : 'bg-amber-50 border-amber-200 text-amber-700 p-2'
              }`}
              title={
                item.existingFile?.thumbnailLink
                  ? 'Klik untuk perbesar gambar Drive secara luas dan full'
                  : 'Buka di Google Drive'
              }
            >
              {item.existingFile?.thumbnailLink ? (
                <>
                  <img
                    src={item.existingFile.thumbnailLink}
                    alt="Thumbnail Drive"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover rounded transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white gap-1 backdrop-blur-2xs">
                    <ZoomIn className="w-5 h-5 text-white drop-shadow-md" />
                    <span className="text-[10px] font-bold bg-black/60 px-2 py-0.5 rounded-full shadow-xs">Perbesar Gambar</span>
                  </div>
                  <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded backdrop-blur-xs flex items-center gap-1">
                    <Maximize2 className="w-2.5 h-2.5" />
                    <span>Full</span>
                  </div>
                </>
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

        {/* Primary Action Buttons: REPLACE vs CANCEL vs HAPUS DUPLICATE DI DRIVE */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => onCancel(item)}
            disabled={isProcessing || isDeletingExisting}
            className="px-4 py-2.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-xl transition-colors border border-slate-300 cursor-pointer text-center disabled:opacity-50"
          >
            Cancel (Batalkan Upload)
          </button>

          {item.existingFile && onDeleteExisting && (
            <button
              type="button"
              onClick={() => onDeleteExisting(item)}
              disabled={isProcessing || isDeletingExisting}
              className="px-4 py-2.5 text-xs font-bold text-red-700 hover:text-white bg-red-50 hover:bg-red-600 active:bg-red-700 rounded-xl transition-all border border-red-300 hover:border-red-600 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              title="Hapus file duplicate yang ada di Google Drive dan siapkan file baru untuk diupload"
            >
              {isDeletingExisting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menghapus...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Duplicate di Drive</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => onReplace(item)}
            disabled={isProcessing || isDeletingExisting}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-xl transition-colors shadow-sm cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
            <span>{isProcessing ? 'Sedang Me-Replace...' : 'Replace Gambar di Drive'}</span>
          </button>
        </div>
      </div>

      {/* Fullscreen / Expanded Image Lightbox */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setExpandedImage(null)}
        >
          <div
            className="relative max-w-4xl w-full max-h-[92vh] flex flex-col bg-slate-900 border border-slate-700/70 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Lightbox Header with Switcher & Close */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/90 gap-2 flex-wrap">
              {/* Toggle Switcher between Local and Drive */}
              <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-xl border border-slate-700">
                <button
                  type="button"
                  onClick={() => setExpandedImage('local')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    expandedImage === 'local'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  <span>Gambar Baru (Lokal)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setExpandedImage('drive')}
                  disabled={!item.existingFile?.thumbnailLink}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    expandedImage === 'drive'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>File Lama di Drive</span>
                </button>
              </div>

              {/* Close button */}
              <button
                type="button"
                onClick={() => setExpandedImage(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Tutup (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lightbox Image Stage */}
            <div className="flex-1 flex items-center justify-center p-4 min-h-[300px] max-h-[65vh] overflow-hidden bg-slate-950/60">
              {expandedImage === 'local' ? (
                <img
                  src={item.previewUrl}
                  alt="Gambar Baru Full"
                  className="max-h-[60vh] max-w-full w-auto h-auto object-contain rounded-lg shadow-xl border border-slate-800"
                />
              ) : item.existingFile?.thumbnailLink ? (
                <img
                  src={getHighResDriveThumbnail(item.existingFile.thumbnailLink)}
                  alt="File Lama Drive Full"
                  referrerPolicy="no-referrer"
                  className="max-h-[60vh] max-w-full w-auto h-auto object-contain rounded-lg shadow-xl border border-slate-800"
                />
              ) : (
                <div className="text-center text-slate-400 py-12 space-y-2">
                  <HardDrive className="w-12 h-12 mx-auto text-amber-500" />
                  <p className="text-sm">Thumbnail file Google Drive tidak tersedia.</p>
                </div>
              )}
            </div>

            {/* Lightbox Footer Details */}
            <div className="px-4 py-3 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-300">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-white text-sm truncate">
                    {expandedImage === 'local'
                      ? item.file.name
                      : item.existingFile?.name || item.file.name}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      expandedImage === 'local'
                        ? 'bg-blue-950 text-blue-300 border border-blue-800'
                        : 'bg-amber-950 text-amber-300 border border-amber-800'
                    }`}
                  >
                    {expandedImage === 'local' ? 'Lokal (Siap Upload)' : 'Tersimpan di Drive'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-400 text-[11px] flex-wrap">
                  <span>
                    Ukuran:{' '}
                    {formatBytes(
                      expandedImage === 'local' ? item.file.size : item.existingFile?.size
                    )}
                  </span>
                  {expandedImage === 'local' && item.ratioInfo && item.ratioInfo.width > 0 && (
                    <>
                      <span>•</span>
                      <span>
                        Dimensi: {item.ratioInfo.width}×{item.ratioInfo.height}px ({item.ratioInfo.ratioLabel})
                      </span>
                    </>
                  )}
                  {expandedImage === 'drive' && item.existingFile?.createdTime && (
                    <>
                      <span>•</span>
                      <span>
                        Diunggah: {new Date(item.existingFile.createdTime).toLocaleDateString('id-ID')}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {expandedImage === 'drive' && item.existingFile?.webViewLink && (
                  <a
                    href={item.existingFile.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium flex items-center gap-1.5 transition-colors border border-slate-700 text-xs"
                  >
                    <span>Buka di Google Drive</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setExpandedImage(null)}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors text-xs cursor-pointer shadow-xs"
                >
                  Tutup Preview
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
