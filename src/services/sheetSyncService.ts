import { TARGET_FOLDERS, SPREADSHEET_CONFIG, APPS_SCRIPT_SYNC_URL } from '../config/driveConfig';

export type DiagnosticCategory =
  | 'KREDENSIAL_AKSES'
  | 'STRUKTUR_SHEET'
  | 'KODE_APPS_SCRIPT'
  | 'ENDPOINT_URL'
  | 'BERHASIL'
  | 'UNKNOWN';

export interface AppsScriptDiagnostic {
  success: boolean;
  httpStatus: number;
  category: DiagnosticCategory;
  categoryLabel: string;
  title: string;
  detail: string;
  rawResponse?: string;
  suggestedFix: string[];
  responseTimeMs?: number;
  url: string;
  timestamp: string;
  parsedJson?: any;
}

export interface SyncDriveResult {
  success: boolean;
  mode: 'all' | 'story' | 'aio';
  sheetName: string;
  totalRows: number;
  storyMatches: number;
  aioMatches: number;
  totalStoryFiles: number;
  totalAioFiles: number;
  message: string;
  error?: string;
  appsScriptNotified: boolean;
  appsScriptDiagnostic?: AppsScriptDiagnostic;
  errorDiagnostic?: {
    category: DiagnosticCategory;
    categoryLabel: string;
    title: string;
    detail: string;
    rawError?: string;
    suggestedFix: string[];
  };
}

/**
 * Panggil endpoint Google Apps Script melalui proxy server untuk mendapatkan
 * log diagnostik lengkap yang menganalisis apakah error berasal dari
 * Kredensial, Struktur Sheet, atau Kode Apps Script.
 */
export async function callAppsScriptWithDiagnostics(
  action: 'all' | 'story' | 'aio' = 'all',
  sheet: string = SPREADSHEET_CONFIG.sheetName,
  customUrl?: string
): Promise<AppsScriptDiagnostic> {
  const url = customUrl || APPS_SCRIPT_SYNC_URL;
  try {
    const response = await fetch('/api/sync/call-appsscript', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        action,
        sheet,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        success: false,
        httpStatus: response.status,
        category: 'ENDPOINT_URL',
        categoryLabel: 'Gagal Menghubungi Proxy Server',
        title: 'Proxy Server Mengembalikan Error',
        detail: err?.detail || `HTTP ${response.status}: Tidak dapat menghubungi endpoint Apps Script.`,
        suggestedFix: [
          'Periksa koneksi jaringan dan apakah server berjalan dengan benar.',
          'Pastikan URL Web App Apps Script valid.',
        ],
        url,
        timestamp: new Date().toISOString(),
      };
    }

    const data: AppsScriptDiagnostic = await response.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      httpStatus: 0,
      category: 'ENDPOINT_URL',
      categoryLabel: 'Koneksi Terputus / Jaringan',
      title: 'Tidak Dapat Terhubung ke Endpoint',
      detail: err?.message || 'Gagal mengirim permintaan ke Apps Script.',
      suggestedFix: [
        'Pastikan koneksi internet stabil.',
        'Coba refresh halaman atau ulangi proses sinkronisasi.',
      ],
      url,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Menganalisis error langsung dari Google Sheets API / Drive API
 * untuk membedakan antara masalah Kredensial vs Struktur Sheet.
 */
export function diagnoseDirectSyncError(err: unknown): {
  category: DiagnosticCategory;
  categoryLabel: string;
  title: string;
  detail: string;
  rawError?: string;
  suggestedFix: string[];
} {
  const msg = err instanceof Error ? err.message : String(err || '');
  const lower = msg.toLowerCase();

  if (
    lower.includes('insufficient authentication scopes') ||
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('unauthorized') ||
    lower.includes('permission') ||
    lower.includes('token')
  ) {
    return {
      category: 'KREDENSIAL_AKSES',
      categoryLabel: 'Masalah Kredensial / Otorisasi Google',
      title: 'Izin Akun Google Belum Lengkap / Kedaluwarsa',
      detail:
        msg ||
        'Token akun Google Anda tidak memiliki izin akses ke Google Sheets atau Google Drive.',
      rawError: msg,
      suggestedFix: [
        'Klik tombol "Keluar" (Sign Out) di pojok kanan atas aplikasi.',
        'Login kembali menggunakan akun Google Anda.',
        'Saat halaman persetujuan izin Google muncul, pastikan Anda MENCENTANG semua kotak izin (Drive & Sheets).',
        'Pastikan akun Google Anda berstatus Editor pada spreadsheet 1mrD9sQK_Sffa1X1fzlCDmaJXs1Yj2q-XTNdi2sRGPos.',
      ],
    };
  }

  if (
    lower.includes('unable to parse range') ||
    lower.includes('tidak ditemukan') ||
    lower.includes('sheet') ||
    lower.includes('baris data') ||
    lower.includes('404') ||
    lower.includes('not found') ||
    lower.includes('kolom')
  ) {
    return {
      category: 'STRUKTUR_SHEET',
      categoryLabel: 'Masalah Struktur Sheet / Tab',
      title: 'Struktur Tab Sheet atau Spreadsheet Tidak Cocok',
      detail:
        msg ||
        `Tab sheet '${SPREADSHEET_CONFIG.sheetName}' tidak ditemukan atau tidak memiliki baris SKU.`,
      rawError: msg,
      suggestedFix: [
        `Buka spreadsheet target: https://docs.google.com/spreadsheets/d/${SPREADSHEET_CONFIG.spreadsheetId}`,
        `Pastikan ada tab yang dinamai persis "${SPREADSHEET_CONFIG.sheetName}" (perhatikan spasi dan huruf besar).`,
        'Pastikan Kolom A baris ke-1 adalah Judul Kolom, dan baris ke-2 dst berisi kode SKU (misal: 19163, 07945).',
        'Pastikan spreadsheet memiliki minimal kolom A sampai Y (25 kolom).',
      ],
    };
  }

  return {
    category: 'UNKNOWN',
    categoryLabel: 'Kendala Sinkronisasi',
    title: 'Gagal Menjalankan Sinkronisasi',
    detail: msg || 'Terjadi kesalahan yang tidak terduga saat menyinkronkan data.',
    rawError: msg,
    suggestedFix: [
      'Periksa kembali koneksi internet Anda.',
      'Coba ulangi sinkronisasi dalam beberapa saat.',
    ],
  };
}

interface SimpleFileInfo {
  id: string;
  name: string;
  createdTime?: string;
}

/**
 * Format timestamp into Indonesian format: dd-MM-yyyy HH:mm:ss
 * E.g. "25-06-2026 14:41:51"
 */
export function formatSyncTimestamp(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}

/**
 * Normalizes SKU and base filename for foolproof matching:
 * Handles any extension (.png, .jpg, etc.), leading zeros, trimmed spaces, lowercase, etc.
 */
function cleanSkuKey(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  let str = String(raw).trim().toLowerCase();
  const lastDot = str.lastIndexOf('.');
  if (lastDot > 0 && lastDot >= str.length - 5) {
    str = str.substring(0, lastDot);
  }
  return str.trim();
}

/**
 * Fetches all files from a Google Drive folder using pagination (up to thousands of files).
 */
export async function fetchAllDriveFiles(
  folderId: string,
  token: string
): Promise<SimpleFileInfo[]> {
  const allFiles: SimpleFileInfo[] = [];
  let pageToken: string | null = null;

  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `'${folderId}' in parents and trashed = false`);
    url.searchParams.set('fields', 'nextPageToken, files(id, name, createdTime)');
    url.searchParams.set('pageSize', '1000');
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set('includeItemsFromAllDrives', 'true');
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Gagal mengambil file folder Drive (${response.status})`);
    }

    const data = await response.json();
    if (data.files && Array.isArray(data.files)) {
      allFiles.push(...data.files);
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return allFiles;
}

/**
 * DIRECT SYNC to Google Sheet 'STOCK LIST' (Spreadsheet ID: 1mrD9sQK_Sffa1X1fzlCDmaJXs1Yj2q-XTNdi2sRGPos):
 * 1. Reads Column A (SKU) from sheet 'STOCK LIST'.
 * 2. Matches with files in Story Folder and Foto Produk (AIO) Folder.
 * 3. Updates Columns V & W (Story ID & Date) and Columns X & Y (AIO ID & Date).
 * 4. Also notifies Apps Script Web App.
 */
export async function executeDirectSpreadsheetSync(
  token: string,
  mode: 'all' | 'story' | 'aio' = 'all',
  onProgress?: (status: string, percent: number) => void
): Promise<SyncDriveResult> {
  const spreadsheetId = SPREADSHEET_CONFIG.spreadsheetId;
  const sheetName = SPREADSHEET_CONFIG.sheetName;

  if (onProgress) onProgress('Menghubungkan ke Google Drive...', 10);

  // 1. Fetch files from Drive folders
  let storyFiles: SimpleFileInfo[] = [];
  let aioFiles: SimpleFileInfo[] = [];

  const storyFileMap: Record<string, SimpleFileInfo> = {};
  const aioFileMap: Record<string, SimpleFileInfo> = {};

  if (mode === 'story' || mode === 'all') {
    if (onProgress) onProgress('Memindai folder Gambar Story...', 20);
    storyFiles = await fetchAllDriveFiles(TARGET_FOLDERS.story.folderId, token);
    storyFiles.forEach((file) => {
      const key = cleanSkuKey(file.name);
      if (key) {
        storyFileMap[key] = file;
        // Also map padded 5-digit number if numeric
        const num = parseInt(key, 10);
        if (!isNaN(num)) {
          storyFileMap[num.toString()] = file;
          storyFileMap[num.toString().padStart(5, '0')] = file;
        }
      }
    });
  }

  if (mode === 'aio' || mode === 'all') {
    if (onProgress) onProgress('Memindai folder Foto Produk (AIO)...', 35);
    aioFiles = await fetchAllDriveFiles(TARGET_FOLDERS.aio.folderId, token);
    aioFiles.forEach((file) => {
      const key = cleanSkuKey(file.name);
      if (key) {
        aioFileMap[key] = file;
        const num = parseInt(key, 10);
        if (!isNaN(num)) {
          aioFileMap[num.toString()] = file;
          aioFileMap[num.toString().padStart(5, '0')] = file;
        }
      }
    });
  }

  // 2. Fetch current rows from Google Spreadsheet (Column A:A, and current V:Y to preserve existing data)
  if (onProgress) onProgress(`Membaca data Sheet '${sheetName}'...`, 50);

  const getSheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(
    sheetName
  )}'!A:Y`;

  const getRes = await fetch(getSheetUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!getRes.ok) {
    const errObj = await getRes.json().catch(() => ({}));
    throw new Error(
      errObj?.error?.message ||
        `Gagal membaca Google Sheet '${sheetName}' (${getRes.status}). Pastikan token login memiliki akses ke spreadsheet.`
    );
  }

  const sheetData = await getRes.json();
  const rows: unknown[][] = sheetData.values || [];

  if (rows.length <= 1) {
    throw new Error(`Sheet '${sheetName}' tidak memiliki baris data produk untuk disinkronkan.`);
  }

  const totalDataRows = rows.length - 1; // excluding header
  const storyUpdates: string[][] = [];
  const aioUpdates: string[][] = [];

  let storyMatchCount = 0;
  let aioMatchCount = 0;

  if (onProgress) onProgress('Mencocokkan SKU dengan ID File Drive...', 70);

  // Loop starting from row index 1 (Row 2 in sheet)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rawSku = row[0];
    const skuKey = cleanSkuKey(rawSku);

    // Current existing values in sheet
    // Column V (index 21), Column W (index 22)
    const existingStoryId = (row[21] as string) || '';
    const existingStoryDate = (row[22] as string) || '';

    // Column X (index 23), Column Y (index 24)
    const existingAioId = (row[23] as string) || '';
    const existingAioDate = (row[24] as string) || '';

    // Story match
    if (mode === 'story' || mode === 'all') {
      const num = parseInt(skuKey, 10);
      const match = skuKey
        ? (storyFileMap[skuKey] ||
            (!isNaN(num)
              ? storyFileMap[num.toString()] || storyFileMap[num.toString().padStart(5, '0')]
              : null))
        : null;

      if (match) {
        storyUpdates.push([match.id, formatSyncTimestamp(match.createdTime)]);
        storyMatchCount++;
      } else {
        // Preserve existing if present, otherwise blank
        storyUpdates.push([existingStoryId, existingStoryDate]);
      }
    }

    // AIO / Foto Produk match
    if (mode === 'aio' || mode === 'all') {
      const num = parseInt(skuKey, 10);
      const match = skuKey
        ? (aioFileMap[skuKey] ||
            (!isNaN(num)
              ? aioFileMap[num.toString()] || aioFileMap[num.toString().padStart(5, '0')]
              : null))
        : null;

      if (match) {
        aioUpdates.push([match.id, formatSyncTimestamp(match.createdTime)]);
        aioMatchCount++;
      } else {
        // Preserve existing if present, otherwise blank
        aioUpdates.push([existingAioId, existingAioDate]);
      }
    }
  }

  // 3. Write updates directly to Google Sheets API
  const lastRowNumber = rows.length; // e.g., row 2 to lastRowNumber

  if (mode === 'story' || mode === 'all') {
    if (onProgress) onProgress(`Memperbarui Kolom V & W (Story) di Sheet '${sheetName}'...`, 80);
    const updateStoryUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(
      sheetName
    )}'!V2:W${lastRowNumber}?valueInputOption=USER_ENTERED`;

    const putStoryRes = await fetch(updateStoryUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: storyUpdates,
      }),
    });

    if (!putStoryRes.ok) {
      const err = await putStoryRes.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Gagal menulis data Kolom V & W (${putStoryRes.status})`);
    }
  }

  if (mode === 'aio' || mode === 'all') {
    if (onProgress) onProgress(`Memperbarui Kolom X & Y (Foto Produk) di Sheet '${sheetName}'...`, 90);
    const updateAioUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(
      sheetName
    )}'!X2:Y${lastRowNumber}?valueInputOption=USER_ENTERED`;

    const putAioRes = await fetch(updateAioUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: aioUpdates,
      }),
    });

    if (!putAioRes.ok) {
      const err = await putAioRes.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Gagal menulis data Kolom X & Y (${putAioRes.status})`);
    }
  }

  // 4. Also trigger and diagnose Google Apps Script Web App endpoint
  let appsScriptNotified = false;
  let appsScriptDiagnostic: AppsScriptDiagnostic | undefined;
  try {
    if (onProgress) onProgress('Memverifikasi endpoint Apps Script...', 95);
    appsScriptDiagnostic = await callAppsScriptWithDiagnostics(mode, sheetName);
    appsScriptNotified = appsScriptDiagnostic.success;
  } catch (err) {
    console.warn('Apps Script diagnostic ping warning:', err);
  }

  if (onProgress) onProgress('Sinkronisasi selesai!', 100);

  return {
    success: true,
    mode,
    sheetName,
    totalRows: totalDataRows,
    storyMatches: storyMatchCount,
    aioMatches: aioMatchCount,
    totalStoryFiles: storyFiles.length,
    totalAioFiles: aioFiles.length,
    appsScriptNotified,
    appsScriptDiagnostic,
    message: `Berhasil sinkron ke Sheet '${sheetName}' (${spreadsheetId})!`,
  };
}
