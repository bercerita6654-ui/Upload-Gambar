import React from 'react';
import { FolderCategory } from '../types';
import { TARGET_FOLDERS } from '../config/driveConfig';
import {
  Boxes,
  ShoppingBag,
  ExternalLink,
  Folder,
  CheckCircle2,
  Ratio,
  Square,
  RectangleVertical,
} from 'lucide-react';

interface FolderSelectorProps {
  selectedCategory: FolderCategory;
  onSelectCategory: (category: FolderCategory) => void;
  folderFileCount?: {
    aio: number;
    story: number;
  };
  queueCount?: {
    aio: number;
    story: number;
  };
}

export const FolderSelector: React.FC<FolderSelectorProps> = ({
  selectedCategory,
  onSelectCategory,
  folderFileCount,
  queueCount,
}) => {
  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <span>Pilih Menu Folder Tujuan</span>
            <span className="text-[11px] font-normal text-slate-500">
              (Divalidasi dengan warna, ikon, &amp; acuan rasio gambar)
            </span>
          </h2>
          <p className="text-xs text-slate-500">
            AIO menggunakan rasio <strong>1:1 (Persegi)</strong>, sedangkan Story Product menggunakan rasio <strong>4:5 (Portrait)</strong>.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* 1. Menu Gambar AIO (INDIGO THEME + RATIO 1:1) */}
        {(() => {
          const config = TARGET_FOLDERS.aio;
          const isSelected = selectedCategory === 'aio';

          return (
            <div
              id="folder-card-aio"
              onClick={() => onSelectCategory('aio')}
              className={`relative p-4 rounded-2xl border-2 transition-all cursor-pointer text-left ${
                isSelected
                  ? 'bg-indigo-50/80 border-indigo-600 shadow-md ring-3 ring-indigo-500/15 scale-[1.008]'
                  : 'bg-white border-slate-200/90 hover:border-indigo-300 hover:bg-indigo-50/20 shadow-xs'
              }`}
            >
              {/* Category Marker Strip */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3.5">
                  {/* Distinct AIO Icon: Boxes in Royal Indigo */}
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-xs transition-transform ${
                      isSelected
                        ? 'bg-indigo-600 text-white scale-105'
                        : 'bg-indigo-100 text-indigo-700'
                    }`}
                  >
                    <Boxes className="w-6 h-6" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold font-mono tracking-wider px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200">
                        FOLDER 1
                      </span>
                      <h3 className="font-bold text-base text-slate-900">
                        {config.name}
                      </h3>
                      {isSelected && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white shadow-xs">
                          <CheckCircle2 className="w-3 h-3" />
                          Aktif Dipilih
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-1 line-clamp-1">
                      {config.description}
                    </p>
                  </div>
                </div>

                <a
                  href={config.folderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-2 rounded-xl text-indigo-400 hover:text-indigo-700 hover:bg-indigo-100/60 transition-colors shrink-0"
                  title="Buka Folder Gambar AIO di Google Drive"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>

              {/* Ratio Rule Callout Tag */}
              <div className="mt-3 inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-indigo-100/90 text-indigo-900 border border-indigo-200/80 text-xs font-bold">
                <Square className="w-3.5 h-3.5 text-indigo-600" />
                <span>Acuan Rasio: 1:1 (Persegi)</span>
                <span className="font-normal text-[11px] text-indigo-700">cth: 1080×1080</span>
              </div>

              {/* Bottom detail pill */}
              <div className="mt-3 pt-2.5 border-t border-indigo-200/60 flex items-center justify-between text-[11px] text-slate-600">
                <div className="flex items-center gap-1.5 font-mono truncate max-w-[200px] sm:max-w-[260px] text-indigo-900/80">
                  <Folder className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="truncate">ID: {config.folderId}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {queueCount && queueCount.aio > 0 && (
                    <span className="font-bold text-indigo-800 bg-indigo-200/80 px-2 py-0.5 rounded-md border border-indigo-300 text-[10px]">
                      {queueCount.aio} Antrean AIO
                    </span>
                  )}
                  {folderFileCount && folderFileCount.aio !== undefined && (
                    <span className="font-semibold text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded-md">
                      {folderFileCount.aio} File di Drive
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* 2. Menu Gambar Story Product (EMERALD THEME + RATIO 4:5) */}
        {(() => {
          const config = TARGET_FOLDERS.story;
          const isSelected = selectedCategory === 'story';

          return (
            <div
              id="folder-card-story"
              onClick={() => onSelectCategory('story')}
              className={`relative p-4 rounded-2xl border-2 transition-all cursor-pointer text-left ${
                isSelected
                  ? 'bg-emerald-50/80 border-emerald-600 shadow-md ring-3 ring-emerald-500/15 scale-[1.008]'
                  : 'bg-white border-slate-200/90 hover:border-emerald-300 hover:bg-emerald-50/20 shadow-xs'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3.5">
                  {/* Distinct Story Icon: ShoppingBag in Vibrant Emerald */}
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-xs transition-transform ${
                      isSelected
                        ? 'bg-emerald-600 text-white scale-105'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    <ShoppingBag className="w-6 h-6" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold font-mono tracking-wider px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                        FOLDER 2
                      </span>
                      <h3 className="font-bold text-base text-slate-900">
                        {config.name}
                      </h3>
                      {isSelected && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white shadow-xs">
                          <CheckCircle2 className="w-3 h-3" />
                          Aktif Dipilih
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-1 line-clamp-1">
                      {config.description}
                    </p>
                  </div>
                </div>

                <a
                  href={config.folderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-2 rounded-xl text-emerald-400 hover:text-emerald-700 hover:bg-emerald-100/60 transition-colors shrink-0"
                  title="Buka Folder Story Product di Google Drive"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>

              {/* Ratio Rule Callout Tag */}
              <div className="mt-3 inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-emerald-100/90 text-emerald-900 border border-emerald-200/80 text-xs font-bold">
                <RectangleVertical className="w-3.5 h-3.5 text-emerald-600" />
                <span>Acuan Rasio: 4:5 (Portrait)</span>
                <span className="font-normal text-[11px] text-emerald-700">cth: 1080×1350</span>
              </div>

              {/* Bottom detail pill */}
              <div className="mt-3 pt-2.5 border-t border-emerald-200/60 flex items-center justify-between text-[11px] text-slate-600">
                <div className="flex items-center gap-1.5 font-mono truncate max-w-[200px] sm:max-w-[260px] text-emerald-900/80">
                  <Folder className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="truncate">ID: {config.folderId}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {queueCount && queueCount.story > 0 && (
                    <span className="font-bold text-emerald-800 bg-emerald-200/80 px-2 py-0.5 rounded-md border border-emerald-300 text-[10px]">
                      {queueCount.story} Antrean Story
                    </span>
                  )}
                  {folderFileCount && folderFileCount.story !== undefined && (
                    <span className="font-semibold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                      {folderFileCount.story} File di Drive
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
