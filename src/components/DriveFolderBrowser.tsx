import React, { useState } from 'react';
import { DriveFileInfo, FolderCategory } from '../types';
import { TARGET_FOLDERS } from '../config/driveConfig';
import { SyncDriveButton } from './SyncDriveButton';
import {
  Boxes,
  ShoppingBag,
  RefreshCw,
  Search,
  ExternalLink,
  FileImage,
  Loader2,
} from 'lucide-react';

interface DriveFolderBrowserProps {
  category: FolderCategory;
  files: DriveFileInfo[];
  isLoading: boolean;
  token?: string | null;
  onRefresh: () => void;
  onShowToast?: (type: 'success' | 'error' | 'info', title: string, message: string) => void;
}

export const DriveFolderBrowser: React.FC<DriveFolderBrowserProps> = ({
  category,
  files,
  isLoading,
  token,
  onRefresh,
  onShowToast,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const targetConfig = TARGET_FOLDERS[category];
  const isAio = category === 'aio';

  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase().trim())
  );

  const formatFileSize = (bytesStr?: string) => {
    if (!bytesStr) return '-';
    const bytes = parseInt(bytesStr, 10);
    if (isNaN(bytes)) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
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
                Isi Folder Google Drive: {targetConfig.name}
              </h3>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  isAio ? 'bg-indigo-100 text-indigo-800' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {isAio ? 'FOLDER 1' : 'FOLDER 2'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              File yang tersimpan di Google Drive ({files.length} file terdeteksi)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari cth: 11321..."
              className="text-xs pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 w-36 sm:w-48"
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
            {searchTerm ? 'Tidak ada file yang cocok dengan pencarian' : 'Folder ini belum memiliki file'}
          </p>
          <p className="text-[11px] text-slate-400">
            Upload file PNG 5-digit untuk menyimpannya ke folder {targetConfig.name}.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-80 overflow-y-auto pr-1">
          {filteredFiles.map((file) => (
            <div
              key={file.id}
              className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 transition-all flex items-center justify-between gap-2 shadow-2xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden border ${
                    isAio ? 'bg-indigo-50 border-indigo-100' : 'bg-emerald-50 border-emerald-100'
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
                      className={`w-4 h-4 ${isAio ? 'text-indigo-600' : 'text-emerald-600'}`}
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-mono font-bold text-slate-900 truncate">
                    {file.name}
                  </p>
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
          ))}
        </div>
      )}
    </div>
  );
};
