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

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
];

export const SPREADSHEET_CONFIG = {
  spreadsheetId: '1mrD9sQK_Sffa1X1fzlCDmaJXs1Yj2q-XTNdi2sRGPos',
  sheetName: 'STOCK LIST',
  storyColStart: 22, // Kolom V (22), Last Update Kolom W (23)
  aioColStart: 24, // Kolom X (24), Last Update Kolom Y (25)
};

export const APPS_SCRIPT_SYNC_URL =
  'https://script.google.com/macros/s/AKfycbzjPVi5VEr3RU1Ixs7LwAFKiX9hUYlphq0V9k3WIacJjxa7cJvhIVHRwop-cofQmjUE4Q/exec';

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
 * Smart Auto-Detection Function:
 * Otomatis mendeteksi 2 fungsi berdasarkan ukuran rasio sesuai aturan:
 * 1. Rasio 1:1 (Persegi) -> Otomatis ke Gambar AIO (toleransi 5%)
 * 2. Rasio 4:5 (Portrait) -> Otomatis ke Gambar Story Product (toleransi 5%)
 * Jika non-standar, menentukan pendekatan terdekat dan menyertakan catatan.
 */
export function detectCategoryFromRatio(
  width: number,
  height: number
): {
  detectedCategory: FolderCategory;
  ratioLabel: string;
  ratio: number;
  width: number;
  height: number;
  isExactRule: boolean;
  explanation: string;
  ruleBadge: string;
} {
  if (width === 0 || height === 0) {
    return {
      detectedCategory: 'aio',
      ratioLabel: 'Dimensi Belum Diketahui',
      ratio: 1,
      width,
      height,
      isExactRule: false,
      explanation: 'Dimensi belum dapat dibaca, default ke AIO.',
      ruleBadge: 'Default AIO',
    };
  }

  const ratio = width / height;
  const isOneToOne = Math.abs(ratio - 1.0) <= 0.05; // 1:1 (toleransi 5%)
  const isFourFive = Math.abs(ratio - 0.8) <= 0.05; // 4:5 (toleransi 5%)

  if (isOneToOne) {
    return {
      detectedCategory: 'aio',
      ratioLabel: '1:1 (Persegi / Square)',
      ratio,
      width,
      height,
      isExactRule: true,
      explanation: 'Sesuai aturan Gambar AIO: Berukuran rasio 1:1 (Persegi)',
      ruleBadge: 'Fungsi 1: AIO (1:1)',
    };
  }

  if (isFourFive) {
    return {
      detectedCategory: 'story',
      ratioLabel: '4:5 (Portrait / Story Feed)',
      ratio,
      width,
      height,
      isExactRule: true,
      explanation: 'Sesuai aturan Story Product: Berukuran rasio 4:5 (Portrait)',
      ruleBadge: 'Fungsi 2: Story (4:5)',
    };
  }

  // Jika ukuran rasio non-standar (misal 9:16 atau custom):
  // Tentukan apakah lebih dekat ke orientasi portrait (Story) atau square (AIO)
  if (ratio < 0.9) {
    // Rasio vertikal/portrait (tinggi > lebar)
    return {
      detectedCategory: 'story',
      ratioLabel: `${width}×${height}px (${ratio.toFixed(2)}:1)`,
      ratio,
      width,
      height,
      isExactRule: false,
      explanation: `Rasio vertikal (${width}×${height}px) otomatis diarahkan ke Story Product (acuan standar 4:5).`,
      ruleBadge: 'Story (Mendekati 4:5)',
    };
  } else {
    // Rasio mendekati persegi / lanskap
    return {
      detectedCategory: 'aio',
      ratioLabel: `${width}×${height}px (${ratio.toFixed(2)}:1)`,
      ratio,
      width,
      height,
      isExactRule: false,
      explanation: `Rasio persegi/lanskap (${width}×${height}px) otomatis diarahkan ke AIO (acuan standar 1:1).`,
      ruleBadge: 'AIO (Mendekati 1:1)',
    };
  }
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
