import React, { useState } from 'react';
import {
  UploadQueueItem,
  FolderCategory,
} from '../types';
import { TARGET_FOLDERS } from '../config/driveConfig';
import { lookupProductName } from '../services/productCatalogService';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Trash2,
  ExternalLink,
  Edit2,
  Check,
  RefreshCw,
  Upload,
  FileWarning,
  Boxes,
  ShoppingBag,
  Square,
  RectangleVertical,
  ArrowRightLeft,
  Sparkles,
  Layers,
} from 'lucide-react';

interface UploadQueueListProps {
  items: UploadQueueItem[];
  activeFilter?: 'all' | FolderCategory;
  onChangeFilter?: (filter: 'all' | FolderCategory) => void;
  onRemoveItem: (id: string) => void;
  onRenameItem: (id: string, newFileName: string) => void;
  onRecheckDuplicate: (id: string) => void;
  onRequestOverwrite: (item: UploadQueueItem) => void;
  onUploadSingle: (item: UploadQueueItem) => void;
  onUploadAllReady: () => void;
  onClearCompleted: () => void;
  onClearAll: () => void;
  onToggleCategory?: (id: string) => void;
  isUploadingAny: boolean;
  isSyncingSheet?: boolean;
  syncFeedback?: string | null;
  skuMap?: Record<string, string>;
}

export const UploadQueueList: React.FC<UploadQueueListProps> = ({
  items,
  activeFilter = 'all',
  onChangeFilter,
  onRemoveItem,
  onRenameItem,
  onRecheckDuplicate,
  onRequestOverwrite,
  onUploadSingle,
  onUploadAllReady,
  onClearCompleted,
  onClearAll,
  onToggleCategory,
  isUploadingAny,
  isSyncingSheet = false,
  syncFeedback = null,
  skuMap,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState<string>('');

  // Counts by category
  const aioItems = items.filter((i) => (i.category || 'aio') === 'aio');
  const storyItems = items.filter((i) => i.category === 'story');

  // Filtered items for display
  const displayedItems =
    activeFilter === 'all'
      ? items
      : items.filter((i) => (i.category || 'aio') === activeFilter);

  // Global status counts
  const readyItems = items.filter((i) => i.status === 'ready');
  const uploadableItems = items.filter(
    (i) => i.status === 'ready' || i.status === 'error' || i.status === 'checking_drive'
  );
  const aioUploadableCount = uploadableItems.filter((i) => (i.category || 'aio') === 'aio').length;
  const storyUploadableCount = uploadableItems.filter((i) => i.category === 'story').length;

  const aioReadyCount = readyItems.filter((i) => (i.category || 'aio') === 'aio').length;
  const storyReadyCount = readyItems.filter((i) => i.category === 'story').length;

  const duplicateItems = items.filter((i) => i.status === 'duplicate_found');
  const successItems = items.filter((i) => i.status === 'success');
  const errorItems = items.filter((i) => i.status === 'invalid_format' || i.status === 'error');

  const startEditing = (item: UploadQueueItem) => {
    setEditingId(item.id);
    setEditNameValue(item.file.name);
  };

  const saveEditing = (id: string) => {
    let finalName = editNameValue.trim();
    if (!finalName.toLowerCase().endsWith('.png')) {
      finalName += '.png';
    }
    onRenameItem(id, finalName);
    setEditingId(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-full space-y-4">
      {/* Header & Stats Bar */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-5 flex flex-col gap-4 shadow-xs">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>Antrean Upload Gambar ({items.length} file)</span>
              </h3>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                <Sparkles className="w-3 h-3 text-blue-500" />
                Auto-Detect Rasio Aktif
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Sistem secara otomatis mengenali rasio ukuran setiap gambar: <strong>1:1</strong> diarahkan ke <strong>Gambar AIO</strong>, dan <strong>4:5</strong> diarahkan ke <strong>Story Product</strong>.
            </p>
          </div>

          {/* Master Single Upload Button & Actions */}
          <div className="flex items-center gap-2 self-stretch lg:self-auto justify-end flex-wrap">
            {successItems.length > 0 && (
              <button
                onClick={onClearCompleted}
                disabled={isUploadingAny}
                className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer disabled:opacity-50"
              >
                Hapus Selesai
              </button>
            )}

            <button
              onClick={onClearAll}
              disabled={isUploadingAny}
              className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl border border-slate-200 hover:border-red-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              Kosongkan
            </button>

            {/* SATU TOMBOL UNGGAH UTAMA (MASTER SMART UPLOAD BUTTON) */}
            <button
              id="master-upload-all-button"
              type="button"
              onClick={onUploadAllReady}
              disabled={isUploadingAny || isSyncingSheet || (uploadableItems.length === 0 && duplicateItems.length === 0)}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-bold text-white rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-indigo-600 via-blue-600 to-emerald-600 hover:from-indigo-700 hover:via-blue-700 hover:to-emerald-700 active:scale-98"
              title="Klik untuk otomatis proses unggah semua file ke Google Drive dan langsung sinkronkan ID ke Spreadsheet (1 kali kerja)"
            >
              {isUploadingAny ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Sedang Mengunggah Semua File...</span>
                </>
              ) : isSyncingSheet ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-200" />
                  <span>Menyinkronkan ID ke Sheet...</span>
                </>
              ) : uploadableItems.length > 0 ? (
                <>
                  <Upload className="w-4 h-4" />
                  <span>
                    {aioUploadableCount > 0 && storyUploadableCount > 0
                      ? `Unggah Otomatis ${uploadableItems.length} File (${aioUploadableCount} AIO 1:1 • ${storyUploadableCount} Story 4:5)`
                      : aioUploadableCount > 0
                      ? `Unggah Otomatis ${uploadableItems.length} File ke AIO (1:1)`
                      : `Unggah Otomatis ${uploadableItems.length} File ke Story (4:5)`}
                  </span>
                </>
              ) : duplicateItems.length > 0 ? (
                <>
                  <AlertTriangle className="w-4 h-4" />
                  <span>Periksa ${duplicateItems.length} File Duplikat</span>
                </>
              ) : successItems.length > 0 && successItems.length === items.length ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                  <span>Selesai &amp; ID Tersinkron ke Sheet</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Tidak Ada File Siap</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Notifikasi Otomatis Sinkronisasi ID Drive ke Sheet (1 Kali Kerja) */}
        {(isSyncingSheet || syncFeedback) && (
          <div
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
              isSyncingSheet
                ? 'bg-blue-50/90 border-blue-200 text-blue-800 animate-pulse'
                : 'bg-emerald-50/90 border-emerald-200 text-emerald-800'
            }`}
          >
            {isSyncingSheet ? (
              <RefreshCw className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <span className="font-bold">
                {isSyncingSheet ? 'Otomatisasi 1 Kali Kerja: ' : 'Sinkronisasi ID Otomatis: '}
              </span>
              <span>{syncFeedback || 'Menyinkronkan ID Google Drive ke Google Sheet...'}</span>
            </div>
          </div>
        )}

        {/* Filter Tabs & Badges Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl w-fit">
            <button
              type="button"
              onClick={() => onChangeFilter && onChangeFilter('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua ({items.length})
            </button>

            <button
              type="button"
              onClick={() => onChangeFilter && onChangeFilter('aio')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeFilter === 'aio'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-indigo-800 hover:bg-indigo-50'
              }`}
            >
              <Square className="w-3 h-3" />
              <span>AIO 1:1 ({aioItems.length})</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeFilter && onChangeFilter('story')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeFilter === 'story'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-emerald-800 hover:bg-emerald-50'
              }`}
            >
              <RectangleVertical className="w-3 h-3" />
              <span>Story 4:5 ({storyItems.length})</span>
            </button>
          </div>

          {/* Status summary tags */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {readyItems.length > 0 && (
              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <CheckCircle2 className="w-3 h-3" />
                {readyItems.length} Siap
              </span>
            )}
            {duplicateItems.length > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-800 font-bold bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                <AlertTriangle className="w-3 h-3 text-amber-600" />
                {duplicateItems.length} Duplikat
              </span>
            )}
            {errorItems.length > 0 && (
              <span className="inline-flex items-center gap-1 text-rose-700 font-medium bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                <XCircle className="w-3 h-3" />
                {errorItems.length} Format Salah
              </span>
            )}
            {successItems.length > 0 && (
              <span className="inline-flex items-center gap-1 text-blue-700 font-medium bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                <CheckCircle2 className="w-3 h-3" />
                {successItems.length} Tersimpan
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Item Cards */}
      <div className="space-y-3">
        {displayedItems.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500">
            <p className="text-sm">Tidak ada file dalam kategori ini.</p>
          </div>
        ) : (
          displayedItems.map((item) => {
            const isEditing = editingId === item.id;
            const itemCategory = item.category || 'aio';
            const isItemAio = itemCategory === 'aio';
            const targetConfig = TARGET_FOLDERS[itemCategory];
            const ratioInfo = item.ratioInfo;

            return (
              <div
                key={item.id}
                className={`p-4 rounded-2xl border bg-white transition-all shadow-xs ${
                  item.status === 'duplicate_found'
                    ? 'border-amber-400 bg-amber-50/40 ring-1 ring-amber-400/30'
                    : item.status === 'invalid_format'
                    ? 'border-rose-300 bg-rose-50/30'
                    : item.status === 'success'
                    ? 'border-emerald-200 bg-emerald-50/30'
                    : isItemAio
                    ? 'border-indigo-100 hover:border-indigo-300'
                    : 'border-emerald-100 hover:border-emerald-300'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  {/* Thumbnail and Title */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center relative shadow-2xs">
                      <img
                        src={item.previewUrl}
                        alt={item.file.name}
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-0.5 right-0.5 px-1 rounded text-[9px] font-mono bg-black/75 text-white font-bold">
                        PNG
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* Filename or Inline Editor */}
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editNameValue}
                            onChange={(e) => setEditNameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEditing(item.id);
                              if (e.key === 'Escape') cancelEditing();
                            }}
                            placeholder="cth: 11321.png"
                            className="text-xs font-mono px-2.5 py-1 border-2 border-blue-500 rounded-lg focus:outline-hidden bg-white text-slate-900 w-44 shadow-xs"
                            autoFocus
                          />
                          <button
                            onClick={() => saveEditing(item.id)}
                            className="p-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 text-xs shadow-xs cursor-pointer"
                            title="Simpan nama baru"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="p-1 rounded-md bg-slate-200 text-slate-700 hover:bg-slate-300 text-xs cursor-pointer"
                            title="Batal"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-slate-900 truncate">
                              {item.file.name}
                            </span>
                            {item.status !== 'uploading' && item.status !== 'success' && (
                              <button
                                onClick={() => startEditing(item)}
                                className="text-slate-400 hover:text-blue-600 p-1 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                                title="Ubah nama file"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Nama Produk dari Sheet STOCK LIST Kolom 3 */}
                          {(() => {
                            const productName =
                              item.productName ||
                              (skuMap ? lookupProductName(item.file.name, skuMap) : undefined);
                            if (!productName) return null;
                            return (
                              <div className="flex items-center gap-1.5 text-xs text-indigo-900 font-semibold truncate mt-0.5 max-w-md">
                                <ShoppingBag className="w-3 h-3 text-indigo-600 shrink-0" />
                                <span className="truncate">{productName}</span>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                        <span>{formatFileSize(item.file.size)}</span>
                        <span>•</span>

                        {/* Image Dimension and Ratio Badge */}
                        {ratioInfo && ratioInfo.width > 0 && (
                          <>
                            <span className="font-mono text-slate-700 font-medium">
                              {ratioInfo.width}×{ratioInfo.height}px
                            </span>
                            <span>•</span>
                            <span
                              className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded text-[11px] ${
                                isItemAio
                                  ? 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {isItemAio ? (
                                <Square className="w-3 h-3 text-indigo-600" />
                              ) : (
                                <RectangleVertical className="w-3 h-3 text-emerald-600" />
                              )}
                              <span>Rasio: {ratioInfo.ratioLabel}</span>
                            </span>
                            <span>•</span>
                          </>
                        )}

                        {/* Smart Detected Target Folder Badge */}
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-bold text-[11px] shadow-2xs ${
                            isItemAio
                              ? 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                              : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                          }`}
                        >
                          {isItemAio ? (
                            <Boxes className="w-3 h-3 text-indigo-700" />
                          ) : (
                            <ShoppingBag className="w-3 h-3 text-emerald-700" />
                          )}
                          <span>Target: {targetConfig.name}</span>
                        </span>

                        {/* Quick switch category button */}
                        {item.status !== 'uploading' && item.status !== 'success' && onToggleCategory && (
                          <button
                            type="button"
                            onClick={() => onToggleCategory(item.id)}
                            className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-700 hover:underline cursor-pointer ml-1"
                            title={`Tukar target ke ${isItemAio ? 'Story Product (4:5)' : 'Gambar AIO (1:1)'}`}
                          >
                            <ArrowRightLeft className="w-3 h-3" />
                            <span>Pindah ke {isItemAio ? 'Story' : 'AIO'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status Badges & Controls */}
                  <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                    <div>
                      {item.status === 'checking_drive' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                          <span>Cek Drive...</span>
                        </span>
                      )}

                      {item.status === 'ready' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Aman Diunggah</span>
                        </span>
                      )}

                      {item.status === 'duplicate_found' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          <span>Duplikat Terdeteksi</span>
                        </span>
                      )}

                      {item.status === 'invalid_format' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                          <FileWarning className="w-3.5 h-3.5 text-rose-600" />
                          <span>Bukan 5-Digit PNG</span>
                        </span>
                      )}

                      {item.status === 'uploading' && (
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-2 transition-all duration-200 rounded-full ${
                                isItemAio ? 'bg-indigo-600' : 'bg-emerald-600'
                              }`}
                              style={{ width: `${item.uploadProgress}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono font-bold text-slate-800">
                            {item.uploadProgress}%
                          </span>
                        </div>
                      )}

                      {item.status === 'success' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Tersimpan di Drive</span>
                        </span>
                      )}

                      {item.status === 'error' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                          <XCircle className="w-3.5 h-3.5 text-red-600" />
                          <span>Gagal Upload</span>
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5">
                      {item.status === 'ready' && !isUploadingAny && (
                        <button
                          onClick={() => onUploadSingle(item)}
                          className={`px-3 py-1.5 text-xs font-bold text-white rounded-lg transition-colors cursor-pointer shadow-xs ${
                            isItemAio
                              ? 'bg-indigo-600 hover:bg-indigo-700'
                              : 'bg-emerald-600 hover:bg-emerald-700'
                          }`}
                          title={`Unggah ke folder ${targetConfig.name}`}
                        >
                          Unggah ke {isItemAio ? 'AIO' : 'Story'}
                        </button>
                      )}

                      {item.status === 'duplicate_found' && (
                        <button
                          onClick={() => onRequestOverwrite(item)}
                          className="px-2.5 py-1.5 text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 rounded-lg transition-colors shadow-xs cursor-pointer"
                          title="Buka pilihan replace gambar atau cancel"
                        >
                          Replace / Cancel
                        </button>
                      )}

                      {item.status === 'success' && item.uploadedDriveUrl && (
                        <a
                          href={item.uploadedDriveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Buka file di Google Drive"
                        >
                          <span>Buka</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}

                      {item.status === 'error' && (
                        <button
                          onClick={() => onRecheckDuplicate(item.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Coba lagi"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      )}

                      {item.status !== 'uploading' && (
                        <button
                          onClick={() => onRemoveItem(item.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          title="Hapus dari antrean"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* DUPLICATE NOTIFICATION BANNER */}
                {item.status === 'duplicate_found' && (
                  <div className="mt-3 p-3.5 bg-amber-100/90 border border-amber-400 rounded-xl text-xs text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-sm text-amber-900">
                          File sudah pernah di-upload / memiliki nama yang sama!
                        </p>
                        <p className="text-amber-800 mt-0.5">
                          File bernama <span className="font-mono font-bold bg-white/70 px-1 py-0.5 rounded border border-amber-300">{item.file.name}</span> sudah terdaftar di folder Google Drive <strong>{targetConfig.name}</strong>.
                          {item.existingFile?.createdTime && (
                            <span className="block sm:inline sm:ml-1 text-slate-700">
                              (Diunggah pada: {new Date(item.existingFile.createdTime).toLocaleString('id-ID')})
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      {item.existingFile?.webViewLink && (
                        <a
                          href={item.existingFile.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white text-amber-950 border border-amber-300 font-semibold hover:bg-amber-50 text-xs shadow-2xs"
                        >
                          <span>Tinjau di Drive</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <button
                        onClick={() => onRequestOverwrite(item)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-700 text-xs shadow-2xs cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Replace / Cancel</span>
                      </button>
                      <button
                        onClick={() => startEditing(item)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-800 text-white font-semibold hover:bg-amber-900 text-xs shadow-2xs cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Ganti Nama</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* INVALID FORMAT NOTIFICATION */}
                {item.status === 'invalid_format' && item.statusMessage && (
                  <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">{item.statusMessage}</p>
                        <p className="text-rose-600 mt-0.5">
                          Nama file harus terdiri dari tepat 5 digit angka PNG (contoh: <span className="font-mono font-bold">11321.png</span>).
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => startEditing(item)}
                      className="shrink-0 px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold hover:bg-rose-700 text-xs shadow-2xs cursor-pointer"
                    >
                      Ubah Nama
                    </button>
                  </div>
                )}

                {/* ERROR NOTIFICATION */}
                {item.status === 'error' && item.error && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Gagal Mengunggah:</p>
                        <p className="text-red-700 mt-0.5">{item.error}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => onRecheckDuplicate(item.id)}
                      className="shrink-0 px-2.5 py-1 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 text-xs cursor-pointer"
                    >
                      Coba Lagi
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
