/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import {
  FolderCategory,
  UploadQueueItem,
  DriveFileInfo,
} from './types';
import {
  TARGET_FOLDERS,
  validatePngFileName,
  getImageDimensions,
  analyzeImageRatio,
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
} from './services/driveService';
import { Header } from './components/Header';
import { FolderSelector } from './components/FolderSelector';
import { UploadDropzone } from './components/UploadDropzone';
import { UploadQueueList } from './components/UploadQueueList';
import { DriveFolderBrowser } from './components/DriveFolderBrowser';
import { ReplaceOrCancelModal } from './components/ReplaceOrCancelModal';
import {
  AlertCircle,
  CheckCircle2,
  HardDrive,
  Info,
  ShieldAlert,
  Sparkles,
  ExternalLink,
} from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Folder Category ('aio' | 'story')
  const [selectedCategory, setSelectedCategory] = useState<FolderCategory>('aio');

  // Separate queues for each folder category so history is NEVER mixed
  const [queues, setQueues] = useState<Record<FolderCategory, UploadQueueItem[]>>({
    aio: [],
    story: [],
  });
  const currentQueue = queues[selectedCategory];
  const [isUploadingAny, setIsUploadingAny] = useState<boolean>(false);

  // Drive folder cache files
  const [folderFiles, setFolderFiles] = useState<Record<FolderCategory, DriveFileInfo[]>>({
    aio: [],
    story: [],
  });
  const [isLoadingFolder, setIsLoadingFolder] = useState<boolean>(false);

  // Modal confirmation for overwriting existing file
  const [duplicateModalItem, setDuplicateModalItem] = useState<UploadQueueItem | null>(null);
  const [isReplacingFile, setIsReplacingFile] = useState<boolean>(false);

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

  // 2. Fetch files in folder when auth token or category changes
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

  useEffect(() => {
    if (token) {
      fetchFolderContent(selectedCategory, token);
    }
  }, [token, selectedCategory, fetchFolderContent]);

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
        fetchFolderContent(selectedCategory, result.accessToken);
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
      cat: FolderCategory,
      activeToken: string | null
    ): Promise<UploadQueueItem> => {
      // 1. Analyze image dimensions & aspect ratio
      let ratioInfo = item.ratioInfo;
      if (!ratioInfo || ratioInfo.width === 0) {
        const dims = await getImageDimensions(item.file);
        ratioInfo = analyzeImageRatio(dims.width, dims.height, cat);
      } else {
        // Re-analyze for potentially updated category
        ratioInfo = analyzeImageRatio(ratioInfo.width, ratioInfo.height, cat);
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

      const folderId = TARGET_FOLDERS[cat].folderId;
      try {
        const existing = await checkFileExistsInFolder(folderId, item.file.name, activeToken);
        if (existing) {
          // File with same name already exists in target folder!
          return {
            ...item,
            ratioInfo,
            status: 'duplicate_found',
            statusMessage: `File "${item.file.name}" sudah pernah di-upload ke ${TARGET_FOLDERS[cat].name}`,
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

  // When files are dropped or selected
  const handleFilesSelected = async (newFiles: File[]) => {
    const newItems: UploadQueueItem[] = newFiles.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'checking_drive',
      category: selectedCategory,
      uploadProgress: 0,
    }));

    // Add items immediately to the selected category queue (isolated from other category)
    setQueues((prev) => ({
      ...prev,
      [selectedCategory]: [...prev[selectedCategory], ...newItems],
    }));

    // Check each file asynchronously
    let hasDuplicate = false;
    let duplicateFileName = '';

    const verifiedItems = await Promise.all(
      newItems.map(async (item) => {
        const checked = await verifyQueueItem(item, selectedCategory, token);
        if (checked.status === 'duplicate_found') {
          hasDuplicate = true;
          duplicateFileName = checked.file.name;
        }
        return checked;
      })
    );

    // Update queue with verified states in current category only
    setQueues((prev) => ({
      ...prev,
      [selectedCategory]: prev[selectedCategory].map((item) => {
        const match = verifiedItems.find((v) => v.id === item.id);
        return match || item;
      }),
    }));

    if (hasDuplicate) {
      showToast(
        'warning',
        'File Duplikat Terdeteksi!',
        `File ${duplicateFileName} sudah pernah di-upload atau memiliki nama yang sama di folder ${TARGET_FOLDERS[selectedCategory].name}.`
      );

      // Otomatis munculkan pop up untuk replace atau cancel
      const firstDuplicate = verifiedItems.find((v) => v.status === 'duplicate_found');
      if (firstDuplicate) {
        setDuplicateModalItem(firstDuplicate);
      }
    }
  };

  // Switch folder category: queues and history are kept completely separated!
  const handleSelectCategory = (cat: FolderCategory) => {
    setSelectedCategory(cat);
  };

  // Move specific item from current category to another category (e.g. from ratio recommendation)
  const handleMoveItemToCategory = async (itemId: string, targetCategory: FolderCategory) => {
    const sourceCategory = selectedCategory;
    const item = queues[sourceCategory].find((i) => i.id === itemId);
    if (!item) return;

    // Remove from source queue
    setQueues((prev) => ({
      ...prev,
      [sourceCategory]: prev[sourceCategory].filter((i) => i.id !== itemId),
    }));

    const itemToMove: UploadQueueItem = {
      ...item,
      category: targetCategory,
      status: 'checking_drive',
      statusMessage: undefined,
    };

    // Add to target category queue
    setQueues((prev) => ({
      ...prev,
      [targetCategory]: [...prev[targetCategory], itemToMove],
    }));

    setSelectedCategory(targetCategory);

    // Verify against target category folder
    const verified = await verifyQueueItem(itemToMove, targetCategory, token);
    setQueues((prev) => ({
      ...prev,
      [targetCategory]: prev[targetCategory].map((i) => (i.id === itemId ? verified : i)),
    }));

    if (verified.status === 'duplicate_found') {
      setDuplicateModalItem(verified);
    }

    showToast(
      'info',
      'File Dipindahkan ke Antrean Baru',
      `File ${item.file.name} dipindahkan ke antrean ${TARGET_FOLDERS[targetCategory].name}.`
    );
  };

  // Remove single item from current category queue
  const handleRemoveItem = (id: string) => {
    setQueues((prev) => {
      const target = prev[selectedCategory].find((item) => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return {
        ...prev,
        [selectedCategory]: prev[selectedCategory].filter((item) => item.id !== id),
      };
    });
  };

  // Clear completed items in current category queue
  const handleClearCompleted = () => {
    setQueues((prev) => {
      prev[selectedCategory].forEach((item) => {
        if (item.status === 'success' && item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
      return {
        ...prev,
        [selectedCategory]: prev[selectedCategory].filter((item) => item.status !== 'success'),
      };
    });
  };

  // Clear all items in current category queue
  const handleClearAll = () => {
    queues[selectedCategory].forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    setQueues((prev) => ({
      ...prev,
      [selectedCategory]: [],
    }));
  };

  // Inline rename item in current category queue
  const handleRenameItem = async (id: string, newFileName: string) => {
    const item = queues[selectedCategory].find((i) => i.id === id);
    if (!item) return;

    // Create a new File instance with the updated name
    const renamedFile = new File([item.file], newFileName, { type: item.file.type || 'image/png' });
    const updatedItem: UploadQueueItem = {
      ...item,
      file: renamedFile,
      status: 'checking_drive',
      statusMessage: undefined,
    };

    setQueues((prev) => ({
      ...prev,
      [selectedCategory]: prev[selectedCategory].map((i) => (i.id === id ? updatedItem : i)),
    }));

    const verified = await verifyQueueItem(updatedItem, selectedCategory, token);
    setQueues((prev) => ({
      ...prev,
      [selectedCategory]: prev[selectedCategory].map((i) => (i.id === id ? verified : i)),
    }));

    if (verified.status === 'duplicate_found') {
      showToast(
        'warning',
        'File Duplikat Terdeteksi',
        `File bernama ${newFileName} sudah pernah di-upload di ${TARGET_FOLDERS[selectedCategory].name}.`
      );
      setDuplicateModalItem(verified);
    }
  };

  // Single Upload execution
  const executeUploadItem = async (item: UploadQueueItem): Promise<boolean> => {
    let currentToken = token;
    if (!currentToken) {
      try {
        const loginRes = await googleSignIn();
        if (!loginRes) return false;
        currentToken = loginRes.accessToken;
        setToken(loginRes.accessToken);
        setUser(loginRes.user);
      } catch (err: unknown) {
        const errObj = err as { message?: string };
        showToast('error', 'Login Diperlukan', errObj.message || 'Silakan masuk ke Google');
        return false;
      }
    }

    const targetFolderId = TARGET_FOLDERS[selectedCategory].folderId;

    // Update status to uploading in selected category queue
    setQueues((prev) => ({
      ...prev,
      [selectedCategory]: prev[selectedCategory].map((i) =>
        i.id === item.id ? { ...i, status: 'uploading', uploadProgress: 5 } : i
      ),
    }));

    try {
      const result = await uploadPngToDrive(
        targetFolderId,
        item.file,
        currentToken,
        item.file.name,
        (progress) => {
          setQueues((prev) => ({
            ...prev,
            [selectedCategory]: prev[selectedCategory].map((i) =>
              i.id === item.id ? { ...i, uploadProgress: progress } : i
            ),
          }));
        }
      );

      setQueues((prev) => ({
        ...prev,
        [selectedCategory]: prev[selectedCategory].map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: 'success',
                uploadProgress: 100,
                uploadedDriveUrl: result.webViewLink,
                uploadedFileId: result.id,
              }
            : i
        ),
      }));

      // Refresh folder cache
      fetchFolderContent(selectedCategory, currentToken);
      return true;
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      setQueues((prev) => ({
        ...prev,
        [selectedCategory]: prev[selectedCategory].map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: 'error',
                error: errObj.message || 'Gagal mengupload file ke Google Drive',
              }
            : i
        ),
      }));
      return false;
    }
  };

  // Upload Single File
  const handleUploadSingle = async (item: UploadQueueItem) => {
    if (isUploadingAny) return;
    setIsUploadingAny(true);
    await executeUploadItem(item);
    setIsUploadingAny(false);
  };

  // Upload All Ready Files in sequence
  const handleUploadAllReady = async () => {
    if (isUploadingAny) return;
    const readyItems = currentQueue.filter((i) => i.status === 'ready');
    if (readyItems.length === 0) return;

    setIsUploadingAny(true);
    let successCount = 0;

    for (const item of readyItems) {
      const success = await executeUploadItem(item);
      if (success) successCount++;
    }

    setIsUploadingAny(false);
    showToast(
      'success',
      'Upload Selesai',
      `Berhasil mengunggah ${successCount} dari ${readyItems.length} file ke ${TARGET_FOLDERS[selectedCategory].name}.`
    );
  };

  // Eksekusi Replace ketika user memilih "Replace Gambar di Drive" pada pop-up
  const handleExecuteReplace = async (item: UploadQueueItem) => {
    if (!token) {
      showToast('error', 'Login Diperlukan', 'Silakan hubungkan akun Google terlebih dahulu.');
      return;
    }

    setIsReplacingFile(true);

    setQueues((prev) => ({
      ...prev,
      [selectedCategory]: prev[selectedCategory].map((i) =>
        i.id === item.id ? { ...i, status: 'uploading', uploadProgress: 10 } : i
      ),
    }));

    try {
      let result;
      if (item.existingFile?.id) {
        result = await replaceExistingFileInDrive(
          item.existingFile.id,
          item.file,
          token,
          (progress) => {
            setQueues((prev) => ({
              ...prev,
              [selectedCategory]: prev[selectedCategory].map((i) =>
                i.id === item.id ? { ...i, uploadProgress: progress } : i
              ),
            }));
          }
        );
      } else {
        result = await uploadPngToDrive(
          TARGET_FOLDERS[selectedCategory].folderId,
          item.file,
          token,
          item.file.name,
          (progress) => {
            setQueues((prev) => ({
              ...prev,
              [selectedCategory]: prev[selectedCategory].map((i) =>
                i.id === item.id ? { ...i, uploadProgress: progress } : i
              ),
            }));
          }
        );
      }

      setQueues((prev) => ({
        ...prev,
        [selectedCategory]: prev[selectedCategory].map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: 'success',
                uploadProgress: 100,
                uploadedDriveUrl: result.webViewLink,
                uploadedFileId: result.id,
              }
            : i
        ),
      }));

      setDuplicateModalItem(null);
      setIsReplacingFile(false);

      showToast(
        'success',
        'Gambar Berhasil Di-Replace!',
        `File ${item.file.name} telah berhasil di-replace di Google Drive folder ${TARGET_FOLDERS[selectedCategory].name}.`
      );

      fetchFolderContent(selectedCategory, token);
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      setIsReplacingFile(false);
      setQueues((prev) => ({
        ...prev,
        [selectedCategory]: prev[selectedCategory].map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: 'error',
                error: errObj.message || 'Gagal me-replace file di Google Drive',
              }
            : i
        ),
      }));
      showToast(
        'error',
        'Gagal Replace',
        errObj.message || 'Terjadi kesalahan saat me-replace gambar di Google Drive.'
      );
    }
  };

  // User memilih "Cancel (Batalkan Upload)" pada pop-up
  const handleCancelReplace = (item: UploadQueueItem) => {
    setDuplicateModalItem(null);
    handleRemoveItem(item.id);
    showToast(
      'info',
      'Upload Dibatalkan',
      `File ${item.file.name} dibatalkan dan dihapus dari antrean. File lama di Google Drive tidak diubah.`
    );
  };

  // User memilih ganti nama file langsung dari pop-up
  const handleRenameFromModal = (item: UploadQueueItem, newName: string) => {
    setDuplicateModalItem(null);
    handleRenameItem(item.id, newName);
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

        {/* 1. Target Folder Selector */}
        <FolderSelector
          selectedCategory={selectedCategory}
          onSelectCategory={handleSelectCategory}
          folderFileCount={{
            aio: folderFiles.aio.length,
            story: folderFiles.story.length,
          }}
          queueCount={{
            aio: queues.aio.length,
            story: queues.story.length,
          }}
        />

        {/* 2. Upload Dropzone */}
        <UploadDropzone
          category={selectedCategory}
          onFilesSelected={handleFilesSelected}
          disabled={isUploadingAny}
        />

        {/* 3. Upload Queue List (Active when current category has items in queue) */}
        {currentQueue.length > 0 && (
          <UploadQueueList
            items={currentQueue}
            category={selectedCategory}
            onRemoveItem={handleRemoveItem}
            onRenameItem={handleRenameItem}
            onRecheckDuplicate={(id) => {
              const it = currentQueue.find((i) => i.id === id);
              if (it) verifyQueueItem(it, selectedCategory, token);
            }}
            onRequestOverwrite={(item) => setDuplicateModalItem(item)}
            onUploadSingle={handleUploadSingle}
            onUploadAllReady={handleUploadAllReady}
            onClearCompleted={handleClearCompleted}
            onClearAll={handleClearAll}
            onSwitchCategory={handleSelectCategory}
            onMoveItemToCategory={handleMoveItemToCategory}
            isUploadingAny={isUploadingAny}
          />
        )}

        {/* 4. Drive Folder Content Inspector */}
        {user && (
          <DriveFolderBrowser
            category={selectedCategory}
            files={folderFiles[selectedCategory] || []}
            isLoading={isLoadingFolder}
            onRefresh={() => fetchFolderContent(selectedCategory, token)}
            onShowToast={showToast}
          />
        )}
      </main>

      {/* Pop Up jika nama file sama persis: Pilihan Replace Gambar atau Cancel */}
      <ReplaceOrCancelModal
        isOpen={!!duplicateModalItem}
        item={duplicateModalItem}
        folderName={TARGET_FOLDERS[selectedCategory].name}
        onReplace={handleExecuteReplace}
        onCancel={handleCancelReplace}
        onRename={handleRenameFromModal}
        isProcessing={isReplacingFile}
      />
    </div>
  );
}
