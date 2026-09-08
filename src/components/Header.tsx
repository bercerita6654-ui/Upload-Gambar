import React from 'react';
import { User } from 'firebase/auth';
import { Cloud, CheckCircle2, LogOut, HardDrive, AlertCircle } from 'lucide-react';
import { SyncDriveButton } from './SyncDriveButton';
import { FolderCategory } from '../types';

interface HeaderProps {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  onLogin: () => void;
  onLogout: () => void;
  onSyncCompleted?: () => void;
  onShowToast?: (type: 'success' | 'error' | 'info', title: string, message: string) => void;
  activeCategory?: FolderCategory;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  token,
  isLoading,
  onLogin,
  onLogout,
  onSyncCompleted,
  onShowToast,
  activeCategory,
}) => {
  const isAuthenticated = !!user && !!token;

  return (
    <header className="w-full bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
        {/* Logo and Brand */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-xs shrink-0">
            <HardDrive className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-slate-900 leading-tight truncate">
                Drive Image Uploader
              </h1>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200/60 shrink-0">
                Auto Sync
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block truncate">
              Upload Gambar PNG 5-Digit ke Folder Google Drive AIO & Story Product
            </p>
          </div>
        </div>

        {/* Right side Controls */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Tombol Apps Script Sync data Drive */}
          <SyncDriveButton
            onSyncCompleted={onSyncCompleted}
            onShowToast={onShowToast}
            activeCategory={activeCategory}
            variant="header"
          />

          {isAuthenticated ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 hidden xs:flex">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="font-medium truncate max-w-[110px] sm:max-w-[160px]">
                  {user.displayName || user.email}
                </span>
              </div>

              <button
                id="header-logout-button"
                onClick={onLogout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg transition-colors cursor-pointer"
                title="Keluar dari akun Google"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Keluar</span>
              </button>
            </div>
          ) : (
            <button
              id="google-signin-btn"
              onClick={onLogin}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-300 rounded-lg shadow-xs text-xs sm:text-sm font-medium text-slate-700 hover:text-slate-900 transition-all cursor-pointer disabled:opacity-50"
            >

              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.94H1.27v3.15C3.25 21.31 7.35 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.26c-.25-.72-.38-1.49-.38-2.26s.13-1.54.38-2.26V6.59H1.27C.46 8.21 0 10.05 0 12s.46 3.79 1.27 5.41l4.01-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.25 2.69 1.27 6.59l4.01 3.15c.95-2.84 3.6-4.99 6.72-4.99z"
                />
              </svg>
              <span>{isLoading ? 'Menghubungkan...' : 'Masuk dengan Google'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
