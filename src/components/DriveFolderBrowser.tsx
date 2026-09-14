import React, { useState, useMemo, useEffect } from 'react';
import { DriveFileInfo, FolderCategory } from '../types';
import { TARGET_FOLDERS } from '../config/driveConfig';
import { SyncDriveButton } from './SyncDriveButton';
import { deleteDriveFile } from '../services/driveService';
import { lookupProductName } from '../services/productCatalogService';
import {
  Boxes,
  ShoppingBag,
  RefreshCw,
  Search,
  ExternalLink,
  FileImage,
  Loader2,
  AlertTriangle,
  Trash2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

interface DriveFolderBrowserProps {
  category: FolderCategory;
  onSelectCategory?: (category: FolderCategory) => void;
  folderFileCount?: {
    aio: number;
    story: number;
  };
  files: DriveFileInfo[];
  isLoading: boolean;
  token?: string | null;
  onRefresh: () => void;
  onShowToast?: (type: 'success' | 'error' | 'info' | 'warning', title: string, message: string) => void;
  skuMap?: Record<string, string>;
}

export const DriveFolderBrowser: React.FC<DriveFolderBrowserProps> = ({
  category,
  onSelectCategory,
  folderFileCount,
  files,
  isLoading,
  token,
  onRefresh,
  onShowToast,
  skuMap,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDuplicatesOnly, setFilterDuplicatesOnly] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<DriveFileInfo | null>(null);
  const [isDeletingSingle, setIsDeletingSingle] = useState(false);
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [batchProgressText, setBatchProgressText] = useState('');
  const [batchProgressPercent, setBatchProgressPercent] = useState(0);

  // Pagination states: options 20, 30, 50
  const [pageSize, setPageSize] = useState<number>(30);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const targetConfig = TARGET_FOLDERS[category];
  const isAio = category === 'aio';

  // Reset to first page when folder category, search term, duplicate filter, or page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [category, searchTerm, filterDuplicatesOnly, pageSize]);

  // Group files by normalized name to detect duplicates already inside Drive
  const duplicateNameMap = useMemo(() => {
    const map = new Map<string, DriveFileInfo[]>();
    for (const f of files) {
      const key = f.name.toLowerCase().trim();
      const list = map.get(key) || [];
      list.push(f);
      map.set(key, list);
    }
    return map;
  }, [files]);

  // Total duplicate items
  const duplicateGroups = useMemo(() => {
    const dups: Array<{ name: string; count: number; files: DriveFileInfo[] }> = [];
    duplicateNameMap.forEach((fileList, name) => {
      if (fileList.length > 1) {
        dups.push({ name, count: fileList.length, files: fileList });
      }
    });
    return dups;
  }, [duplicateNameMap]);

  // Total extra duplicate copies that can be cleaned up (keeping 1 file)
  const totalExtraDuplicates = useMemo(() => {
    return duplicateGroups.reduce((acc, g) => acc + Math.max(0, g.count - 1), 0);
  }, [duplicateGroups]);

  const filteredFiles = useMemo(() => {
    return files.filter((f) => {
      const term = searchTerm.toLowerCase().trim();
      const productName = skuMap ? lookupProductName(f.name, skuMap) : undefined;
      const matchesSearch =
        !term ||
        f.name.toLowerCase().includes(term) ||
        (productName && productName.toLowerCase().includes(term));

      if (!matchesSearch) return false;

      if (filterDuplicatesOnly) {
        const key = f.name.toLowerCase().trim();
        const group = duplicateNameMap.get(key);
        return group && group.length > 1;
      }

      return true;
    });
  }, [files, searchTerm, filterDuplicatesOnly, duplicateNameMap, skuMap]);

  // Total and paginated calculations
  const totalItems = filteredFiles.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (validCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  const paginatedFiles = useMemo(() => {
    return filteredFiles.slice(startIndex, endIndex);
  }, [filteredFiles, startIndex, endIndex]);

  const formatFileSize = (bytesStr?: string) => {
    if (!bytesStr) return '-';
    const bytes = parseInt(bytesStr, 10);
    if (isNaN(bytes)) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDeleteFile = (file: DriveFileInfo) => {
    if (!token) {
      onShowToast?.('error', 'Login Diperlukan', 'Silakan masuk dengan akun Google.');
      return;
    }
    setFileToDelete(file);
  };

  const confirmDeleteSingle = async () => {
    if (!fileToDelete) return;
    if (!token) {
      onShowToast?.('error', 'Login Diperlukan', 'Silakan masuk dengan akun Google.');
      setFileToDelete(null);
      return;
    }

    setIsDeletingSingle(true);
    try {
      await deleteDriveFile(fileToDelete.id, token, targetConfig.folderId);
      onShowToast?.(
        'success',
        'File Berhasil Dihapus',
        `File "${fileToDelete.name}" telah berhasil dihapus dari Google Drive.`
      );
      setFileToDelete(null);
      onRefresh();
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      onShowToast?.(
        'error',
        'Gagal Menghapus File',
        errObj.message || 'Terjadi kesalahan saat menghapus file di Google Drive.'
      );
    } finally {
      setIsDeletingSingle(false);
    }
  };

  const handleExecuteBatchDelete = async () => {
    if (!token) {
      onShowToast?.('error', 'Login Diperlukan', 'Silakan masuk dengan akun Google.');
      return;
    }

    // Collect all duplicate file IDs to delete (keep the latest 1 file per group)
    const filesToDelete: DriveFileInfo[] = [];
    duplicateGroups.forEach((group) => {
      // Sort so the newest file is first
      const sorted = [...group.files].sort((a, b) => {
        const timeA = a.createdTime ? new Date(a.createdTime).getTime() : 0;
        const timeB = b.createdTime ? new Date(b.createdTime).getTime() : 0;
        return timeB - timeA;
      });
      // Keep sorted[0], delete the rest!
      filesToDelete.push(...sorted.slice(1));
    });

    if (filesToDelete.length === 0) {
      setShowBatchDeleteModal(false);
      return;
    }

    setIsBatchDeleting(true);
    let deletedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < filesToDelete.length; i++) {
      const file = filesToDelete[i];
      setBatchProgressText(`Menghapus file ${i + 1} dari ${filesToDelete.length}: ${file.name}...`);
      setBatchProgressPercent(Math.round(((i + 1) / filesToDelete.length) * 100));

      try {
        await deleteDriveFile(file.id, token, targetConfig.folderId);
        deletedCount++;
      } catch (err) {
        console.warn(`Failed to delete duplicate ${file.name} (${file.id}):`, err);
        failedCount++;
      }
    }

    setIsBatchDeleting(false);
    setShowBatchDeleteModal(false);

    if (deletedCount > 0) {
      onShowToast?.(
        'success',
        'Pembersihan Duplikat Selesai',
        `${deletedCount} file duplikat telah berhasil dihapus dari Google Drive.${
          failedCount > 0 ? ` (${failedCount} file gagal dihapus)` : ''
        }`
      );
      onRefresh();
    } else {
      onShowToast?.(
        'error',
        'Gagal Menghapus Duplikat',
        'Tidak dapat menghapus file duplikat dari Google Drive. Pastikan akun memiliki hak akses editor.'
      );
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
      {/* Folder Tab Switcher (AIO vs Story Product) */}
      {onSelectCategory && (
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 mr-1 hidden sm:inline">Folder Drive:</span>
            <button
              onClick={() => onSelectCategory('aio')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 border ${
                isAio
                  ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200'
              }`}
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>Gambar AIO (1:1)</span>
              {folderFileCount?.aio !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono ${
                    isAio ? 'bg-indigo-700 text-white' : 'bg-slate-200/70 text-slate-700'
                  }`}
                >
                  {folderFileCount.aio}
                </span>
              )}
            </button>

            <button
              onClick={() => onSelectCategory('story')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 border ${
                !isAio
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Story Product (4:5)</span>
              {folderFileCount?.story !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono ${
                    !isAio ? 'bg-emerald-700 text-white' : 'bg-slate-200/70 text-slate-700'
                  }`}
                >
                  {folderFileCount.story}
                </span>
              )}
            </button>
          </div>

          <a
            href={targetConfig.folderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-500 hover:text-blue-600 font-medium flex items-center gap-1 transition-colors px-2 py-1 rounded-lg hover:bg-slate-100"
            title="Buka Folder di Google Drive"
          >
            <span>Buka di Google Drive</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white shadow-xs ${
              isAio ? 'bg-indigo-600' : 'bg-emerald-600'
            }`}
          >
            {isAio ? <Boxes className="w-5 h-5" /> : <ShoppingBag className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                Isi Folder: {targetConfig.name}
              </h3>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  isAio ? 'bg-indigo-100 text-indigo-800' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {isAio ? '1:1 (Persegi)' : '4:5 (Portrait)'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Total {files.length} file di Google Drive
              {filteredFiles.length > 0 && (
                <span className="font-semibold text-slate-700 ml-1.5">
                  • Menampilkan {startIndex + 1}–{endIndex} dari {totalItems} file
                </span>
              )}
              {duplicateGroups.length > 0 && (
                <span className="ml-1.5 font-bold text-amber-600">
                  • ⚠️ {duplicateGroups.length} file ganda terdeteksi
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Duplicate filter pill button */}
          {duplicateGroups.length > 0 && (
            <button
              onClick={() => setFilterDuplicatesOnly(!filterDuplicatesOnly)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 border ${
                filterDuplicatesOnly
                  ? 'bg-amber-600 text-white border-amber-700 shadow-2xs'
                  : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
              }`}
              title="Saring hanya file yang memiliki nama ganda di Google Drive"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{filterDuplicatesOnly ? 'Tampilkan Semua' : `Filter Duplikat (${duplicateGroups.length})`}</span>
            </button>
          )}

          {/* Delete All Duplicates Action Button */}
          {totalExtraDuplicates > 0 && (
            <button
              onClick={() => setShowBatchDeleteModal(true)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border border-red-300 bg-red-50 text-red-700 hover:bg-red-600 hover:text-white hover:border-red-700 shadow-2xs"
              title="Hapus otomatis salinan duplikat dan sisakan 1 file di Google Drive"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus Duplikat Drive ({totalExtraDuplicates})</span>
            </button>
          )}

          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari cth: 17907..."
              className="text-xs pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 w-32 sm:w-44"
            />
          </div>

          {/* Sync data Drive button */}
          <SyncDriveButton
            variant="browser"
            token={token}
            onSyncCompleted={onRefresh}
            onShowToast={onShowToast}
            activeCategory={category}
          />

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
            title="Muat ulang isi folder dari Google Drive"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
          </button>

          <a
            href={targetConfig.folderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
              isAio
                ? 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border-indigo-200'
                : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
            }`}
            title="Buka folder langsung di Google Drive"
          >
            <span>Buka di Drive</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Duplicate Warning Callout if Google Drive has existing duplicate names */}
      {duplicateGroups.length > 0 && (
        <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950 animate-in fade-in shadow-2xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-900">
                Peringatan: Terdapat {duplicateGroups.length} nama file yang memiliki duplikat ganda di Google Drive!
              </p>
              <p className="text-amber-800 text-[11px] mt-0.5">
                Contoh: <strong>{duplicateGroups.slice(0, 3).map((d) => `${d.name} (${d.count} file)`).join(', ')}</strong>
                {duplicateGroups.length > 3 && ` dan ${duplicateGroups.length - 3} lainnya`}.
                Total ada <strong>{totalExtraDuplicates} salinan kembar</strong> yang dapat dibersihkan otomatis.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {!filterDuplicatesOnly && (
              <button
                type="button"
                onClick={() => setFilterDuplicatesOnly(true)}
                className="px-2.5 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
              >
                Filter Duplikat
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowBatchDeleteModal(true)}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer text-[11px]"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus Duplikat ({totalExtraDuplicates})</span>
            </button>
          </div>
        </div>
      )}

      {isLoading && files.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-2">
          <Loader2
            className={`w-7 h-7 animate-spin ${isAio ? 'text-indigo-600' : 'text-emerald-600'}`}
          />
          <p className="text-xs">Menyinkronkan file dari Google Drive...</p>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="py-10 text-center text-slate-400 space-y-1">
          <FileImage className="w-8 h-8 mx-auto text-slate-300" />
          <p className="text-xs font-semibold text-slate-700">
            {searchTerm || filterDuplicatesOnly
              ? 'Tidak ada file yang cocok dengan filter / pencarian'
              : 'Folder ini belum memiliki file'}
          </p>
          <p className="text-[11px] text-slate-400">
            {filterDuplicatesOnly
              ? 'Tidak ditemukan file duplikat dengan kata kunci ini.'
              : `Upload file PNG 5-digit untuk menyimpannya ke folder ${targetConfig.name}.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-96 overflow-y-auto pr-1">
          {paginatedFiles.map((file) => {
            const key = file.name.toLowerCase().trim();
            const sameNameFiles = duplicateNameMap.get(key) || [];
            const isDuplicateInDrive = sameNameFiles.length > 1;

            return (
              <div
                key={file.id}
                className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 shadow-2xs ${
                  isDuplicateInDrive
                    ? 'border-amber-400 bg-amber-50/50 hover:bg-amber-50'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden border ${
                      isDuplicateInDrive
                        ? 'bg-amber-100 border-amber-300'
                        : isAio
                        ? 'bg-indigo-50 border-indigo-100'
                        : 'bg-emerald-50 border-emerald-100'
                    }`}
                  >
                    {file.thumbnailLink ? (
                      <img
                        src={file.thumbnailLink}
                        alt={file.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <FileImage
                        className={`w-4 h-4 ${
                          isDuplicateInDrive
                            ? 'text-amber-600'
                            : isAio
                            ? 'text-indigo-600'
                            : 'text-emerald-600'
                        }`}
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-xs font-mono font-bold text-slate-900 truncate">
                        {file.name}
                      </p>
                      {isDuplicateInDrive && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-200 text-amber-900 border border-amber-300">
                          ⚠️ Ganda ({sameNameFiles.length}x)
                        </span>
                      )}
                    </div>
                    {/* Nama Produk dari Sheet STOCK LIST Kolom 3 */}
                    {(() => {
                      const productName = skuMap ? lookupProductName(file.name, skuMap) : undefined;
                      if (!productName) return null;
                      return (
                        <p className="text-[11px] font-semibold text-indigo-700 truncate max-w-[200px] sm:max-w-xs">
                          {productName}
                        </p>
                      );
                    })()}
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <span>{formatFileSize(file.size)}</span>
                      {file.createdTime && (
                        <>
                          <span>•</span>
                          <span>{new Date(file.createdTime).toLocaleDateString('id-ID')}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Delete button (for all files, highlighted for duplicates) */}
                  <button
                    type="button"
                    onClick={() => handleDeleteFile(file)}
                    disabled={isDeletingSingle && fileToDelete?.id === file.id}
                    className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                      isDuplicateInDrive
                        ? 'text-red-600 hover:text-white hover:bg-red-600 bg-red-50 border border-red-200 hover:border-red-600'
                        : 'text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200'
                    }`}
                    title={
                      isDuplicateInDrive
                        ? 'Hapus file duplikat ini dari Google Drive'
                        : 'Hapus file ini dari Google Drive'
                    }
                  >
                    {isDeletingSingle && fileToDelete?.id === file.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {file.webViewLink && (
                    <a
                      href={file.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors shrink-0"
                      title="Lihat file di Google Drive"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Paginasi Next & Prev (20, 30, 50 data per halaman) */}
      {!isLoading && filteredFiles.length > 0 && (
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          {/* Pilihan jumlah data per halaman */}
          <div className="flex items-center gap-2 text-slate-600">
            <span className="text-slate-500 text-[11px] font-medium">Per halaman:</span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {[20, 30, 50].map((size) => (
                <button
                  key={size}
                  onClick={() => setPageSize(size)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-all cursor-pointer ${
                    pageSize === size
                      ? 'bg-white text-slate-900 shadow-2xs font-bold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
              (Baris {startIndex + 1}–{endIndex} dari {totalItems})
            </span>
          </div>

          {/* Kontrol Navigasi Prev / Next & Indikator Halaman */}
          <div className="flex items-center gap-1.5">
            {totalPages > 3 && (
              <button
                onClick={() => setCurrentPage(1)}
                disabled={validCurrentPage <= 1}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-2xs"
                title="Halaman Pertama (Hal 1)"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={validCurrentPage <= 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold hover:bg-slate-50 hover:text-slate-900 disabled:opacity-35 disabled:cursor-not-allowed transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
              title="Halaman Sebelumnya"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>

            <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs font-bold text-slate-800">
              <span>{validCurrentPage}</span>
              <span className="text-slate-400 font-normal mx-1">/</span>
              <span className="text-slate-500 font-medium">{totalPages}</span>
            </div>

            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={validCurrentPage >= totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold hover:bg-slate-50 hover:text-slate-900 disabled:opacity-35 disabled:cursor-not-allowed transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
              title="Halaman Selanjutnya"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            {totalPages > 3 && (
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={validCurrentPage >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-2xs"
                title={`Halaman Terakhir (Hal ${totalPages})`}
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modal: Single File Delete Confirmation */}
      {fileToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900">Hapus File dari Google Drive?</h3>
                <p className="text-xs text-slate-500 font-mono truncate">{fileToDelete.name}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Apakah Anda yakin ingin menghapus file ini dari folder <strong>{targetConfig.name}</strong> di Google Drive? File akan otomatis terhapus atau dipindahkan ke tempat sampah.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setFileToDelete(null)}
                disabled={isDeletingSingle}
                className="px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors border border-slate-300 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDeleteSingle}
                disabled={isDeletingSingle}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-xl transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                {isDeletingSingle ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Ya, Hapus File</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Batch Duplicate Cleanup Confirmation */}
      {showBatchDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-red-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Bersihkan File Duplikat dari Google Drive
                </h3>
                <p className="text-xs text-slate-500">
                  Folder: <strong>{targetConfig.name}</strong>
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 space-y-1 leading-relaxed">
              <p className="font-bold">
                ⚠️ Ditemukan {duplicateGroups.length} nama file kembar ({totalExtraDuplicates} salinan ganda).
              </p>
              <p>
                Sistem akan <strong>mempertahankan 1 file terbaru</strong> untuk setiap nama file, dan <strong>otomatis menghapus salinan kembar lainnya</strong> langsung dari Google Drive Anda.
              </p>
            </div>

            {/* List of duplicates preview */}
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 text-xs">
              {duplicateGroups.map((group) => (
                <div key={group.name} className="p-2.5 flex items-center justify-between hover:bg-slate-50">
                  <div className="min-w-0 pr-2">
                    <span className="font-mono font-bold text-slate-900 block truncate">{group.name}</span>
                    <span className="text-[11px] text-slate-500">
                      Total {group.count} file di Drive • 1 dipertahankan, {group.count - 1} akan dihapus
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 shrink-0">
                    -{group.count - 1} Duplikat
                  </span>
                </div>
              ))}
            </div>

            {/* Deletion progress bar if active */}
            {isBatchDeleting && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" />
                    <span>{batchProgressText}</span>
                  </span>
                  <span className="font-mono">{batchProgressPercent}%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-600 rounded-full transition-all duration-300"
                    style={{ width: `${batchProgressPercent}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowBatchDeleteModal(false)}
                disabled={isBatchDeleting}
                className="px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors border border-slate-300 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteBatchDelete}
                disabled={isBatchDeleting}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-xl transition-all flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-60"
              >
                {isBatchDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sedang Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Ya, Hapus {totalExtraDuplicates} File Duplikat</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
