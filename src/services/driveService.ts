import { DriveFileInfo } from '../types';
import { isAuthError } from './auth';

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
  
  // Also check without extension if applicable or standard variations, excluding tombstoned files
  const query = `'${folderId}' in parents and (name = '${escapedName}' or name = '${escapedName.toLowerCase()}' or name = '${escapedName.toUpperCase()}') and trashed = false and not name contains '.deleted_'`;

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
  const validFiles = ((data.files || []) as DriveFileInfo[]).filter(
    (f) => f && f.name && !f.name.startsWith('.deleted_') && !f.name.startsWith('.trash_')
  );

  if (validFiles.length > 0) {
    const primary = validFiles[0];
    return {
      ...primary,
      duplicateCount: validFiles.length,
      allMatches: validFiles,
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
          try {
            const errRes = JSON.parse(xhr.responseText);
            reject(new Error(errRes?.error?.message || 'Request had invalid authentication credentials. Expected OAuth 2 access token.'));
          } catch {
            reject(new Error('Request had invalid authentication credentials. Expected OAuth 2 access token.'));
          }
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
 * Ensures folderId is preserved and passed via headers and query params, with automatic parent discovery if missing.
 */
export async function replaceExistingFileInDrive(
  fileId: string,
  file: File,
  token: string,
  folderId?: string,
  onProgress?: (progress: number) => void
): Promise<{ id: string; name: string; webViewLink?: string }> {
  // If folderId is not passed, attempt to dynamically inspect parent folder from Drive API
  let effectiveFolderId = folderId;
  if (!effectiveFolderId && token) {
    try {
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (metaRes.ok) {
        const meta = await metaRes.json();
        if (Array.isArray(meta.parents) && meta.parents.length > 0) {
          effectiveFolderId = meta.parents[0];
        }
      }
    } catch {
      // Non-fatal, continue with replace
    }
  }

  try {
    const result = await new Promise<{ id: string; name: string; webViewLink?: string }>(
      async (resolve, reject) => {
        try {
          const xhr = new XMLHttpRequest();
          const queryParams = new URLSearchParams({ fileId });
          if (effectiveFolderId) {
            queryParams.set('folderId', effectiveFolderId);
          }
          queryParams.set('fileName', encodeURIComponent(file.name));

          xhr.open('PATCH', `/api/drive/replace?${queryParams.toString()}`);
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          xhr.setRequestHeader('x-file-id', fileId);
          if (effectiveFolderId) {
            xhr.setRequestHeader('x-folder-id', effectiveFolderId);
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
  } catch (err: unknown) {
    if (isAuthError(err)) {
      throw err;
    }

    console.warn('[REPLACE FALLBACK] Server PATCH failed, attempting client-side direct media patch...', err);

    // Client fallback 1: Direct media binary PATCH to Google Drive API with Content-Length
    try {
      const directRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'image/png',
            'Content-Length': file.size.toString(),
          },
          body: file,
        }
      );

      if (directRes.status === 401) {
        throw new Error('Request had invalid authentication credentials. Expected OAuth 2 access token.');
      }

      if (directRes.ok) {
        const directData = await directRes.json();
        // Update name
        try {
          await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: file.name }),
          });
        } catch {}
        if (onProgress) onProgress(100);
        return {
          id: fileId,
          name: file.name,
          webViewLink: directData.webViewLink,
        };
      }
    } catch (directErr) {
      if (isAuthError(directErr)) throw directErr;
      console.warn('[REPLACE FALLBACK] Direct client media PATCH failed:', directErr);
    }

    if (effectiveFolderId) {
      // Client-side fallback 2: Safely rename/isolate old file FIRST so it never duplicates
      try {
        await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: `.replaced_${Date.now()}_${file.name}` }),
        });
      } catch {}

      try {
        await deleteDriveFile(fileId, token, effectiveFolderId);
      } catch (delErr) {
        console.warn('[REPLACE FALLBACK] Old duplicate file deletion error (non-fatal):', delErr);
      }

      const uploaded = await uploadPngToDrive(effectiveFolderId, file, token, file.name, onProgress);
      return uploaded;
    }

    throw err;
  }
}

/**
 * Searches for any other duplicate files with the same name in the folder and deletes them,
 * ensuring only the primary replaced file remains.
 */
export async function cleanOtherDuplicatesInFolder(
  folderId: string,
  fileName: string,
  keepFileId: string,
  token: string
): Promise<number> {
  try {
    const existing = await checkFileExistsInFolder(folderId, fileName, token);
    if (!existing || !existing.allMatches || existing.allMatches.length <= 1) {
      return 0;
    }
    const copiesToDelete = existing.allMatches.filter((m) => m.id !== keepFileId);
    let cleaned = 0;
    for (const copy of copiesToDelete) {
      try {
        await deleteDriveFile(copy.id, token, folderId);
        cleaned++;
      } catch (err) {
        console.warn(`Could not delete duplicate copy ${copy.id}:`, err);
      }
    }
    return cleaned;
  } catch {
    return 0;
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
  const query = `'${folderId}' in parents and trashed = false and not name contains '.deleted_' and not name contains '.trash_'`;
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
    const batch = ((data.files || []) as DriveFileInfo[]).filter(
      (f) => f && f.name && !f.name.startsWith('.deleted_') && !f.name.startsWith('.trash_')
    );
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
      `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
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
      `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
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

  // 3. Try removeParents (using actual parent folders from file metadata)
  const parentsToUnlink = new Set<string>();
  if (folderId) {
    parentsToUnlink.add(folderId);
  }

  let unlinkSuccess = false;
  let fileCurrentName = '';

  try {
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,parents,trashed&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (metaRes.status === 404) return true;
    if (metaRes.ok) {
      const meta = await metaRes.json();
      fileCurrentName = meta.name || '';
      if (meta.trashed) return true;
      if (Array.isArray(meta.parents)) {
        meta.parents.forEach((p: string) => {
          if (p) parentsToUnlink.add(p);
        });
      }
    }
  } catch {
    // Continue with existing parentsToUnlink
  }

  for (const pId of Array.from(parentsToUnlink)) {
    try {
      const removeRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?removeParents=${encodeURIComponent(
          pId
        )}&supportsAllDrives=true`,
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
        console.log(`[CLIENT DELETE FALLBACK] removeParents succeeded for ${fileId} from parent ${pId}`);
        unlinkSuccess = true;
      }
    } catch (e) {
      console.warn(`[CLIENT DELETE FALLBACK] removeParents failed for parent ${pId}:`, e);
    }
  }

  if (unlinkSuccess) {
    return true;
  }

  // 4. Strategy 4: Tombstone Rename (Available to any editor of a shared folder)
  // Ensures file is immediately excluded from searches, listings, missions, and catalogs
  try {
    const tombstoneName = `.deleted_${Date.now()}_${fileCurrentName || 'file'}`;
    const renameRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: tombstoneName }),
      }
    );
    if (renameRes.ok || renameRes.status === 204) {
      console.log(`[CLIENT DELETE FALLBACK] Tombstone rename succeeded for ${fileId}`);
      return true;
    }
  } catch (tombErr) {
    console.warn('[CLIENT DELETE FALLBACK] Tombstone rename error:', tombErr);
  }

  return false;
}
