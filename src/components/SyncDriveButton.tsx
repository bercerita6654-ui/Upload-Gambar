import React, { useState } from 'react';
import { RefreshCw, ExternalLink, Check, AlertCircle, Sparkles } from 'lucide-react';
import { APPS_SCRIPT_SYNC_URL } from '../config/driveConfig';

interface SyncDriveButtonProps {
  onSyncCompleted?: () => void;
  onShowToast?: (type: 'success' | 'error' | 'info', title: string, message: string) => void;
  variant?: 'header' | 'browser' | 'card';
  className?: string;
}

export const SyncDriveButton: React.FC<SyncDriveButtonProps> = ({
  onSyncCompleted,
  onShowToast,
  variant = 'header',
  className = '',
}) => {
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncStatus, setLastSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleTriggerSync = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isSyncing) return;

    setIsSyncing(true);
    setLastSyncStatus('idle');

    try {
      // Trigger Google Apps Script Web App
      // Mode 'no-cors' allows browser to trigger Google Apps Script Web Apps without CORS failure
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      await fetch(APPS_SCRIPT_SYNC_URL, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-cache',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      setLastSyncStatus('success');
      setTimeout(() => setLastSyncStatus('idle'), 4000);

      if (onShowToast) {
        onShowToast(
          'success',
          'Sync Data Drive Berhasil',
          'Permintaan sinkronisasi data Drive telah berhasil dikirim ke Google Apps Script.'
        );
      }

      if (onSyncCompleted) {
        onSyncCompleted();
      }
    } catch (err: unknown) {
      console.warn('Apps Script sync response:', err);
      // Even if fetch throws on extreme network error, we notify gracefully
      setLastSyncStatus('error');
      setTimeout(() => setLastSyncStatus('idle'), 4000);

      if (onShowToast) {
        onShowToast(
          'error',
          'Gagal Sync Data Drive',
          'Terjadi kendala jaringan saat menghubungi server Google Apps Script.'
        );
      }
    } finally {
      setIsSyncing(false);
    }
  };

  if (variant === 'browser') {
    return (
      <div className={`inline-flex items-center rounded-lg shadow-2xs border border-blue-200 bg-white ${className}`}>
        <button
          id="sync-drive-browser-btn"
          onClick={handleTriggerSync}
          disabled={isSyncing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 hover:text-blue-800 hover:bg-blue-50 transition-colors rounded-l-lg cursor-pointer disabled:opacity-60"
          title="Jalankan Google Apps Script untuk sinkronisasi data Drive"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${
              isSyncing ? 'animate-spin text-blue-600' : lastSyncStatus === 'success' ? 'text-emerald-600' : ''
            }`}
          />
          <span>{isSyncing ? 'Menyinkronkan...' : 'Sync data Drive'}</span>
        </button>
        <a
          href={APPS_SCRIPT_SYNC_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="px-2 py-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 border-l border-blue-100 rounded-r-lg transition-colors"
          title="Buka URL Google Apps Script di tab baru"
        >
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-2xs transition-all ${className}`}
    >
      <button
        id="header-sync-drive-btn"
        onClick={handleTriggerSync}
        disabled={isSyncing}
        className="inline-flex items-center gap-2 px-3 sm:px-3.5 py-1.5 text-xs font-semibold cursor-pointer disabled:opacity-75"
        title="Jalankan Google Apps Script Sinkronisasi data Drive"
      >
        <RefreshCw
          className={`w-3.5 h-3.5 ${
            isSyncing ? 'animate-spin' : lastSyncStatus === 'success' ? 'text-emerald-300' : 'text-blue-100'
          }`}
        />
        <span>
          {isSyncing
            ? 'Menyinkronkan...'
            : lastSyncStatus === 'success'
            ? 'Tersinkron!'
            : 'Sync data Drive'}
        </span>
      </button>

      {/* External Link quick action to view script web app in new tab */}
      <a
        href={APPS_SCRIPT_SYNC_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="px-2 py-1.5 border-l border-white/20 text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        title="Buka Web App Apps Script di tab baru"
      >
        <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
};
