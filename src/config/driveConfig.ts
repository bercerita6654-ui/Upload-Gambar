import { TargetFolderConfig, FolderCategory, ImageRatioInfo } from '../types';

export const TARGET_FOLDERS: Record<FolderCategory, TargetFolderConfig> = {
  aio: {
    id: 'aio',
    name: 'Gambar AIO',
    folderId: '1xYDYQfYIvFK8AxzfEFchdPg7wv58zfyI',
    folderUrl: 'https://drive.google.com/drive/folders/1xYDYQfYIvFK8AxzfEFchdPg7wv58zfyI?usp=drive_link',
    badgeLabel: 'AIO (All-In-One)',
    description: 'Folder arsip khusus Gambar AIO - Bundled Assets & Main Banners.',
    expectedRatio: '1:1',
    ratioDescription: 'Acuan Rasio: 1:1 (Persegi / Square)',
    colorTheme: 'indigo',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    pillClass: 'bg-indigo-600 text-white',
    borderClass: 'border-indigo-300',
    activeBorderClass: 'border-indigo-600 ring-2 ring-indigo-500/20',
    activeBgClass: 'bg-indigo-50/60',
    iconBgClass: 'bg-indigo-600 text-white',
    buttonClass: 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white',
  },
  story: {
    id: 'story',
    name: 'Gambar Story Product',
    folderId: '1A4MpcBh6t60ys0KVvLjdr5F3J0Im3U_E',
    folderUrl: 'https://drive.google.com/drive/folders/1A4MpcBh6t60ys0KVvLjdr5F3J0Im3U_E?usp=drive_link',
    badgeLabel: 'Story Product',
    description: 'Folder arsip khusus Story Product - Instagram/TikTok Showcase & Katalog.',
    expectedRatio: '4:5',
    ratioDescription: 'Acuan Rasio: 4:5 (Portrait / Story Feed)',
    colorTheme: 'emerald',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    pillClass: 'bg-emerald-600 text-white',
    borderClass: 'border-emerald-300',
    activeBorderClass: 'border-emerald-600 ring-2 ring-emerald-500/20',
    activeBgClass: 'bg-emerald-50/60',
    iconBgClass: 'bg-emerald-600 text-white',
    buttonClass: 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white',
  },
};

export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive'];

export const APPS_SCRIPT_SYNC_URL =
  'https://script.google.com/macros/s/AKfycbz-ozpv3Tb5pnu2QEHTjjjxHMe6_QGP4n4Rr7-KjOwWC81vR_XaYMC1JinAZ16PJEetIQ/exec';

/**
 * Validates whether the filename adheres to:
 * 1. PNG format (.png)
 * 2. Exactly 5 numeric digits as the filename (e.g. 11321.png)
 */
export function validatePngFileName(fileName: string): {
  isValid: boolean;
  message?: string;
  suggestedName?: string;
} {
  const cleanName = fileName.trim();
  const lower = cleanName.toLowerCase();

  if (!lower.endsWith('.png')) {
    return {
      isValid: false,
      message: 'Format file tidak sesuai. Wajib menggunakan format PNG (.png).',
    };
  }

  const baseName = cleanName.substring(0, cleanName.length - 4);
  const isFiveDigits = /^\d{5}$/.test(baseName);

  if (!isFiveDigits) {
    if (/^\d+$/.test(baseName)) {
      return {
        isValid: false,
        message: `Nama file "${baseName}" memiliki ${baseName.length} digit. Aturan mewajibkan tepat 5 digit angka (contoh: 11321.png).`,
      };
    }
    return {
      isValid: false,
      message: `Nama file "${baseName}" tidak valid. Nama file wajib terdiri dari 5 digit angka (contoh: 11321.png).`,
    };
  }

  return {
    isValid: true,
  };
}

/**
 * Asynchronously inspects the width and height of an image file in the browser.
 */
export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(objectUrl);
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;
  });
}

/**
 * Analyzes aspect ratio against target folder rules:
 * - AIO requires 1:1 (ratio = 1.0)
 * - Story Product requires 4:5 (ratio = 0.8)
 */
export function analyzeImageRatio(
  width: number,
  height: number,
  targetCategory: FolderCategory
): ImageRatioInfo {
  if (width === 0 || height === 0) {
    return {
      width,
      height,
      ratio: 1,
      ratioLabel: 'Tidak Diketahui',
      isMatchingTarget: true,
    };
  }

  const ratio = width / height;

  // Determine standard ratio label
  let ratioLabel = `${width}:${height}`;
  const isOneToOne = Math.abs(ratio - 1.0) <= 0.035; // 1:1 (tolerance ~3%)
  const isFourFive = Math.abs(ratio - 0.8) <= 0.035; // 4:5 (tolerance ~3%)
  const isNineSixteen = Math.abs(ratio - 9 / 16) <= 0.035; // 9:16
  const isSixteenNine = Math.abs(ratio - 16 / 9) <= 0.035; // 16:9

  if (isOneToOne) {
    ratioLabel = '1:1 (Persegi)';
  } else if (isFourFive) {
    ratioLabel = '4:5 (Portrait)';
  } else if (isNineSixteen) {
    ratioLabel = '9:16 (Story Vertikal Penuh)';
  } else if (isSixteenNine) {
    ratioLabel = '16:9 (Landscape)';
  } else {
    ratioLabel = `${ratio.toFixed(2)}:1 (${width}×${height}px)`;
  }

  if (targetCategory === 'aio') {
    // AIO expects 1:1
    if (isOneToOne) {
      return {
        width,
        height,
        ratio,
        ratioLabel: '1:1 (Sesuai AIO)',
        isMatchingTarget: true,
      };
    } else if (isFourFive) {
      return {
        width,
        height,
        ratio,
        ratioLabel,
        isMatchingTarget: false,
        suggestedCategory: 'story',
        warningMessage:
          'Gambar ini berasio 4:5 (spesifikasi Gambar Story Product). Anda sedang di menu Gambar AIO (wajib 1:1).',
      };
    } else {
      return {
        width,
        height,
        ratio,
        ratioLabel,
        isMatchingTarget: false,
        warningMessage: `Rasio gambar ${ratioLabel} berbeda dari acuan Gambar AIO (1:1 persegi).`,
      };
    }
  } else {
    // Story expects 4:5
    if (isFourFive) {
      return {
        width,
        height,
        ratio,
        ratioLabel: '4:5 (Sesuai Story)',
        isMatchingTarget: true,
      };
    } else if (isOneToOne) {
      return {
        width,
        height,
        ratio,
        ratioLabel,
        isMatchingTarget: false,
        suggestedCategory: 'aio',
        warningMessage:
          'Gambar ini berasio 1:1 (spesifikasi Gambar AIO). Anda sedang di menu Story Product (wajib 4:5).',
      };
    } else {
      return {
        width,
        height,
        ratio,
        ratioLabel,
        isMatchingTarget: false,
        warningMessage: `Rasio gambar ${ratioLabel} berbeda dari acuan Story Product (4:5).`,
      };
    }
  }
}
