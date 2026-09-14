export type FolderCategory = 'aio' | 'story';

export interface TargetFolderConfig {
  id: FolderCategory;
  name: string;
  folderId: string;
  folderUrl: string;
  badgeLabel: string;
  description: string;
  expectedRatio: '1:1' | '4:5';
  ratioDescription: string;
  colorTheme: 'indigo' | 'emerald';
  badgeClass: string;
  pillClass: string;
  borderClass: string;
  activeBorderClass: string;
  activeBgClass: string;
  iconBgClass: string;
  buttonClass: string;
}

export interface ImageRatioInfo {
  width: number;
  height: number;
  ratio: number;
  ratioLabel: string;
  isMatchingTarget: boolean;
  suggestedCategory?: FolderCategory;
  warningMessage?: string;
}

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  thumbnailLink?: string;
  createdTime?: string;
  modifiedTime?: string;
  duplicateCount?: number;
  allMatches?: DriveFileInfo[];
}

export type FileValidationStatus =
  | 'pending'
  | 'checking_drive'
  | 'invalid_format'
  | 'duplicate_found'
  | 'ready'
  | 'uploading'
  | 'success'
  | 'error';

export interface UploadQueueItem {
  id: string;
  file: File;
  previewUrl: string;
  status: FileValidationStatus;
  statusMessage?: string;
  category?: FolderCategory;
  existingFile?: DriveFileInfo;
  ratioInfo?: ImageRatioInfo;
  uploadProgress: number;
  uploadedDriveUrl?: string;
  uploadedFileId?: string;
  error?: string;
  productName?: string;
}

export interface StockProduct {
  rowNumber: number;
  sku: string;
  productName: string;
  category?: string;
  brand?: string;
  variationGroup?: string;
  variationSkuList?: string[];
  storyId?: string;
  storyDate?: string;
  aioId?: string;
  aioDate?: string;
  hasStory: boolean;
  hasAio: boolean;
  isComplete: boolean;
  missingCategory: 'both' | 'story' | 'aio' | 'none';
  storySource?: 'direct' | 'variation';
  storySharedFromSku?: string;
}

export type MissionFilter = 'all' | 'missing_both' | 'missing_aio' | 'missing_story' | 'complete';
