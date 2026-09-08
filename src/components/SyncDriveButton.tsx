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
} from 'lucide-react';
import { APPS_SCRIPT_SYNC_URL } from '../config/driveConfig';
import { FolderCategory } from '../types';

interface SyncDriveButtonProps {
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
 * Target Sheet : "STOCK LIST"
 * Target Kolom:
 *   - Gambar Story : ID di Kolom V (22), Last Update di Kolom W (23)
 *   - Foto Produk  : ID di Kolom X (24), Last Update di Kolom Y (25)
 * SKU diambil dari: Kolom A (Index 0)
 */

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
    var sheetName = (e && e.parameter && e.parameter.sheet) ? e.parameter.sheet : 'STOCK LIST';
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('STOCK LIST') || ss.getActiveSheet();
  var resStory = jalankanLogikaSync(sheet, '1A4MpcBh6t60ys0KVvLjdr5F3J0Im3U_E', 22, 'GAMBAR STORY (Kolom V & W)');
  var resAio = jalankanLogikaSync(sheet, '1xYDYQfYIvFK8AxzfEFchdPg7wv58zfyI', 24, 'FOTO PRODUK (Kolom X & Y)');
  
  var reportMessage = '📊 LAPORAN SINKRONISASI LENGKAP:\\n\\n' +
                      '• Tab Sheet: "' + sheet.getName() + '"\\n' +
                      '• Gambar Story: ' + resStory.matchCount + ' baris disinkron (dari ' + resStory.totalFiles + ' file Drive)\\n' +
                      '• Foto Produk: ' + resAio.matchCount + ' baris disinkron (dari ' + resAio.totalFiles + ' file Drive)';
  SpreadsheetApp.getUi().alert(reportMessage);
}

/**
 * Pembungkus laporan UI Alert (Bila diklik dari dalam menu Google Sheet)
 */
function prosesSinkronisasiDrive(folderId, startCol, namaLaporan) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('STOCK LIST') || ss.getActiveSheet();
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
 * Bekerja tanpa popup alert sehingga aman dipanggil oleh Web App maupun menu Sheet!
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
  onSyncCompleted,
  onShowToast,
  activeCategory = 'aio',
  variant = 'header',
  className = '',
}) => {
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncStatus, setLastSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const [showScriptModal, setShowScriptModal] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
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

  const handleTriggerSync = async (
    targetAction: 'all' | 'aio' | 'story' = 'all',
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();
    setDropdownOpen(false);
    if (isSyncing) return;

    setIsSyncing(true);
    setLastSyncStatus('idle');

    let actionLabel = 'Semua (Foto Produk & Story)';
    if (targetAction === 'aio') actionLabel = 'Foto Produk (Kolom X & Y)';
    if (targetAction === 'story') actionLabel = 'Gambar Story (Kolom V & W)';

    try {
      const syncUrl = `${APPS_SCRIPT_SYNC_URL}?action=${targetAction}&sheet=STOCK%20LIST`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      await fetch(syncUrl, {
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
          'Sync Data Drive Berhasil!',
          `Permintaan sinkronisasi [${actionLabel}] untuk sheet 'STOCK LIST' telah dikirim ke Google Apps Script.`
        );
      }

      if (onSyncCompleted) {
        onSyncCompleted();
      }
    } catch (err: unknown) {
      console.warn('Apps Script sync response:', err);
      setLastSyncStatus('error');
      setTimeout(() => setLastSyncStatus('idle'), 4000);

      if (onShowToast) {
        onShowToast(
          'error',
          'Kendala Sinkronisasi Apps Script',
          'Periksa koneksi atau pastikan Web App Apps Script dideploy sebagai "Anyone".'
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
              href={APPS_SCRIPT_SYNC_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 border-l border-blue-100 rounded-r-lg transition-colors"
              title="Buka Web App Apps Script di tab baru"
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

            {/* External Link */}
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
        )}

        {/* Dropdown Menu */}
        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-1.5 w-72 bg-white rounded-xl shadow-xl border border-slate-200 z-50 py-1.5 text-xs animate-in fade-in-50 zoom-in-95">
            <div className="px-3 py-1.5 border-b border-slate-100 font-semibold text-slate-700 flex items-center justify-between">
              <span>Pilihan Sync ke Sheet 'STOCK LIST'</span>
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            </div>

            <button
              onClick={() => handleTriggerSync('all')}
              disabled={isSyncing}
              className="w-full px-3 py-2 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-start gap-2 transition-colors cursor-pointer"
            >
              <Layers className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Sync Keduanya (Semua Kolom)</div>
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
                <div className="font-bold">Sync Gambar Story Saja</div>
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
                <div className="font-bold">Sync Foto Produk Saja</div>
                <div className="text-[10px] text-slate-500">ID di Kolom X (24), Date di Kolom Y (25)</div>
              </div>
            </button>

            <div className="border-t border-slate-100 my-1"></div>

            <button
              onClick={() => {
                setDropdownOpen(false);
                setShowScriptModal(true);
              }}
              className="w-full px-3 py-2 text-left text-blue-600 hover:bg-blue-50 flex items-center gap-2 font-medium cursor-pointer"
            >
              <Code2 className="w-4 h-4" />
              <span>Lihat Kode Script Google Sheet</span>
            </button>
          </div>
        )}
      </div>

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
                    Bekerja untuk tombol web app dan menu Spreadsheet
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
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 space-y-1.5 text-blue-950">
                <p className="font-bold text-blue-900 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-blue-600" />
                  Mengapa kode perlu disesuaikan sedikit?
                </p>
                <p className="text-[11px] leading-relaxed">
                  Kode asli Anda menggunakan <code className="bg-blue-100 px-1 py-0.5 rounded">SpreadsheetApp.getUi()</code>. 
                  Fungsi popup UI tersebut hanya bisa berjalan jika diklik langsung dari dalam Sheet, 
                  dan akan error jika dipanggil lewat web browser luar (<code className="bg-blue-100 px-1 py-0.5 rounded">/exec</code>).
                  Kode di bawah ini sudah diperbarui dengan fungsi <code className="bg-blue-100 px-1 py-0.5 rounded">doGet(e)</code> 
                  agar bisa dipicu oleh tombol web ini <strong>DAN</strong> tetap memiliki menu di Google Sheet!
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
                <span className="font-bold">Langkah Deploy di Google Apps Script:</span>
                <ol className="list-decimal list-inside space-y-0.5 text-amber-900">
                  <li>Buka Google Sheet Anda &gt; menu <strong>Extensions &gt; Apps Script</strong>.</li>
                  <li>Hapus kode lama, lalu tempelkan kode di atas &gt; klik <strong>Save</strong> (ikon disket).</li>
                  <li>Klik tombol biru <strong>Deploy &gt; Manage deployments</strong> (atau <i>New deployment</i>).</li>
                  <li>Pilih <strong>Web app</strong>, ubah <i>Who has access</i> ke <strong>Anyone</strong>, lalu klik <strong>Deploy</strong>.</li>
                </ol>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Target Sheet: <strong>STOCK LIST</strong> (Kolom A: SKU, Kolom V-W &amp; X-Y)
              </span>
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
