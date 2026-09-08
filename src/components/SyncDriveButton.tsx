import React, { useState, useRef, useEffect } from 'react';
import {
  RefreshCw,
  ExternalLink,
  ChevronDown,
  FileSpreadsheet,
  Check,
  Copy,
  Code2,
  X,
  HelpCircle,
  Boxes,
  ShoppingBag,
  Layers,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Terminal,
  KeyRound,
  TableProperties,
  Bug,
  Globe,
  AlertTriangle,
  Play,
  RotateCcw,
} from 'lucide-react';
import { APPS_SCRIPT_SYNC_URL, SPREADSHEET_CONFIG } from '../config/driveConfig';
import { FolderCategory } from '../types';
import {
  executeDirectSpreadsheetSync,
  callAppsScriptWithDiagnostics,
  diagnoseDirectSyncError,
  SyncDriveResult,
  AppsScriptDiagnostic,
  DiagnosticCategory,
} from '../services/sheetSyncService';

interface SyncDriveButtonProps {
  token?: string | null;
  onSyncCompleted?: () => void;
  onShowToast?: (type: 'success' | 'error' | 'info', title: string, message: string) => void;
  activeCategory?: FolderCategory;
  variant?: 'header' | 'browser';
  className?: string;
}

export const APPS_SCRIPT_FULL_CODE = `/**
 * =========================================================================
 * GOOGLE APPS SCRIPT: AUTO SYNC ID DRIVE KE GOOGLE SPREADSHEET (STOCK LIST)
 * =========================================================================
 * Target Spreadsheet ID: 1mrD9sQK_Sffa1X1fzlCDmaJXs1Yj2q-XTNdi2sRGPos
 * Target Tab Sheet     : "STOCK LIST"
 * Target Kolom:
 *   - Gambar Story : ID di Kolom V (22), Last Update di Kolom W (23)
 *   - Foto Produk  : ID di Kolom X (24), Last Update di Kolom Y (25)
 * SKU diambil dari: Kolom A (Index 0)
 */

var TARGET_SPREADSHEET_ID = "1mrD9sQK_Sffa1X1fzlCDmaJXs1Yj2q-XTNdi2sRGPos";
var TARGET_SHEET_NAME = "STOCK LIST";

/**
 * Helper untuk mengambil object Spreadsheet secara aman
 */
function getTargetSpreadsheet() {
  try {
    return SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  } catch (e) {
    return SpreadsheetApp.getActiveSpreadsheet();
  }
}

/**
 * 1. FUNGSI MENU: Otomatis membuat menu di Google Sheet
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('⚙️ Auto Sync Drive')
      .addItem('Ambil ID Gambar Story (Kolom V & W)', 'sinkronisasiGambarStory')
      .addItem('Ambil ID Foto Produk (Kolom X & Y)', 'sinkronisasiFotoProduk')
      .addSeparator()
      .addItem('⚡ Sinkronisasi Semua Sekaligus', 'sinkronisasiSemua')
      .addToUi();
}

/**
 * 2. FUNGSI WEB APP (doGet):
 * Menerima sinyal klik dari tombol "Sync data Drive" di aplikasi web!
 */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'all';
    var sheetName = (e && e.parameter && e.parameter.sheet) ? e.parameter.sheet : TARGET_SHEET_NAME;
    
    var ss = getTargetSpreadsheet();
    if (!ss) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Spreadsheet dengan ID ' + TARGET_SPREADSHEET_ID + ' tidak dapat dibuka.'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var sheet = ss.getSheetByName(sheetName) || ss.getSheets()[0];
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Tab Sheet "' + sheetName + '" tidak ditemukan.'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var reports = [];
    
    // A. Sinkronisasi Gambar Story (Kolom V & W)
    if (action === 'story' || action === 'all') {
      var resStory = jalankanLogikaSync(sheet, '1A4MpcBh6t60ys0KVvLjdr5F3J0Im3U_E', 22, 'GAMBAR STORY (Kolom V & W)');
      reports.push(resStory);
    }
    
    // B. Sinkronisasi Foto Produk / AIO (Kolom X & Y)
    if (action === 'aio' || action === 'produk' || action === 'all') {
      var resAio = jalankanLogikaSync(sheet, '1xYDYQfYIvFK8AxzfEFchdPg7wv58zfyI', 24, 'FOTO PRODUK (Kolom X & Y)');
      reports.push(resAio);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Sinkronisasi berhasil dijalankan!',
      spreadsheetId: SPREADSHEET_ID,
      sheet: sheet.getName(),
      reports: reports
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * FUNGSI 1: Memicu sinkronisasi Gambar Story (Dari menu Spreadsheet)
 */
function sinkronisasiGambarStory() {
  var folderId = '1A4MpcBh6t60ys0KVvLjdr5F3J0Im3U_E'; // Folder Gambar Story
  var startColumn = 22; // 22 = Kolom V
  var namaLaporan = 'GAMBAR STORY (Kolom V & W)';
  prosesSinkronisasiDrive(folderId, startColumn, namaLaporan);
}

/**
 * FUNGSI 2: Memicu sinkronisasi Foto Produk (Dari menu Spreadsheet)
 */
function sinkronisasiFotoProduk() {
  var folderId = '1xYDYQfYIvFK8AxzfEFchdPg7wv58zfyI'; // Folder Foto Produk / AIO
  var startColumn = 24; // 24 = Kolom X
  var namaLaporan = 'FOTO PRODUK (Kolom X & Y)';
  prosesSinkronisasiDrive(folderId, startColumn, namaLaporan);
}

/**
 * FUNGSI 3: Memicu sinkronisasi Semua Sekaligus (Dari menu Spreadsheet)
 */
function sinkronisasiSemua() {
  var ss = getTargetSpreadsheet();
  var sheet = ss.getSheetByName(TARGET_SHEET_NAME) || ss.getActiveSheet();
  var resStory = jalankanLogikaSync(sheet, '1A4MpcBh6t60ys0KVvLjdr5F3J0Im3U_E', 22, 'GAMBAR STORY (Kolom V & W)');
  var resAio = jalankanLogikaSync(sheet, '1xYDYQfYIvFK8AxzfEFchdPg7wv58zfyI', 24, 'FOTO PRODUK (Kolom X & Y)');
  
  var reportMessage = '📊 LAPORAN SINKRONISASI LENGKAP:\n\n' +
                      '• Spreadsheet: "' + ss.getName() + '"\n' +
                      '• Tab Sheet: "' + sheet.getName() + '"\n' +
                      '• Gambar Story: ' + resStory.matchCount + ' baris disinkron (dari ' + resStory.totalFiles + ' file Drive)\n' +
                      '• Foto Produk: ' + resAio.matchCount + ' baris disinkron (dari ' + resAio.totalFiles + ' file Drive)';
  SpreadsheetApp.getUi().alert(reportMessage);
}

/**
 * Pembungkus laporan UI Alert (Bila diklik dari dalam menu Google Sheet)
 */
function prosesSinkronisasiDrive(folderId, startCol, namaLaporan) {
  var ss = getTargetSpreadsheet();
  var sheet = ss.getSheetByName(TARGET_SHEET_NAME) || ss.getActiveSheet();
  var res = jalankanLogikaSync(sheet, folderId, startCol, namaLaporan);
  
  if (res.error) {
    SpreadsheetApp.getUi().alert('❌ Error: ' + res.error);
    return;
  }
  
  var reportMessage = '📊 LAPORAN SINKRONISASI ' + namaLaporan + ':\\n\\n' +
                      '• Tab Sheet: "' + sheet.getName() + '"\\n' +
                      '• Total file di Drive: ' + res.totalFiles + ' file.\\n' +
                      '• Berhasil sinkron: ' + res.matchCount + ' baris.';
  SpreadsheetApp.getUi().alert(reportMessage);
}

/**
 * FUNGSI UTAMA LOGIKA SINKRONISASI:
 */
function jalankanLogikaSync(sheet, folderId, startCol, namaLaporan) {
  var sheetName = sheet.getName();
  var folder;
  try {
    folder = DriveApp.getFolderById(folderId);
  } catch (e) {
    return { error: 'Folder Google Drive tidak ditemukan (ID: ' + folderId + ')', nama: namaLaporan };
  }

  var dataRange = sheet.getDataRange();
  var data = dataRange.getValues(); 
  
  if (data.length <= 1) {
    return { error: 'Tidak ada data baris di Sheet "' + sheetName + '" untuk diproses.', nama: namaLaporan };
  }

  var filesIter = folder.getFiles();
  var fileMap = {};
  var totalFiles = 0;
  
  while (filesIter.hasNext()) {
    var file = filesIter.next();
    var fullFileName = file.getName().toString().trim().toLowerCase();
    totalFiles++;
    
    var dotIndex = fullFileName.lastIndexOf('.');
    var baseName = dotIndex !== -1 ? fullFileName.substring(0, dotIndex) : fullFileName;
    
    fileMap[baseName] = {
      id: file.getId(),
      dateCreated: file.getDateCreated()
    };
  }

  var updates = []; 
  var matchCount = 0;

  // Mulai loop dari baris ke-2 (index 1) karena baris 1 adalah Header
  for (var i = 1; i < data.length; i++) {
    var rawSku = data[i][0]; // SKU di Kolom A (Index 0)
    
    if (typeof rawSku === 'number') {
      rawSku = rawSku.toFixed(0); 
    }
    
    var sku = String(rawSku).trim().toLowerCase();
    var rowUpdate = ["", ""]; // Array default kosong [ID File, Tanggal Update]
    
    // Cek apakah SKU tidak kosong dan file ditemukan di Drive
    if (sku !== "" && fileMap[sku]) {
      rowUpdate[0] = fileMap[sku].id;
      
      var formattedDate = Utilities.formatDate(
        fileMap[sku].dateCreated, 
        Session.getScriptTimeZone(), 
        "dd-MM-yyyy HH:mm:ss"
      );
      rowUpdate[1] = formattedDate;
      
      matchCount++;
    }
    updates.push(rowUpdate);
  }

  // Memastikan jumlah kolom di sheet cukup untuk menampung data
  var maxColumns = sheet.getMaxColumns();
  var requiredColumns = startCol + 1; // 22 -> butuh 23 (W), 24 -> butuh 25 (Y)
  
  if (maxColumns < requiredColumns) {
    sheet.insertColumnsAfter(maxColumns, requiredColumns - maxColumns);
  }

  // Tuliskan data: mulai dari baris 2, pada startCol (22/24), sebanyak total baris, 2 kolom
  sheet.getRange(2, startCol, updates.length, 2).setValues(updates);
  
  return {
    nama: namaLaporan,
    totalFiles: totalFiles,
    matchCount: matchCount
  };
}
`;

export const SyncDriveButton: React.FC<SyncDriveButtonProps> = ({
  token,
  onSyncCompleted,
  onShowToast,
  activeCategory = 'aio',
  variant = 'header',
  className = '',
}) => {
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isTestingEndpoint, setIsTestingEndpoint] = useState<boolean>(false);
  const [lastSyncStatus, setLastSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const [showScriptModal, setShowScriptModal] = useState<boolean>(false);
  const [showProgressModal, setShowProgressModal] = useState<boolean>(false);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [syncResult, setSyncResult] = useState<SyncDriveResult | null>(null);
  const [diagnosticResult, setDiagnosticResult] = useState<AppsScriptDiagnostic | null>(null);
  const [directErrorDiagnostic, setDirectErrorDiagnostic] = useState<{
    category: DiagnosticCategory;
    categoryLabel: string;
    title: string;
    detail: string;
    rawError?: string;
    suggestedFix: string[];
  } | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isLogCopied, setIsLogCopied] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_FULL_CODE);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 3000);
  };

  const handleCopyErrorLog = () => {
    const active = diagnosticResult || directErrorDiagnostic;
    if (!active) return;
    const lines = [
      '=== LOG DIAGNOSTIK SINKRONISASI GOOGLE APPS SCRIPT / SPREADSHEET ===',
      `Waktu           : ${new Date().toLocaleString('id-ID')}`,
      `Kategori        : ${active.category} - ${active.categoryLabel}`,
      `Status Masalah  : ${active.title}`,
      `Penjelasan      : ${active.detail}`,
      `Spreadsheet ID  : ${SPREADSHEET_CONFIG.spreadsheetId}`,
      `Sheet Name      : ${SPREADSHEET_CONFIG.sheetName}`,
      'diagnosticResult' in active && (active as AppsScriptDiagnostic).url
        ? `Endpoint URL    : ${(active as AppsScriptDiagnostic).url}`
        : `Endpoint URL    : ${APPS_SCRIPT_SYNC_URL}`,
      'httpStatus' in active && (active as AppsScriptDiagnostic).httpStatus
        ? `HTTP Status     : ${(active as AppsScriptDiagnostic).httpStatus}`
        : '',
      active.rawError || ('rawResponse' in active && (active as AppsScriptDiagnostic).rawResponse)
        ? `\n[RESPON ERROR MENTAH DARI GOOGLE]:\n${
            active.rawError || ('rawResponse' in active ? (active as AppsScriptDiagnostic).rawResponse : '')
          }\n`
        : '',
      'Langkah Perbaikan Disarankan:',
      ...(active.suggestedFix || []).map((step, idx) => `  ${idx + 1}. ${step}`),
      '====================================================================',
    ].filter(Boolean);

    navigator.clipboard.writeText(lines.join('\n'));
    setIsLogCopied(true);
    setTimeout(() => setIsLogCopied(false), 3000);
  };

  /**
   * Menguji endpoint Apps Script secara langsung tanpa harus melakukan sync penuh.
   * Memberikan feedback status, kategori error, dan log mentah ke user.
   */
  const handleTestEndpoint = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDropdownOpen(false);
    setShowProgressModal(true);
    setIsTestingEndpoint(true);
    setLastSyncStatus('idle');
    setSyncResult(null);
    setDirectErrorDiagnostic(null);
    setDiagnosticResult(null);
    setProgressPercent(35);
    setProgressStatus('Menghubungi endpoint Google Apps Script & memeriksa respon...');

    try {
      const diag = await callAppsScriptWithDiagnostics('all', 'STOCK LIST');
      setDiagnosticResult(diag);
      setProgressPercent(100);

      if (diag.success) {
        setLastSyncStatus('success');
        setProgressStatus('Endpoint Google Apps Script aktif dan berhasil merespon!');
      } else {
        setLastSyncStatus('error');
        setProgressStatus(`Terdeteksi masalah: ${diag.title}`);
      }
    } catch (err: any) {
      setLastSyncStatus('error');
      setProgressStatus('Gagal menghubungi endpoint Google Apps Script.');
    } finally {
      setIsTestingEndpoint(false);
    }
  };

  const handleTriggerSync = async (
    targetAction: 'all' | 'aio' | 'story' = 'all',
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();
    setDropdownOpen(false);
    if (isSyncing || isTestingEndpoint) return;

    if (!token) {
      if (onShowToast) {
        onShowToast(
          'info',
          'Login Google Diperlukan',
          'Silakan login terlebih dahulu untuk menyinkronkan data Google Sheet secara langsung.'
        );
      }
      return;
    }

    setIsSyncing(true);
    setLastSyncStatus('idle');
    setSyncResult(null);
    setDiagnosticResult(null);
    setDirectErrorDiagnostic(null);
    setShowProgressModal(true);
    setProgressPercent(5);
    setProgressStatus('Menyiapkan koneksi ke Google Drive & Sheets...');

    try {
      // 1. Direct sync through Google Sheets API with the logged-in user's token
      const res = await executeDirectSpreadsheetSync(token, targetAction, (status, percent) => {
        setProgressStatus(status);
        setProgressPercent(percent);
      });

      setSyncResult(res);
      if (res.appsScriptDiagnostic) {
        setDiagnosticResult(res.appsScriptDiagnostic);
      }
      setLastSyncStatus('success');

      let detailMsg = '';
      if (targetAction === 'all') {
        detailMsg = `Berhasil update ${res.storyMatches} Gambar Story (Kolom V & W) dan ${res.aioMatches} Foto Produk (Kolom X & Y) pada Sheet '${res.sheetName}'!`;
      } else if (targetAction === 'story') {
        detailMsg = `Berhasil update ${res.storyMatches} Gambar Story (Kolom V & W) pada Sheet '${res.sheetName}'!`;
      } else {
        detailMsg = `Berhasil update ${res.aioMatches} Foto Produk (Kolom X & Y) pada Sheet '${res.sheetName}'!`;
      }

      if (onShowToast) {
        onShowToast('success', 'Sinkronisasi Spreadsheet Berhasil!', detailMsg);
      }

      if (onSyncCompleted) {
        onSyncCompleted();
      }
    } catch (err: unknown) {
      console.warn('Sync error:', err);
      const diagnosed = diagnoseDirectSyncError(err);
      setDirectErrorDiagnostic(diagnosed);
      setLastSyncStatus('error');
      setProgressStatus(`Gagal: ${diagnosed.title}`);

      // Call Apps Script diagnostic proxy to fetch live endpoint status & error logs
      try {
        const diag = await callAppsScriptWithDiagnostics(targetAction, 'STOCK LIST');
        setDiagnosticResult(diag);
      } catch {
        // ignore
      }

      if (onShowToast) {
        onShowToast(
          'error',
          diagnosed.title,
          diagnosed.detail
        );
      }
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <>
      {/* Dropdown Container */}
      <div className={`relative inline-flex items-center ${className}`} ref={dropdownRef}>
        {variant === 'browser' ? (
          <div className="inline-flex items-center rounded-lg shadow-2xs border border-blue-200 bg-white">
            <button
              id="sync-drive-browser-btn"
              onClick={() => handleTriggerSync('all')}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 hover:text-blue-800 hover:bg-blue-50 transition-colors rounded-l-lg cursor-pointer disabled:opacity-60"
              title="Jalankan sinkronisasi ID Drive ke Sheet 'STOCK LIST'"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  isSyncing
                    ? 'animate-spin text-blue-600'
                    : lastSyncStatus === 'success'
                    ? 'text-emerald-600'
                    : ''
                }`}
              />
              <span>{isSyncing ? 'Menyinkronkan...' : 'Sync data Drive'}</span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setDropdownOpen(!dropdownOpen);
              }}
              className="px-1.5 py-1.5 text-blue-600 hover:bg-blue-50 border-l border-blue-100 transition-colors cursor-pointer"
              title="Pilihan Sinkronisasi"
            >
              <ChevronDown className="w-3 h-3" />
            </button>

            <a
              href={`https://docs.google.com/spreadsheets/d/${SPREADSHEET_CONFIG.spreadsheetId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 border-l border-blue-100 rounded-r-lg transition-colors"
              title="Buka Google Spreadsheet 'STOCK LIST'"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        ) : (
          <div className="inline-flex items-center rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-2xs transition-all">
            <button
              id="header-sync-drive-btn"
              onClick={() => handleTriggerSync('all')}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 px-3 sm:px-3.5 py-1.5 text-xs font-semibold cursor-pointer disabled:opacity-75"
              title="Jalankan sinkronisasi ID Drive ke Sheet 'STOCK LIST'"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  isSyncing
                    ? 'animate-spin'
                    : lastSyncStatus === 'success'
                    ? 'text-emerald-300'
                    : 'text-blue-100'
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

            {/* Dropdown Toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDropdownOpen(!dropdownOpen);
              }}
              className="px-1.5 py-1.5 border-l border-white/20 text-white/90 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Pilihan Sinkronisasi & Petunjuk Script"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {/* External Link to Spreadsheet */}
            <a
              href={`https://docs.google.com/spreadsheets/d/${SPREADSHEET_CONFIG.spreadsheetId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-1.5 border-l border-white/20 text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              title="Buka Spreadsheet di tab baru"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {/* Dropdown Menu */}
        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-1.5 w-76 bg-white rounded-xl shadow-xl border border-slate-200 z-50 py-1.5 text-xs animate-in fade-in-50 zoom-in-95">
            <div className="px-3 py-1.5 border-b border-slate-100 font-semibold text-slate-700 flex items-center justify-between">
              <span className="truncate">Sheet: STOCK LIST</span>
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            </div>

            <button
              onClick={() => handleTriggerSync('all')}
              disabled={isSyncing}
              className="w-full px-3 py-2 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-start gap-2 transition-colors cursor-pointer"
            >
              <Layers className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">⚡ Sync Keduanya Sekaligus</div>
                <div className="text-[10px] text-slate-500">
                  Kolom V, W (Story) &amp; Kolom X, Y (Foto Produk)
                </div>
              </div>
            </button>

            <button
              onClick={() => handleTriggerSync('story')}
              disabled={isSyncing}
              className="w-full px-3 py-2 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-start gap-2 transition-colors cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">📸 Sync Gambar Story Saja</div>
                <div className="text-[10px] text-slate-500">ID di Kolom V (22), Date di Kolom W (23)</div>
              </div>
            </button>

            <button
              onClick={() => handleTriggerSync('aio')}
              disabled={isSyncing}
              className="w-full px-3 py-2 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-start gap-2 transition-colors cursor-pointer"
            >
              <Boxes className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">📦 Sync Foto Produk Saja</div>
                <div className="text-[10px] text-slate-500">ID di Kolom X (24), Date di Kolom Y (25)</div>
              </div>
            </button>

            <div className="border-t border-slate-100 my-1"></div>

            {/* Tombol Uji Endpoint Apps Script Langsung */}
            <button
              onClick={handleTestEndpoint}
              disabled={isSyncing || isTestingEndpoint}
              className="w-full px-3 py-2 text-left text-purple-700 hover:bg-purple-50 flex items-start gap-2 transition-colors cursor-pointer"
              title="Periksa status koneksi, hak akses, struktur sheet dan log error Google"
            >
              <Terminal className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold flex items-center gap-1.5 text-xs">
                  <span>🔍 Uji Endpoint Apps Script</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-100 text-purple-700 font-semibold">
                    Diagnostik
                  </span>
                </div>
                <div className="text-[10px] text-slate-500">
                  Cek kredensial, struktur sheet &amp; log error Google
                </div>
              </div>
            </button>

            <a
              href={`https://docs.google.com/spreadsheets/d/${SPREADSHEET_CONFIG.spreadsheetId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full px-3 py-1.5 text-left text-slate-600 hover:bg-slate-50 flex items-center justify-between"
            >
              <span className="text-[11px]">Buka Spreadsheet Target</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>

            <button
              onClick={() => {
                setDropdownOpen(false);
                setShowScriptModal(true);
              }}
              className="w-full px-3 py-2 text-left text-blue-600 hover:bg-blue-50 flex items-center gap-2 font-medium cursor-pointer"
            >
              <Code2 className="w-4 h-4" />
              <span>Kode Google Apps Script</span>
            </button>
          </div>
        )}
      </div>

      {/* Modal Progress & Diagnostik Sinkronisasi Langsung */}
      {showProgressModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {isTestingEndpoint ? 'Diagnostik Endpoint Apps Script' : 'Sinkronisasi ID Google Drive'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Sheet: 'STOCK LIST' • {SPREADSHEET_CONFIG.spreadsheetId.slice(0, 16)}...
                  </p>
                </div>
              </div>
              {!isSyncing && !isTestingEndpoint && (
                <button
                  onClick={() => setShowProgressModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {isSyncing || isTestingEndpoint ? (
                <div className="space-y-3 py-4">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                    <p className="text-xs font-medium text-slate-700">{progressStatus}</p>
                  </div>
                  {/* Progress Bar */}
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-blue-600 h-2 transition-all duration-300 rounded-full"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 text-right">{progressPercent}%</p>
                </div>
              ) : syncResult ? (
                <div className="space-y-4">
                  {/* Kartu Sukses Direct Sync */}
                  <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                      <p className="font-bold text-sm text-emerald-950">Sinkronisasi Spreadsheet Berhasil!</p>
                      <p className="text-slate-600 text-[11px] leading-relaxed">
                        Data kolom Kolom V &amp; W (Story) dan Kolom X &amp; Y (Foto Produk) telah berhasil diperbarui langsung ke spreadsheet Google.
                      </p>
                    </div>
                  </div>

                  {/* Ringkasan Baris Terupdate */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-0.5">
                      <span className="text-[10px] text-slate-500 font-medium">Gambar Story (Kolom V &amp; W)</span>
                      <p className="text-lg font-bold text-slate-900">
                        {syncResult.storyMatches}{' '}
                        <span className="text-xs font-normal text-slate-500">baris</span>
                      </p>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-0.5">
                      <span className="text-[10px] text-slate-500 font-medium">Foto Produk (Kolom X &amp; Y)</span>
                      <p className="text-lg font-bold text-slate-900">
                        {syncResult.aioMatches}{' '}
                        <span className="text-xs font-normal text-slate-500">baris</span>
                      </p>
                    </div>
                  </div>

                  {/* Status Pemanggilan Apps Script Tambahan */}
                  {syncResult.appsScriptDiagnostic && (
                    <div className="border-t border-slate-100 pt-3">
                      {syncResult.appsScriptDiagnostic.success ? (
                        <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>Endpoint Apps Script juga terverifikasi aktif dan merespon dengan baik (HTTP 200).</span>
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-2">
                          <div className="flex items-center gap-2 font-bold text-amber-950">
                            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>Catatan Diagnostik Endpoint Apps Script:</span>
                          </div>
                          <p className="text-[11px] text-slate-700 leading-relaxed">
                            Data spreadsheet utama telah terupdate, namun endpoint Web App Apps Script melaporkan kendala: <strong>{syncResult.appsScriptDiagnostic.title}</strong>.
                          </p>
                          <button
                            onClick={() => {
                              setSyncResult(null);
                              setDiagnosticResult(syncResult.appsScriptDiagnostic || null);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900 underline cursor-pointer"
                          >
                            <span>Lihat Log Error Apps Script Selengkapnya &rarr;</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* TAMPILAN DIAGNOSTIK ERROR MENDETAIL (Kredensial vs Struktur Sheet vs Kode Apps Script) */
                (() => {
                  const active = diagnosticResult || directErrorDiagnostic;
                  const isSuccessDiag = diagnosticResult && diagnosticResult.success;

                  if (isSuccessDiag) {
                    return (
                      <div className="space-y-4">
                        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-2">
                          <div className="flex items-center gap-2 font-bold text-sm text-emerald-950">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                            <span>Endpoint Apps Script Berfungsi Normal!</span>
                          </div>
                          <p className="text-slate-600 text-[11px] leading-relaxed">
                            {diagnosticResult.detail || 'Endpoint Apps Script dapat diakses dan merespon dengan baik.'}
                          </p>
                          <div className="text-[10px] text-slate-500 font-mono bg-white/70 p-2 rounded border border-emerald-100">
                            URL: {diagnosticResult.url} (HTTP {diagnosticResult.httpStatus})
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                          <button
                            onClick={() => handleTriggerSync('all')}
                            disabled={isSyncing}
                            className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Jalankan Sinkronisasi Sekarang</span>
                          </button>
                        </div>
                      </div>
                    );
                  }

                  if (!active) {
                    return (
                      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-xs space-y-1">
                          <p className="font-bold">Status Sinkronisasi</p>
                          <p className="text-slate-600 text-[11px]">{progressStatus}</p>
                        </div>
                      </div>
                    );
                  }

                  const category = active.category;
                  const isCredential = category === 'KREDENSIAL_AKSES';
                  const isStructure = category === 'STRUKTUR_SHEET';
                  const isCode = category === 'KODE_APPS_SCRIPT';

                  return (
                    <div className="space-y-4">
                      {/* Badge Kategori Utama */}
                      <div
                        className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                          isCredential
                            ? 'bg-amber-50 border-amber-300 text-amber-950'
                            : isStructure
                            ? 'bg-yellow-50 border-yellow-300 text-yellow-950'
                            : isCode
                            ? 'bg-rose-50 border-rose-300 text-rose-950'
                            : 'bg-red-50 border-red-300 text-red-950'
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isCredential
                              ? 'bg-amber-200/80 text-amber-900'
                              : isStructure
                              ? 'bg-yellow-200/80 text-yellow-900'
                              : isCode
                              ? 'bg-rose-200/80 text-rose-900'
                              : 'bg-red-200/80 text-red-900'
                          }`}
                        >
                          {isCredential ? (
                            <KeyRound className="w-5 h-5" />
                          ) : isStructure ? (
                            <TableProperties className="w-5 h-5" />
                          ) : isCode ? (
                            <Bug className="w-5 h-5" />
                          ) : (
                            <Globe className="w-5 h-5" />
                          )}
                        </div>

                        <div className="space-y-1 text-xs flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                                isCredential
                                  ? 'bg-amber-200 text-amber-900'
                                  : isStructure
                                  ? 'bg-yellow-200 text-yellow-900'
                                  : isCode
                                  ? 'bg-rose-200 text-rose-900'
                                  : 'bg-slate-200 text-slate-900'
                              }`}
                            >
                              Kategori: {active.categoryLabel}
                            </span>
                            {'httpStatus' in active && (active as AppsScriptDiagnostic).httpStatus ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-900 text-slate-100 font-mono">
                                HTTP {(active as AppsScriptDiagnostic).httpStatus}
                              </span>
                            ) : null}
                          </div>
                          <h4 className="font-bold text-sm leading-snug">{active.title}</h4>
                          <p className="text-[11px] leading-relaxed opacity-90">{active.detail}</p>
                        </div>
                      </div>

                      {/* Monospace Raw Error Log Box */}
                      {(active.rawError || ('rawResponse' in active && (active as AppsScriptDiagnostic).rawResponse)) && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-slate-700 flex items-center gap-1.5">
                              <Terminal className="w-3.5 h-3.5 text-slate-500" />
                              <span>Log Error Respon Google:</span>
                            </span>
                            <button
                              onClick={handleCopyErrorLog}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 cursor-pointer bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded transition-colors"
                            >
                              {isLogCopied ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span className="text-emerald-700 font-bold">Log Tersalin!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 text-slate-500" />
                                  <span>Salin Log Diagnostik</span>
                                </>
                              )}
                            </button>
                          </div>

                          <div className="bg-slate-900 text-slate-200 rounded-xl p-3 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-36 overflow-y-auto border border-slate-800 shadow-inner">
                            <div className="text-slate-400 text-[10px] pb-1 mb-1.5 border-b border-slate-800 flex items-center justify-between">
                              <span className="truncate">
                                {'url' in active ? (active as AppsScriptDiagnostic).url : APPS_SCRIPT_SYNC_URL}
                              </span>
                              <span>{new Date().toLocaleTimeString('id-ID')}</span>
                            </div>
                            <pre className="whitespace-pre-wrap break-all text-rose-300">
                              {active.rawError ||
                                ('rawResponse' in active ? (active as AppsScriptDiagnostic).rawResponse : '')}
                            </pre>
                          </div>
                        </div>
                      )}

                      {/* Rekomendasi Solusi Langkah demi Langkah */}
                      <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/80 space-y-2 text-xs">
                        <p className="font-bold text-slate-800 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-blue-600" />
                          <span>Langkah-Langkah Perbaikan yang Disarankan:</span>
                        </p>
                        <ol className="list-decimal pl-4 space-y-1.5 text-slate-700 text-[11px] leading-relaxed">
                          {(active.suggestedFix || []).map((step, idx) => (
                            <li key={idx} className="pl-0.5">
                              {step}
                            </li>
                          ))}
                        </ol>
                      </div>

                      {/* Tombol Aksi Cepat */}
                      <div className="flex items-center gap-2 pt-1 flex-wrap">
                        <button
                          onClick={handleTestEndpoint}
                          disabled={isTestingEndpoint}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                          title="Tes ulang pemanggilan endpoint Apps Script"
                        >
                          <RotateCcw className={`w-3.5 h-3.5 ${isTestingEndpoint ? 'animate-spin' : ''}`} />
                          <span>Uji Ulang Endpoint</span>
                        </button>

                        <button
                          onClick={() => {
                            setShowProgressModal(false);
                            setShowScriptModal(true);
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1.5 cursor-pointer border border-slate-300 transition-colors"
                        >
                          <Code2 className="w-3.5 h-3.5 text-blue-600" />
                          <span>Lihat Kode Script yang Benar</span>
                        </button>

                        <a
                          href={`https://docs.google.com/spreadsheets/d/${SPREADSHEET_CONFIG.spreadsheetId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 flex items-center gap-1 ml-auto"
                        >
                          <span>Buka Google Sheet</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <a
                href={`https://docs.google.com/spreadsheets/d/${SPREADSHEET_CONFIG.spreadsheetId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                <span>Buka Google Sheet</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                onClick={() => setShowProgressModal(false)}
                disabled={isSyncing || isTestingEndpoint}
                className="px-4 py-1.5 rounded-lg font-bold text-xs bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Petunjuk Kode Google Apps Script */}
      {showScriptModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Kode Google Apps Script (Sheet: 'STOCK LIST')
                  </h3>
                  <p className="text-xs text-slate-500">
                    ID Spreadsheet: {SPREADSHEET_CONFIG.spreadsheetId}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowScriptModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-600">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-1.5 text-amber-950">
                <p className="font-bold text-amber-900 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  Catatan Error Apps Script Terbaru:
                </p>
                <p className="text-[11px] leading-relaxed">
                  Pada URL Apps Script yang Anda kirimkan, server Google melaporkan error:{' '}
                  <code className="bg-red-100 text-red-700 px-1 py-0.5 rounded font-mono font-semibold">
                    SyntaxError: Identifier 'SPREADSHEET_ID' has already been declared (file: Update)
                  </code>
                  .
                </p>
                <p className="text-[11px] leading-relaxed text-amber-900">
                  <strong>Penyebab:</strong> Di editor Google Apps Script Anda terdapat lebih dari 1 file (misalnya file <code>Update.gs</code> dan <code>Code.gs</code>) yang sama-sama mendeklarasikan variabel <code>SPREADSHEET_ID</code>. Di Google Apps Script, semua file saling berbagi namespace global.
                </p>
                <p className="text-[11px] leading-relaxed font-medium text-emerald-800">
                  💡 <strong>Solusi:</strong> Hapus file duplikat (seperti file <code>Update.gs</code> lama) di editor Apps Script, atau ganti isi file dengan kode tunggal di bawah ini, lalu klik <strong>Deploy &gt; Manage deployments &gt; Edit &gt; New version &gt; Deploy</strong>!
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">
                    Salin Kode Lengkap Ini ke Extensions &gt; Apps Script:
                  </span>
                  <button
                    onClick={handleCopyCode}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors cursor-pointer"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Kode</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-[11px] font-mono overflow-x-auto max-h-64 leading-relaxed">
                  {APPS_SCRIPT_FULL_CODE}
                </pre>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-950 text-[11px] space-y-1">
                <span className="font-bold">Langkah Deploy Ulang di Google Apps Script:</span>
                <ol className="list-decimal list-inside space-y-0.5 text-amber-900">
                  <li>Buka Google Sheet &gt; menu <strong>Extensions &gt; Apps Script</strong>.</li>
                  <li>Tempelkan kode di atas, lalu klik <strong>Save</strong> (ikon disket).</li>
                  <li>Klik tombol biru <strong>Deploy &gt; Manage deployments</strong>.</li>
                  <li>
                    Klik ikon <strong>Pensil (Edit)</strong>, lalu pada kolom <strong>Version</strong>{' '}
                    pilih <strong>New version</strong>.
                  </li>
                  <li>
                    Pastikan <i>Who has access</i> adalah <strong>Anyone</strong>, lalu klik{' '}
                    <strong>Deploy</strong>.
                  </li>
                </ol>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <button
                onClick={() => {
                  setShowScriptModal(false);
                  handleTestEndpoint();
                }}
                className="px-3.5 py-1.5 rounded-lg font-bold text-xs bg-purple-600 hover:bg-purple-700 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Uji Endpoint Apps Script Sekarang</span>
              </button>
              <button
                onClick={() => setShowScriptModal(false)}
                className="px-4 py-1.5 rounded-lg font-bold text-xs bg-slate-200 hover:bg-slate-300 text-slate-800 transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
