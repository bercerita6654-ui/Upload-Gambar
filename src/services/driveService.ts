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
 */
export function replaceExistingFileInDrive(
  fileId: string,
  file: File,
  token: string,
  onProgress?: (progress: number) => void
): Promise<{ id: string; name: string; webViewLink?: string }> {
  return new Promise(async (resolve, reject) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('PATCH', '/api/drive/replace');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('x-file-id', fileId);
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
            if (onProgress) onProgress(100);
            resolve(result);
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
  });
}

/**
 * Lists files in the target folder for browsing and instant verification.
 */
export async function listFolderFiles(
  folderId: string,
  token: string
): Promise<DriveFileInfo[]> {
  const query = `'${folderId}' in parents and trashed = false`;
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', query);
  url.searchParams.set('orderBy', 'createdTime desc');
  url.searchParams.set('pageSize', '250');
  url.searchParams.set(
    'fields',
    'files(id, name, mimeType, size, webViewLink, webContentLink, createdTime, modifiedTime, thumbnailLink)'
  );
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('includeItemsFromAllDrives', 'true');

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
  return (data.files || []) as DriveFileInfo[];
}

/**
 * Deletes a file from Google Drive (e.g. cleaning duplicate files).
 */
export async function deleteDriveFile(fileId: string, token: string): Promise<boolean> {
  // First try server proxy route
  try {
    const res = await fetch('/api/drive/delete', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-file-id': fileId,
      },
    });

    if (res.ok) {
      return true;
    }
  } catch {
    // Fallback to direct Google Drive API
  }

  // Fallback: Direct Google Drive API
  const directRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!directRes.ok && directRes.status !== 204) {
    const err = await directRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gagal menghapus file dari Google Drive (${directRes.status})`);
  }

  return true;
}
