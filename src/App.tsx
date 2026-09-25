/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User } from 'firebase/auth';
import {
  FolderCategory,
  UploadQueueItem,
  DriveFileInfo,
  StockProduct,
} from './types';
import {
  TARGET_FOLDERS,
  validatePngFileName,
  getImageDimensions,
  analyzeImageRatio,
  detectCategoryFromRatio,
} from './config/driveConfig';
import {
  initAuth,
  googleSignIn,
  getAccessToken,
  logout,
} from './services/auth';
import {
  checkFileExistsInFolder,
  uploadPngToDrive,
  replaceExistingFileInDrive,
  listFolderFiles,
  deleteDriveFile,
} from './services/driveService';
import { executeDirectSpreadsheetSync } from './services/sheetSyncService';
import {
  fetchStockProducts,
  getCachedSkuMap,
  getCachedStockCatalog,
  lookupProductName,
} from './services/productCatalogService';
import { Header } from './components/Header';
import { UploadDropzone } from './components/UploadDropzone';
import { UploadQueueList } from './components/UploadQueueList';
import { DriveFolderBrowser } from './components/DriveFolderBrowser';
import { ReplaceOrCancelModal } from './components/ReplaceOrCancelModal';
import { MissingImagesMissionTracker } from './components/MissingImagesMissionTracker';
import {
  AlertCircle,
  CheckCircle2,
  HardDrive,
  Info,
  ShieldAlert,
  Sparkles,
  ExternalLink,
  Target,
  FileSpreadsheet,
  Upload,
} from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Active view tab for Drive Folder Browser ('aio' | 'story')
  const [activeBrowserFolder, setActiveBrowserFolder] = useState<FolderCategory>('aio');

  // Unified upload queue where each item has its own auto-detected category
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [queueFilter, setQueueFilter] = useState<'all' | FolderCategory>('all');
  const [isUploadingAny, setIsUploadingAny] = useState<boolean>(false);

  const [isSyncingSheet, setIsSyncingSheet] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Drive folder cache files
  const [folderFiles, setFolderFiles] = useState<Record<FolderCategory, DriveFileInfo[]>>({
    aio: [],
    story: [],
  });
  const [isLoadingFolder, setIsLoadingFolder] = useState<boolean>(false);

  // Modal confirmation for overwriting existing file
  const [duplicateModalItem, setDuplicateModalItem] = useState<UploadQueueItem | null>(null);
  const [isReplacingFile, setIsReplacingFile] = useState<boolean>(false);

  // Main View Navigation: 'upload_browser' or 'missions'
  const [activeMainTab, setActiveMainTab] = useState<'upload_browser' | 'missions'>('upload_browser');

  // Stock Catalog State (from Sheet 'STOCK LIST' - Column 1 SKU & Column 3 Product Name)
  const [stockProducts, setStockProducts] = useState<StockProduct[]>(() => {
    return getCachedStockCatalog()?.products || [];
  });
  const [skuMap, setSkuMap] = useState<Record<string, string>>(() => {
    return getCachedSkuMap();
  });
  const [isLoadingStock, setIsLoadingStock] = useState<boolean>(false);
  const [stockLastUpdated, setStockLastUpdated] = useState<string | undefined>(() => {
    return getCachedStockCatalog()?.lastUpdated;
  });

  // Count of SKUs missing at least one image (1:1 or 4:5)
  const missingImagesCount = useMemo(() => {
    return stockProducts.filter((p) => !p.hasAio || !p.hasStory).length;
  }, [stockProducts]);

  // Alert toast notification
  const [toastNotification, setToastNotification] = useState<{
    type: 'warning' | 'success' | 'info' | 'error';
    title: string;
    message: string;
  } | null>(null);

  // Show auto-dismiss toast
  const showToast = useCallback(
    (type: 'warning' | 'success' | 'info' | 'error', title: string, message: string) => {
      setToastNotification({ type, title, message });
      setTimeout(() => {
        setToastNotification((current) => (current?.title === title ? null : current));
      }, 6000);
    },
    []
  );

  // 1. Initialize Auth on startup
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, currentToken) => {
        setUser(currentUser);
        setToken(currentToken);
        setAuthError(null);
      },
      () => {
        setUser(null);
        setToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // 2. Fetch files in folder when auth token or folder changes
  const fetchFolderContent = useCallback(
    async (category: FolderCategory, activeToken?: string | null) => {
      const authToken = activeToken || token;
      if (!authToken) return;

      setIsLoadingFolder(true);
      try {
        const folderId = TARGET_FOLDERS[category].folderId;
        const files = await listFolderFiles(folderId, authToken);
        setFolderFiles((prev) => ({
          ...prev,
          [category]: files,
        }));
      } catch (err: unknown) {
        console.warn(`Could not load files for ${category}:`, err);
      } finally {
        setIsLoadingFolder(false);
      }
    },
    [token]
  );

  // 3. Load product catalog & mission tracking from Sheet 'STOCK LIST'
  const loadStockCatalog = useCallback(
    async (activeToken?: string | null, forceRefresh = false) => {
      const authToken = activeToken || token;
      setIsLoadingStock(true);
      try {
        const catalog = await fetchStockProducts(authToken, forceRefresh);
        if (catalog && catalog.products) {
          setStockProducts(catalog.products);
          setSkuMap(catalog.skuMap);
          setStockLastUpdated(catalog.lastUpdated);
        }
      } catch (err: unknown) {
        console.warn('Could not load stock products:', err);
      } finally {
        setIsLoadingStock(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (token) {
      fetchFolderContent('aio', token);
      fetchFolderContent('story', token);
      loadStockCatalog(token);
    } else {
      // Even without token, load from proxy or cache
      loadStockCatalog(null);
    }
  }, [token, fetchFolderContent, loadStockCatalog]);

  // Auth Handlers
  const handleLogin = async () => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        showToast(
          'success',
          'Terhubung ke Google Drive',
          `Berhasil masuk sebagai ${result.user.displayName || result.user.email}`
        );
        fetchFolderContent('aio', result.accessToken);
        fetchFolderContent('story', result.accessToken);

        // Re-verify any pending files in queue with fresh Google Drive credentials
        setQueue((prevQueue) => {
          if (prevQueue.length > 0) {
            Promise.all(
              prevQueue.map((item) => verifyQueueItem(item, result.accessToken))
            ).then((verifiedList) => {
              setQueue(verifiedList);
              const foundDup = verifiedList.find((v) => v.status === 'duplicate_found');
              if (foundDup) {
                setDuplicateModalItem(foundDup);
                showToast(
                  'warning',
                  'Duplikat Ditemukan!',
                  `File ${foundDup.file.name} sudah ada di folder Google Drive ${TARGET_FOLDERS[foundDup.category].name}.`
                );
              }
            });
          }
          return prevQueue;
        });
      }
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      const msg = errObj.message || 'Gagal masuk dengan Google';
      setAuthError(msg);
      showToast('error', 'Gagal Masuk', msg);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setToken(null);
    showToast('info', 'Keluar Akun', 'Anda telah keluar dari Google Drive.');
  };

  // Re-verify file against rules, aspect ratio, and check duplicate in target drive folder
  const verifyQueueItem = useCallback(
    async (
      item: UploadQueueItem,
      activeToken: string | null
    ): Promise<UploadQueueItem> => {
      const targetCategory = item.category || 'aio';

      // 1. Analyze image dimensions & aspect ratio
      let ratioInfo = item.ratioInfo;
      if (!ratioInfo || ratioInfo.width === 0) {
        const dims = await getImageDimensions(item.file);
        ratioInfo = analyzeImageRatio(dims.width, dims.height, targetCategory);
      } else {
        ratioInfo = analyzeImageRatio(ratioInfo.width, ratioInfo.height, targetCategory);
      }

      // 2. Format and 5-digit filename validation
      const validation = validatePngFileName(item.file.name);
      if (!validation.isValid) {
        return {
          ...item,
          ratioInfo,
          status: 'invalid_format',
          statusMessage: validation.message,
          existingFile: undefined,
        };
      }

      // 3. Check duplicate in Google Drive if token available
      if (!activeToken) {
        return {
          ...item,
          ratioInfo,
          status: 'ready',
          statusMessage: 'Login ke Google untuk memeriksa duplikasi di Drive secara langsung',
        };
      }

      const folderId = TARGET_FOLDERS[targetCategory].folderId;
      try {
        const existing = await checkFileExistsInFolder(folderId, item.file.name, activeToken);
        if (existing) {
          const dupCount = existing.duplicateCount && existing.duplicateCount > 1
            ? ` (${existing.duplicateCount} file kembar di Drive)`
            : '';
          return {
            ...item,
            ratioInfo,
            status: 'duplicate_found',
            statusMessage: `File "${item.file.name}" sudah ada di folder ${TARGET_FOLDERS[targetCategory].name}${dupCount}`,
            existingFile: existing,
          };
        }

        return {
          ...item,
          ratioInfo,
          status: 'ready',
          statusMessage: undefined,
          existingFile: undefined,
        };
      } catch (err: unknown) {
        console.error('Error checking duplicate:', err);
        return {
          ...item,
          ratioInfo,
          status: 'ready',
          statusMessage: undefined,
        };
      }
    },
    []
  );

  // When files are dropped or selected through the SINGLE smart upload button/dropzone
  const handleFilesSelected = async (newFiles: File[]) => {
    if (newFiles.length === 0) return;

    // Inspect and detect ratio for each file immediately
    const preparedItems: UploadQueueItem[] = await Promise.all(
      newFiles.map(async (file) => {
        const dims = await getImageDimensions(file);
        const { detectedCategory } = detectCategoryFromRatio(dims.width, dims.height);
        const ratioInfo = analyzeImageRatio(dims.width, dims.height, detectedCategory);
        const productName = lookupProductName(file.name, skuMap);

        return {
          id: `${file.name}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          file,
          previewUrl: URL.createObjectURL(file),
          status: 'checking_drive' as const,
          category: detectedCategory,
          ratioInfo,
          uploadProgress: 0,
          productName,
        };
      })
    );

    // Append to unified queue immediately
    setQueue((prev) => [...prev, ...preparedItems]);

    // Check duplicate in Drive asynchronously
    let hasDuplicate = false;
    let firstDuplicateItem: UploadQueueItem | null = null;
    let aioCount = 0;
    let storyCount = 0;

    const verifiedItems = await Promise.all(
      preparedItems.map(async (item) => {
        if (item.category === 'aio') aioCount++;
        else storyCount++;

        const verified = await verifyQueueItem(item, token);
        if (verified.status === 'duplicate_found') {
          hasDuplicate = true;
          if (!firstDuplicateItem) firstDuplicateItem = verified;
        }
        return verified;
      })
    );

    // Update queue items with verified states
    setQueue((prev) =>
      prev.map((item) => {
        const found = verifiedItems.find((v) => v.id === item.id);
        return found || item;
      })
    );

    // Smart notification for automatic classification
    if (aioCount > 0 && storyCount > 0) {
      showToast(
        'info',
        'Auto-Routing Rasio Aktif',
        `${newFiles.length} file dikenali: ${aioCount} gambar AIO (1:1) dan ${storyCount} story (4:5).`
      );
    } else if (aioCount > 0) {
      showToast(
        'info',
        'Auto-Routing AIO (1:1)',
        `${aioCount} file otomatis diarahkan ke Folder Gambar AIO (Rasio 1:1 Persegi).`
      );
    } else if (storyCount > 0) {
      showToast(
        'info',
        'Auto-Routing Story (4:5)',
        `${storyCount} file otomatis diarahkan ke Folder Story Product (Rasio 4:5 Portrait).`
      );
    }

    if (hasDuplicate && firstDuplicateItem) {
      showToast(
        'warning',
        'File Duplikat Terdeteksi!',
        `File ${(firstDuplicateItem as UploadQueueItem).file.name} sudah ada di folder Google Drive ${
          TARGET_FOLDERS[(firstDuplicateItem as UploadQueueItem).category].name
        }.`
      );
      setDuplicateModalItem(firstDuplicateItem);
    }
  };

  // Toggle category between 'aio' and 'story'
  const handleToggleCategory = async (itemId: string) => {
    const item = queue.find((i) => i.id === itemId);
    if (!item) return;

    const newCategory: FolderCategory = item.category === 'aio' ? 'story' : 'aio';
    const updatedItem: UploadQueueItem = {
      ...item,
      category: newCategory,
      status: 'checking_drive',
      statusMessage: undefined,
    };

    setQueue((prev) => prev.map((i) => (i.id === itemId ? updatedItem : i)));

    const verified = await verifyQueueItem(updatedItem, token);
    setQueue((prev) => prev.map((i) => (i.id === itemId ? verified : i)));

    if (verified.status === 'duplicate_found') {
      setDuplicateModalItem(verified);
    }

    showToast(
      'info',
      'Target Folder Diubah',
      `File ${item.file.name} kini ditargetkan ke ${TARGET_FOLDERS[newCategory].name}.`
    );
  };

  // Remove single item from queue
  const handleRemoveItem = (id: string) => {
    setQueue((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  // Clear completed items from queue
  const handleClearCompleted = () => {
    setQueue((prev) => {
      prev.forEach((item) => {
        if (item.status === 'success' && item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
      return prev.filter((item) => item.status !== 'success');
    });
  };

  // Clear all items from queue
  const handleClearAll = () => {
    queue.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    setQueue([]);
  };

  // Inline rename item in queue
  const handleRenameItem = async (id: string, newFileName: string) => {
    const item = queue.find((i) => i.id === id);
    if (!item) return;

    const renamedFile = new File([item.file], newFileName, { type: item.file.type || 'image/png' });
    const updatedItem: UploadQueueItem = {
      ...item,
      file: renamedFile,
      status: 'checking_drive',
      statusMessage: undefined,
    };

    setQueue((prev) => prev.map((i) => (i.id === id ? updatedItem : i)));

    const verified = await verifyQueueItem(updatedItem, token);
    setQueue((prev) => prev.map((i) => (i.id === id ? verified : i)));

    if (verified.status === 'duplicate_found') {
      showToast(
        'warning',
        'File Duplikat Terdeteksi',
        `File bernama ${newFileName} sudah pernah di-upload di ${TARGET_FOLDERS[item.category].name}.`
      );
      setDuplicateModalItem(verified);
    }
  };

  // Single Upload execution with token reuse and duplicate handling options
  const executeUploadItem = async (
    item: UploadQueueItem,
    explicitToken?: string,
    options?: { silentDuplicate?: boolean }
  ): Promise<{ success: boolean; isDuplicate?: boolean; duplicateItem?: UploadQueueItem }> => {
    let currentToken = explicitToken || token;
    if (!currentToken) {
      try {
        const loginRes = await googleSignIn();
        if (!loginRes) return { success: false };
        currentToken = loginRes.accessToken;
        setToken(loginRes.accessToken);
        setUser(loginRes.user);
      } catch (err: unknown) {
        const errObj = err as { message?: string };
        showToast('error', 'Login Diperlukan', errObj.message || 'Silakan masuk ke Google');
        return { success: false };
      }
    }

    const targetCategory = item.category || 'aio';
    const targetFolderId = TARGET_FOLDERS[targetCategory].folderId;

    // Validate 5-digit .png format first
    const validation = validatePngFileName(item.file.name);
    if (!validation.isValid) {
      setQueue((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: 'invalid_format',
                statusMessage: validation.message,
              }
            : i
        )
      );
      if (!options?.silentDuplicate) {
        showToast('error', 'Format Nama File Tidak Sesuai', validation.message || 'Nama file tidak valid.');
      }
      return { success: false };
    }

    // 🛑 REAL-TIME PRE-UPLOAD GUARD:
    // Check if the file ALREADY exists in Google Drive right now before uploading!
    // Prevents duplicate creation even if files were uploaded in another tab or before login.
    try {
      const existing = await checkFileExistsInFolder(targetFolderId, item.file.name, currentToken);
      if (existing) {
        const dupCount = existing.duplicateCount || 1;
        const msg =
          dupCount > 1
            ? `Pencegahan Duplikat: File "${item.file.name}" terdeteksi sudah memiliki ${dupCount} file di folder Google Drive ${TARGET_FOLDERS[targetCategory].name}.`
            : `Pencegahan Duplikat: File "${item.file.name}" sudah ada di folder Google Drive ${TARGET_FOLDERS[targetCategory].name}.`;

        const duplicateItem: UploadQueueItem = {
          ...item,
          status: 'duplicate_found',
          statusMessage: msg,
          existingFile: existing,
        };

        setQueue((prev) => prev.map((i) => (i.id === item.id ? duplicateItem : i)));
        if (!options?.silentDuplicate) {
          setDuplicateModalItem(duplicateItem);
          showToast(
            'warning',
            'Duplikat Terdeteksi!',
            `Upload file ${item.file.name} otomatis dicegah agar tidak membuat file ganda di Google Drive.`
          );
        }
        return { success: false, isDuplicate: true, duplicateItem };
      }
    } catch (checkErr) {
      console.warn('Pre-upload duplicate check error:', checkErr);
    }

    setQueue((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: 'uploading', uploadProgress: 10 } : i))
    );

    try {
      const result = await uploadPngToDrive(
        targetFolderId,
        item.file,
        currentToken,
        item.file.name,
        (progress) => {
          setQueue((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, uploadProgress: progress } : i))
          );
        }
      );

      setQueue((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: 'success',
                uploadProgress: 100,
                uploadedDriveUrl: result.webViewLink,
                uploadedFileId: result.id,
              }
            : i
        )
      );

      // Refresh folder cache
      fetchFolderContent(targetCategory, currentToken);
      return { success: true };
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      setQueue((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: 'error',
                error: errObj.message || 'Gagal mengupload file ke Google Drive',
              }
            : i
        )
      );
      return { success: false };
    }
  };

  // Auto-sync Google Drive file IDs to Google Sheet 'STOCK LIST'
  const triggerAutoSheetSync = async (
    authToken: string,
    mode: 'all' | 'story' | 'aio' = 'all',
    sourceContext: string = 'Unggah'
  ) => {
    setIsSyncingSheet(true);
    setSyncFeedback('Menyinkronkan ID Google Drive ke Google Sheet "STOCK LIST"...');

    try {
      const syncRes = await executeDirectSpreadsheetSync(authToken, mode);
      if (syncRes.success) {
        setSyncFeedback(
          `ID Drive tersinkron otomatis ke Sheet! (${syncRes.storyMatches} Story • ${syncRes.aioMatches} AIO)`
        );
        showToast(
          'success',
          '⚡ Sinkronisasi ID Drive Otomatis Berhasil!',
          `${sourceContext} selesai. ID file Google Drive otomatis diperbarui ke Google Sheet 'STOCK LIST' (Kolom V-W & X-Y). 1 kali kerja tuntas!`
        );

        // Refresh stock catalog and mission status in background
        loadStockCatalog(authToken, true);
      }
    } catch (syncErr: unknown) {
      const errObj = syncErr as { message?: string };
      console.warn('Auto-sync after upload warning:', syncErr);
      setSyncFeedback('Sinkronisasi ID ke Sheet mengalami kendala.');
      showToast(
        'warning',
        'Upload Sukses, Sinkronisasi Sheet Ditunda',
        `File telah tersimpan di Drive. Namun sinkronisasi ID otomatis ke Spreadsheet terhambat: ${
          errObj.message || 'Izin akses Sheets belum aktif'
        }. Anda dapat klik "Sinkronkan ID Drive" kapan saja.`
      );
    } finally {
      setIsSyncingSheet(false);
      // Auto clear banner feedback after 7 seconds
      setTimeout(() => {
        setSyncFeedback((cur) => (cur?.includes('tersinkron otomatis') ? null : cur));
      }, 7000);
    }
  };

  // Upload Single File
  const handleUploadSingle = async (item: UploadQueueItem) => {
    if (isUploadingAny) return;
    setIsUploadingAny(true);
    const res = await executeUploadItem(item);
    setIsUploadingAny(false);

    // Auto-sync single uploaded file to Google Sheet
    if (res.success) {
      if (token) {
        const targetMode = item.category === 'story' ? 'story' : 'aio';
        triggerAutoSheetSync(token, targetMode, `Unggah ${item.file.name}`);
      }

      // Auto-clear item from queue history after successful upload
      setTimeout(() => {
        setQueue((prev) => {
          const target = prev.find((i) => i.id === item.id);
          if (target?.previewUrl) {
            URL.revokeObjectURL(target.previewUrl);
          }
          return prev.filter((i) => i.id !== item.id);
        });
      }, 1200);
    }
  };

  // Upload All Ready and Pending Files in sequence (MASTER SMART UPLOAD)
  const handleUploadAllReady = async () => {
    if (isUploadingAny) return;

    // 1. Gather all uploadable items (ready, error retry, or pending checking)
    const candidateItems = queue.filter(
      (i) => i.status === 'ready' || i.status === 'error' || i.status === 'checking_drive'
    );

    if (candidateItems.length === 0) {
      const duplicateOnly = queue.filter((i) => i.status === 'duplicate_found');
      if (duplicateOnly.length > 0) {
        setDuplicateModalItem(duplicateOnly[0]);
        showToast(
          'warning',
          'File Duplikat Terdeteksi',
          `Terdapat ${duplicateOnly.length} file yang sudah ada di Google Drive. Buka jendela konfirmasi untuk memilih ganti atau batalkan.`
        );
        return;
      }

      if (queue.length === 0) {
        showToast('info', 'Antrean Masih Kosong', 'Silakan pilih gambar terlebih dahulu.');
      } else if (queue.every((i) => i.status === 'success')) {
        showToast('success', 'Semua File Sudah Terunggah', 'Seluruh file dalam antrean sudah tersimpan rapi di Google Drive.');
      } else if (queue.some((i) => i.status === 'invalid_format')) {
        showToast('error', 'Format File Belum Sesuai', 'Pastikan nama file terdiri dari 5 digit angka dengan format .png (contoh: 11321.png).');
      }
      return;
    }

    // 2. Ensure Google Auth Token once before processing the batch
    let activeToken = token;
    if (!activeToken) {
      try {
        const loginRes = await googleSignIn();
        if (!loginRes) return;
        activeToken = loginRes.accessToken;
        setToken(loginRes.accessToken);
        setUser(loginRes.user);
      } catch (err: unknown) {
        const errObj = err as { message?: string };
        showToast('error', 'Login Google Diperlukan', errObj.message || 'Silakan masuk ke akun Google untuk mengunggah.');
        return;
      }
    }

    setIsUploadingAny(true);
    let successCount = 0;
    const detectedDuplicates: UploadQueueItem[] = [];
    const uploadedCategories = new Set<'aio' | 'story'>();

    // 3. Process candidate items sequentially
    for (const item of candidateItems) {
      const res = await executeUploadItem(item, activeToken, { silentDuplicate: true });
      if (res.success) {
        successCount++;
        uploadedCategories.add(item.category || 'aio');
      } else if (res.isDuplicate && res.duplicateItem) {
        detectedDuplicates.push(res.duplicateItem);
      }
    }

    setIsUploadingAny(false);

    // 4. Detailed completion feedback & auto-clear completed history
    if (successCount > 0) {
      showToast(
        'success',
        'Unggah Otomatis Selesai',
        `Berhasil mengunggah ${successCount} dari ${candidateItems.length} file ke Google Drive. Riwayat berhasil diunggah otomatis dibersihkan.`
      );

      // 5. ⚡ AUTOMATIC DRIVE ID TO GOOGLE SHEET SYNC (1 KALI KERJA)
      // Determine sync mode based on uploaded categories
      const syncMode =
        uploadedCategories.has('aio') && uploadedCategories.has('story')
          ? 'all'
          : uploadedCategories.has('story')
          ? 'story'
          : 'aio';

      triggerAutoSheetSync(activeToken, syncMode, `Unggah ${successCount} File`);

      // 6. 🧹 AUTO-CLEAR COMPLETED QUEUE / HISTORY AFTER SUCCESSFUL UPLOAD
      setTimeout(() => {
        setQueue((prev) => {
          prev.forEach((item) => {
            if (item.status === 'success' && item.previewUrl) {
              URL.revokeObjectURL(item.previewUrl);
            }
          });
          return prev.filter((item) => item.status !== 'success');
        });
      }, 1200);
    }

    // If duplicate files were detected during batch upload, show the modal for user resolution
    if (detectedDuplicates.length > 0) {
      setDuplicateModalItem(detectedDuplicates[0]);
      showToast(
        'warning',
        'File Duplikat Ditemukan',
        `${detectedDuplicates.length} file sudah ada di Google Drive. Silakan pilih opsi ganti (replace) atau ubah nama.`
      );
    }
  };

  // Execute Replace when user chooses "Replace Gambar di Drive" on modal
  const handleExecuteReplace = async (item: UploadQueueItem) => {
    let activeToken = token;
    if (!activeToken) {
      activeToken = await getAccessToken();
    }
    if (!activeToken) {
      try {
        const loginRes = await googleSignIn();
        if (loginRes) {
          activeToken = loginRes.accessToken;
          setToken(loginRes.accessToken);
          setUser(loginRes.user);
        }
      } catch (err: unknown) {
        const errObj = err as { message?: string };
        showToast('error', 'Login Diperlukan', errObj.message || 'Silakan hubungkan akun Google terlebih dahulu.');
        return;
      }
    }

    if (!activeToken) {
      showToast('error', 'Login Diperlukan', 'Silakan hubungkan akun Google terlebih dahulu.');
      return;
    }

    setIsReplacingFile(true);
    const targetCategory = item.category || 'aio';
    const targetFolderId = TARGET_FOLDERS[targetCategory].folderId;

    setQueue((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: 'uploading', uploadProgress: 10 } : i))
    );

    try {
      let result;
      if (item.existingFile?.id) {
        result = await replaceExistingFileInDrive(
          item.existingFile.id,
          item.file,
          activeToken,
          targetFolderId,
          (progress) => {
            setQueue((prev) =>
              prev.map((i) => (i.id === item.id ? { ...i, uploadProgress: progress } : i))
            );
          }
        );
      } else {
        result = await uploadPngToDrive(
          targetFolderId,
          item.file,
          activeToken,
          item.file.name,
          (progress) => {
            setQueue((prev) =>
              prev.map((i) => (i.id === item.id ? { ...i, uploadProgress: progress } : i))
            );
          }
        );
      }

      setQueue((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: 'success',
                uploadProgress: 100,
                uploadedDriveUrl: result.webViewLink,
                uploadedFileId: result.id,
              }
            : i
        )
      );

      // Clean up any extra duplicate copies that already exist in Drive
      let cleanedCount = 0;
      const targetFolderConfig = TARGET_FOLDERS[targetCategory];
      if (item.existingFile?.allMatches && item.existingFile.allMatches.length > 1) {
        const extraCopies = item.existingFile.allMatches.filter((m) => m.id !== item.existingFile?.id);
        for (const copy of extraCopies) {
          try {
            await deleteDriveFile(copy.id, activeToken, targetFolderConfig?.folderId);
            cleanedCount++;
          } catch (delErr) {
            console.warn('Could not auto-clean extra duplicate copy:', delErr);
          }
        }
      }

      setDuplicateModalItem(null);
      setIsReplacingFile(false);

      const cleanupNotice = cleanedCount > 0 ? ` (serta ${cleanedCount} file kembar lama telah dibersihkan)` : '';
      showToast(
        'success',
        'Gambar Berhasil Di-Replace!',
        `File ${item.file.name} telah berhasil di-replace di Google Drive folder ${TARGET_FOLDERS[targetCategory].name}${cleanupNotice}.`
      );

      fetchFolderContent(targetCategory, activeToken);

      // Auto-sync replaced file ID to Google Sheet (1 kali kerja)
      triggerAutoSheetSync(activeToken, targetCategory, `Replace ${item.file.name}`);

      // Auto-clear replaced item from queue history after short delay
      setTimeout(() => {
        setQueue((prev) => {
          const target = prev.find((i) => i.id === item.id);
          if (target?.previewUrl) {
            URL.revokeObjectURL(target.previewUrl);
          }
          return prev.filter((i) => i.id !== item.id);
        });
      }, 1200);
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      setIsReplacingFile(false);
      setQueue((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: 'error',
                error: errObj.message || 'Gagal me-replace file di Google Drive',
              }
            : i
        )
      );
      showToast(
        'error',
        'Gagal Replace',
        errObj.message || 'Terjadi kesalahan saat me-replace gambar di Google Drive.'
      );
    }
  };

  // User chooses "Cancel (Batalkan Upload)" on modal
  const handleCancelReplace = (item: UploadQueueItem) => {
    setDuplicateModalItem(null);
    handleRemoveItem(item.id);
    showToast(
      'info',
      'Upload Dibatalkan',
      `File ${item.file.name} dibatalkan dan dihapus dari antrean. File lama di Google Drive tidak diubah.`
    );
  };

  // User changes filename from modal
  const handleRenameFromModal = (item: UploadQueueItem, newName: string) => {
    setDuplicateModalItem(null);
    handleRenameItem(item.id, newName);
  };

  const [isDeletingFromModal, setIsDeletingFromModal] = useState(false);

  // User chooses "Hapus File Lama di Google Drive" directly from modal
  const handleDeleteExistingFromModal = async (item: UploadQueueItem) => {
    let activeToken = token;
    if (!activeToken) {
      activeToken = await getAccessToken();
    }
    if (!activeToken) {
      try {
        const loginRes = await googleSignIn();
        if (loginRes) {
          activeToken = loginRes.accessToken;
          setToken(loginRes.accessToken);
          setUser(loginRes.user);
        }
      } catch (err: unknown) {
        const errObj = err as { message?: string };
        showToast('error', 'Login Diperlukan', errObj.message || 'Silakan masuk dengan akun Google.');
        return;
      }
    }

    if (!activeToken) {
      showToast('error', 'Login Diperlukan', 'Silakan masuk dengan akun Google.');
      return;
    }
    if (!item.existingFile) return;

    setIsDeletingFromModal(true);
    const targetCategory = item.category || 'aio';
    const targetFolderConfig = TARGET_FOLDERS[targetCategory];

    try {
      // 1. Delete the primary existing file from Google Drive
      await deleteDriveFile(item.existingFile.id, activeToken, targetFolderConfig?.folderId);

      // 2. Also delete any extra duplicate copies in Drive if present
      if (item.existingFile.allMatches && item.existingFile.allMatches.length > 1) {
        const extraCopies = item.existingFile.allMatches.filter((m) => m.id !== item.existingFile?.id);
        for (const copy of extraCopies) {
          try {
            await deleteDriveFile(copy.id, activeToken, targetFolderConfig?.folderId);
          } catch (delErr) {
            console.warn('Could not auto-clean extra duplicate copy:', delErr);
          }
        }
      }

      // 3. Mark queue item as ready for upload
      setQueue((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: 'ready',
                existingFile: undefined,
                error: undefined,
                statusMessage: undefined,
              }
            : i
        )
      );

      setDuplicateModalItem(null);
      showToast(
        'success',
        'File Duplikat Berhasil Dihapus dari Drive',
        `File ${item.existingFile.name} telah berhasil dihapus dari Google Drive. File baru kini siap diupload!`
      );

      fetchFolderContent(targetCategory, activeToken);
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      showToast(
        'error',
        'Gagal Menghapus File Lama',
        errObj.message || 'Terjadi kesalahan saat menghapus file lama di Google Drive.'
      );
    } finally {
      setIsDeletingFromModal(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased">
      {/* App Header */}
      <Header
        user={user}
        token={token}
        isLoading={isAuthLoading}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onSyncCompleted={() => {
          fetchFolderContent('aio', token);
          fetchFolderContent('story', token);
        }}
        onShowToast={showToast}
        activeCategory={activeBrowserFolder}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Floating Toast Notification Banner */}
        {toastNotification && (
          <div
            className={`p-4 rounded-xl border shadow-md flex items-start justify-between gap-3 animate-in fade-in slide-in-from-top-2 ${
              toastNotification.type === 'warning'
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : toastNotification.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : toastNotification.type === 'error'
                ? 'bg-red-50 border-red-300 text-red-900'
                : 'bg-blue-50 border-blue-300 text-blue-900'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {toastNotification.type === 'warning' ? (
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              ) : toastNotification.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              )}
              <div>
                <h4 className="font-semibold text-sm">{toastNotification.title}</h4>
                <p className="text-xs mt-0.5 opacity-90">{toastNotification.message}</p>
              </div>
            </div>
            <button
              onClick={() => setToastNotification(null)}
              className="text-xs font-semibold underline opacity-70 hover:opacity-100"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Not Logged In Warning Callout */}
        {!user && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Hubungkan ke Akun Google Drive Anda
                </h3>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Masuk dengan Google untuk memeriksa otomatis nama file yang sudah pernah di-upload dan langsung mengunggah file ke folder tujuan.
                </p>
              </div>
            </div>
            <button
              onClick={handleLogin}
              disabled={isAuthLoading}
              className="shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              {isAuthLoading ? 'Menghubungkan...' : 'Masuk dengan Google Sekarang'}
            </button>
          </div>
        )}

        {/* Menu Navigasi Utama: Unggah & Arsip Drive vs Misi Upload Gambar (Stock List) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2 p-1 bg-slate-200/70 rounded-2xl w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setActiveMainTab('upload_browser')}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeMainTab === 'upload_browser'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <Upload className="w-3.5 h-3.5 text-blue-600" />
              <span>Unggah & Arsip Drive</span>
              {queue.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                  {queue.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveMainTab('missions')}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeMainTab === 'missions'
                  ? 'bg-white text-indigo-950 shadow-xs'
                  : 'text-slate-600 hover:text-indigo-900 hover:bg-slate-200/50'
              }`}
            >
              <Target className="w-3.5 h-3.5 text-indigo-600" />
              <span>Misi Upload Gambar</span>
              {missingImagesCount > 0 ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500 text-white animate-pulse">
                  {missingImagesCount} Belum Lengkap
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  Semua Lengkap
                </span>
              )}
            </button>
          </div>

          {/* Quick info about current active sheet */}
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="truncate max-w-xs font-mono text-[11px]">
              Sheet: <strong>STOCK LIST</strong> (Kolom A: SKU • Kolom C: Produk)
            </span>
          </div>
        </div>

        {/* TAB 1: Unggah & Arsip Drive */}
        {activeMainTab === 'upload_browser' && (
          <div className="space-y-6">
            {/* 1. SATU DROPZONE/TOMBOL UPLOAD PINTAR (Dual Auto-Detect 1:1 dan 4:5) */}
            <UploadDropzone
              onFilesSelected={handleFilesSelected}
              disabled={isUploadingAny}
            />

            {/* 2. Upload Queue List with Single Master Upload Button & Product Names */}
            {queue.length > 0 && (
              <UploadQueueList
                items={queue}
                activeFilter={queueFilter}
                onChangeFilter={setQueueFilter}
                onRemoveItem={handleRemoveItem}
                onRenameItem={handleRenameItem}
                onRecheckDuplicate={(id) => {
                  const it = queue.find((i) => i.id === id);
                  if (it) verifyQueueItem(it, token);
                }}
                onRequestOverwrite={(item) => setDuplicateModalItem(item)}
                onUploadSingle={handleUploadSingle}
                onUploadAllReady={handleUploadAllReady}
                onClearCompleted={handleClearCompleted}
                onClearAll={handleClearAll}
                onToggleCategory={handleToggleCategory}
                isUploadingAny={isUploadingAny}
                isSyncingSheet={isSyncingSheet}
                syncFeedback={syncFeedback}
                skuMap={skuMap}
              />
            )}

            {/* 3. Drive Folder Content Inspector with integrated folder tab switcher & Product Names */}
            {user && (
              <DriveFolderBrowser
                category={activeBrowserFolder}
                onSelectCategory={setActiveBrowserFolder}
                folderFileCount={{
                  aio: folderFiles.aio.length,
                  story: folderFiles.story.length,
                }}
                files={folderFiles[activeBrowserFolder] || []}
                isLoading={isLoadingFolder}
                token={token}
                onRefresh={() => fetchFolderContent(activeBrowserFolder, token)}
                onShowToast={showToast}
                skuMap={skuMap}
              />
            )}
          </div>
        )}

        {/* TAB 2: Misi Upload Gambar Berdasarkan Spreadsheet STOCK LIST */}
        {activeMainTab === 'missions' && (
          <div className="space-y-6">
            <MissingImagesMissionTracker
              products={stockProducts}
              isLoading={isLoadingStock}
              onRefresh={() => loadStockCatalog(token, true)}
              lastUpdated={stockLastUpdated}
              onSelectSkuForUpload={(sku, category) => {
                setActiveMainTab('upload_browser');
                showToast(
                  'info',
                  `Misi SKU: ${sku}`,
                  `Silakan drag & drop atau pilih file foto bernama "${sku}.png" untuk rasio ${
                    category === 'aio' ? '1:1 (AIO)' : '4:5 (Story)'
                  }.`
                );
              }}
            />
          </div>
        )}
      </main>

      {/* Pop Up jika nama file sama persis: Pilihan Replace Gambar atau Cancel */}
      <ReplaceOrCancelModal
        isOpen={!!duplicateModalItem}
        item={duplicateModalItem}
        folderName={
          duplicateModalItem
            ? TARGET_FOLDERS[duplicateModalItem.category || 'aio'].name
            : TARGET_FOLDERS[activeBrowserFolder].name
        }
        onReplace={handleExecuteReplace}
        onCancel={handleCancelReplace}
        onRename={handleRenameFromModal}
        onDeleteExisting={handleDeleteExistingFromModal}
        isProcessing={isReplacingFile}
        isDeletingExisting={isDeletingFromModal}
        skuMap={skuMap}
      />
    </div>
  );
}
