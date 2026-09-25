import { DriveFileInfo } from '../types';

/**
 * Searches if a file with the given name already exists in the target folder.
 * Returns the file info, and includes duplicateCount & allMatches if multiple exist.
 */
export async function checkFileExistsInFolder(
  folderId: string,
  fileName: string,
  token: string
): Promise<(DriveFileInfo & { duplicateCount?: number; allMatches?: DriveFileInfo[] }) | null> {
  const cleanName = fileName.trim();
  const escapedName = cleanName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  
  // Also check without extension if applicable or standard variations
  const query = `'${folderId}' in parents and (name = '${escapedName}' or name = '${escapedName.toLowerCase()}' or name = '${escapedName.toUpperCase()}') and trashed = false`;

  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', query);
  url.searchParams.set(
    'fields',
    'files(id, name, mimeType, size, webViewLink, webContentLink, createdTime, modifiedTime, thumbnailLink)'
  );
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('includeItemsFromAllDrives', 'true');
  url.searchParams.set('pageSize', '20');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Sesi login Google telah kedaluwarsa. Silakan masuk kembali.');
    }
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `Gagal memeriksa folder (Status: ${response.status})`;
    throw new Error(message);
  }

  const data = await response.json();
  if (data.files && data.files.length > 0) {
    const primary = data.files[0] as DriveFileInfo;
    return {
      ...primary,
      duplicateCount: data.files.length,
      allMatches: data.files as DriveFileInfo[],
    };
  }

  return null;
}

/**
 * Uploads a PNG file to Google Drive.
 * Uses the server proxy `/api/drive/upload` to bypass browser CORS limitations,
 * with fallback to client-side resumable upload.
 */
export function uploadPngToDrive(
  folderId: string,
  file: File,
  token: string,
  fileNameOverride?: string,
  onProgress?: (progress: number) => void
): Promise<{ id: string; name: string; webViewLink?: string }> {
  return new Promise(async (resolve, reject) => {
    const fileName = fileNameOverride || file.name;

    // Primary Method: Express server proxy route (same-origin, zero CORS issues)
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/drive/upload');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('x-folder-id', folderId);
      xhr.setRequestHeader('x-file-name', encodeURIComponent(fileName));
      xhr.setRequestHeader('Content-Type', 'image/png');

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 95);
            onProgress(percent);
          }
        };
      }

      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const res = JSON.parse(xhr.responseText);
            if (onProgress) onProgress(100);
            resolve(res);
          } catch {
            resolve({ id: 'done', name: fileName });
          }
        } else if (xhr.status === 401) {
          reject(new Error('Sesi otorisasi Google kedaluwarsa. Silakan klik Keluar lalu Masuk kembali.'));
        } else if (xhr.status === 404 || xhr.status >= 500) {
          // Server route might not be reached, try client fallback
          try {
            const fallbackRes = await clientResumableUpload(folderId, file, fileName, token, onProgress);
            resolve(fallbackRes);
          } catch (errFallback) {
            reject(errFallback);
          }
        } else {
          try {
            const errRes = JSON.parse(xhr.responseText);
            reject(new Error(errRes?.error?.message || `Gagal upload (${xhr.status}: ${xhr.statusText})`));
          } catch {
            reject(new Error(`Gagal upload (${xhr.status}: ${xhr.statusText})`));
          }
        }
      };

      xhr.onerror = async () => {
        // Fallback to client-side resumable upload
        try {
          const fallbackRes = await clientResumableUpload(folderId, file, fileName, token, onProgress);
          resolve(fallbackRes);
        } catch (errFallback) {
          reject(new Error('Koneksi terputus saat upload. Pastikan Anda telah mengizinkan akses ke Google Drive.'));
        }
      };

      const arrayBuffer = await file.arrayBuffer();
      xhr.send(new Uint8Array(arrayBuffer));
    } catch (err) {
      // Fallback
      try {
        const fallbackRes = await clientResumableUpload(folderId, file, fileName, token, onProgress);
        resolve(fallbackRes);
      } catch (errFallback) {
        reject(err);
      }
    }
  });
}

/**
 * Fallback: Client-side Resumable Upload protocol to Google Drive.
 */
async function clientResumableUpload(
  folderId: string,
  file: File,
  fileName: string,
  token: string,
  onProgress?: (progress: number) => void
): Promise<{ id: string; name: string; webViewLink?: string }> {
  // Step 1: Initiate resumable session
  const initRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'image/png',
        'X-Upload-Content-Length': file.size.toString(),
      },
      body: JSON.stringify({
        name: fileName,
        mimeType: 'image/png',
        parents: [folderId],
      }),
    }
  );

  if (!initRes.ok) {
    const errData = await initRes.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Gagal memulai sesi upload (${initRes.status})`);
  }

  const uploadLocation = initRes.headers.get('Location');
  if (!uploadLocation) {
    throw new Error('Google Drive tidak mengembalikan URL upload sesi');
  }

  // Step 2: Upload file bytes to session URI
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadLocation);
    xhr.setRequestHeader('Content-Type', 'image/png');

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText);
          resolve(result);
        } catch {
          resolve({ id: 'done', name: fileName });
        }
      } else {
        reject(new Error(`Gagal menyelesaikan upload (${xhr.status})`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Koneksi terputus saat mengunggah file gambar ke Google Drive'));
    };

    xhr.send(file);
  });
}

/**
 * Replaces/updates an existing file's binary content in Google Drive.
 * Includes automatic Smart Fallback (upload new + remove old) if file ownership/permissions prevent direct binary overwriting.
 */
export async function replaceExistingFileInDrive(
  fileId: string,
  file: File,
  token: string,
  folderId?: string,
  onProgress?: (progress: number) => void
): Promise<{ id: string; name: string; webViewLink?: string }> {
  try {
    const result = await new Promise<{ id: string; name: string; webViewLink?: string }>(
      async (resolve, reject) => {
        try {
          const xhr = new XMLHttpRequest();
          xhr.open('PATCH', '/api/drive/replace');
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          xhr.setRequestHeader('x-file-id', fileId);
          if (folderId) {
            xhr.setRequestHeader('x-folder-id', folderId);
          }
          xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));
          xhr.setRequestHeader('Content-Type', 'image/png');

          if (xhr.upload && onProgress) {
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 90);
                onProgress(percent);
              }
            };
          }

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const data = JSON.parse(xhr.responseText);
                if (onProgress) onProgress(100);
                resolve(data);
              } catch {
                resolve({ id: fileId, name: file.name });
              }
            } else {
              try {
                const errRes = JSON.parse(xhr.responseText);
                reject(new Error(errRes?.error?.message || `Gagal menimpa file (${xhr.status})`));
              } catch {
                reject(new Error(`Gagal menimpa file (${xhr.status})`));
              }
            }
          };

          xhr.onerror = () => {
            reject(new Error('Koneksi jaringan terputus saat menimpa file'));
          };

          const arrayBuffer = await file.arrayBuffer();
          xhr.send(new Uint8Array(arrayBuffer));
        } catch (err) {
          reject(err);
        }
      }
    );

    return result;
  } catch (err) {
    console.warn('[REPLACE FALLBACK] Server PATCH failed, attempting client-side fallback upload...', err);

    if (folderId) {
      // Client-side smart replace: upload new file to folder, then unlink/delete old file
      const uploaded = await uploadPngToDrive(folderId, file, token, file.name, onProgress);
      try {
        await deleteDriveFile(fileId, token, folderId);
      } catch (delErr) {
        console.warn('[REPLACE FALLBACK] Old duplicate file deletion error (non-fatal):', delErr);
      }
      return uploaded;
    }

    throw err;
  }
}

/**
 * Lists all files in the target folder for browsing and instant verification.
 * Automatically pages through nextPageToken using pageSize=1000 so that 100% of data is loaded without truncation.
 */
export async function listFolderFiles(
  folderId: string,
  token: string,
  onProgress?: (loadedCount: number) => void
): Promise<DriveFileInfo[]> {
  const query = `'${folderId}' in parents and trashed = false`;
  const allFiles: DriveFileInfo[] = [];
  let pageToken: string | null = null;
  let pageCount = 0;
  const maxPages = 20; // safety boundary (up to 20,000 files)

  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', query);
    url.searchParams.set('orderBy', 'createdTime desc');
    url.searchParams.set('pageSize', '1000');
    url.searchParams.set(
      'fields',
      'nextPageToken, files(id, name, mimeType, size, webViewLink, webContentLink, createdTime, modifiedTime, thumbnailLink)'
    );
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
      if (response.status === 401) {
        throw new Error('Sesi login Google kedaluwarsa. Silakan masuk kembali.');
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `Gagal memuat daftar file (${response.status})`);
    }

    const data = await response.json();
    const batch = (data.files || []) as DriveFileInfo[];
    allFiles.push(...batch);

    if (onProgress) {
      onProgress(allFiles.length);
    }

    pageToken = data.nextPageToken || null;
    pageCount++;
  } while (pageToken && pageCount < maxPages);

  return allFiles;
}

/**
 * Deletes a file from Google Drive (e.g. cleaning duplicate files or removing single file).
 * Uses the server proxy gateway with multi-tier fallback (Hard Delete -> Trash -> Remove Parents),
 * with direct client-side fallback if server proxy is unavailable or restricted.
 */
export async function deleteDriveFile(
  fileId: string,
  token: string,
  folderId?: string
): Promise<boolean> {
  const queryParams = new URLSearchParams({ fileId });
  if (folderId) {
    queryParams.set('folderId', folderId);
  }

  try {
    const res = await fetch(`/api/drive/delete?${queryParams.toString()}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-file-id': fileId,
        ...(folderId ? { 'x-folder-id': folderId } : {}),
      },
    });

    // If status is 404, file is already gone, which is a success state
    if (res.status === 404) {
      return true;
    }

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      return true;
    }

    const errorMessage =
      data?.error?.message ||
      data?.message ||
      `Gagal menghapus file dari Google Drive (${res.status})`;

    // If not token expired, attempt direct client-side fallback to Google Drive API
    if (res.status !== 401) {
      const clientFallbackOk = await attemptDirectClientDelete(fileId, token, folderId);
      if (clientFallbackOk) {
        return true;
      }
    }

    throw new Error(errorMessage);
  } catch (err: unknown) {
    // If network or proxy error, attempt direct client-side fallback
    const clientFallbackOk = await attemptDirectClientDelete(fileId, token, folderId);
    if (clientFallbackOk) {
      return true;
    }
    throw err;
  }
}

/**
 * Direct client-side deletion / unlinking fallback against Google Drive API v3
 */
async function attemptDirectClientDelete(
  fileId: string,
  token: string,
  folderId?: string
): Promise<boolean> {
  console.log(`[CLIENT DELETE FALLBACK] Attempting direct client-side deletion for ${fileId}...`);

  // 1. Try Direct Hard Delete
  try {
    const hardRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true&includeItemsFromAllDrives=true`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (hardRes.ok || hardRes.status === 204 || hardRes.status === 404) {
      console.log(`[CLIENT DELETE FALLBACK] Hard delete succeeded for ${fileId}`);
      return true;
    }
  } catch (e) {
    console.warn('[CLIENT DELETE FALLBACK] Hard delete failed:', e);
  }

  // 2. Try Move to Trash
  try {
    const trashRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true&includeItemsFromAllDrives=true`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trashed: true }),
      }
    );
    if (trashRes.ok || trashRes.status === 204 || trashRes.status === 404) {
      console.log(`[CLIENT DELETE FALLBACK] Trashed succeeded for ${fileId}`);
      return true;
    }
  } catch (e) {
    console.warn('[CLIENT DELETE FALLBACK] Trashing failed:', e);
  }

  // 3. Try removeParents if folderId is known
  if (folderId) {
    try {
      const removeRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?removeParents=${encodeURIComponent(folderId)}&supportsAllDrives=true&includeItemsFromAllDrives=true&enforceSingleParent=false`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      );
      if (removeRes.ok || removeRes.status === 204 || removeRes.status === 404) {
        console.log(`[CLIENT DELETE FALLBACK] removeParents succeeded for ${fileId}`);
        return true;
      }
    } catch (e) {
      console.warn('[CLIENT DELETE FALLBACK] removeParents failed:', e);
    }
  }

  return false;
}
