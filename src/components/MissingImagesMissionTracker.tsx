import React, { useState, useMemo } from 'react';
import {
  Target,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  FileSpreadsheet,
  Boxes,
  ShoppingBag,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Filter,
  ArrowUpDown,
  UploadCloud,
  FileImage,
  Layers,
  GitFork,
  Link,
  Info,
  Tag,
  Bookmark,
  RotateCcw,
} from 'lucide-react';
import { StockProduct, MissionFilter } from '../types';
import { SPREADSHEET_CONFIG, TARGET_FOLDERS } from '../config/driveConfig';

interface MissingImagesMissionTrackerProps {
  products: StockProduct[];
  isLoading: boolean;
  onRefresh: () => void;
  onSelectSkuForUpload?: (sku: string, targetCategory: 'aio' | 'story') => void;
  onShowToast?: (type: 'success' | 'error' | 'info', title: string, message: string) => void;
  lastUpdated?: string;
}

export const MissingImagesMissionTracker: React.FC<MissingImagesMissionTrackerProps> = ({
  products,
  isLoading,
  onRefresh,
  onSelectSkuForUpload,
  onShowToast,
  lastUpdated,
}) => {
  const [filter, setFilter] = useState<MissionFilter>('missing_both');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedSku, setCopiedSku] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  // Extract unique categories and brands from products
  const { categories, brands } = useMemo(() => {
    const catMap = new Map<string, number>();
    const brandMap = new Map<string, number>();

    products.forEach((p) => {
      const c = p.category?.trim();
      if (c) {
        catMap.set(c, (catMap.get(c) || 0) + 1);
      }
      const b = p.brand?.trim();
      if (b) {
        brandMap.set(b, (brandMap.get(b) || 0) + 1);
      }
    });

    return {
      categories: Array.from(catMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, count]) => ({ name, count })),
      brands: Array.from(brandMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, count]) => ({ name, count })),
    };
  }, [products]);

  // Calculate statistics (before or with category/brand filter)
  const stats = useMemo(() => {
    const total = products.length;
    const complete = products.filter((p) => p.isComplete).length;
    const missingAio = products.filter((p) => !p.hasAio).length;
    const missingStory = products.filter((p) => !p.hasStory).length;
    const missingBoth = products.filter((p) => !p.hasAio && !p.hasStory).length;
    const percentComplete = total > 0 ? Math.round((complete / total) * 100) : 0;

    return {
      total,
      complete,
      missingAio,
      missingStory,
      missingBoth,
      percentComplete,
    };
  }, [products]);

  // Filter and search
  const filteredProducts = useMemo(() => {
    let list = products;

    // Apply category filter
    if (filter === 'missing_both') {
      list = list.filter((p) => !p.hasAio && !p.hasStory);
    } else if (filter === 'missing_aio') {
      list = list.filter((p) => !p.hasAio);
    } else if (filter === 'missing_story') {
      list = list.filter((p) => !p.hasStory);
    } else if (filter === 'complete') {
      list = list.filter((p) => p.isComplete);
    }

    // Apply Sheet Kategori filter
    if (selectedCategory !== 'all') {
      list = list.filter(
        (p) => (p.category || '').toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    // Apply Sheet Merk filter
    if (selectedBrand !== 'all') {
      list = list.filter(
        (p) => (p.brand || '').toLowerCase() === selectedBrand.toLowerCase()
      );
    }

    // Apply search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.sku.toLowerCase().includes(q) ||
          p.productName.toLowerCase().includes(q) ||
          (p.category && p.category.toLowerCase().includes(q)) ||
          (p.brand && p.brand.toLowerCase().includes(q)) ||
          (p.variationGroup && p.variationGroup.toLowerCase().includes(q)) ||
          (p.storyId && p.storyId.toLowerCase().includes(q)) ||
          (p.aioId && p.aioId.toLowerCase().includes(q))
      );
    }

    return list;
  }, [products, filter, selectedCategory, selectedBrand, searchQuery]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(start, start + itemsPerPage);
  }, [filteredProducts, currentPage]);

  const handleCopyFileName = (sku: string) => {
    const fileName = `${sku}.png`;
    navigator.clipboard.writeText(fileName).then(() => {
      setCopiedSku(sku);
      if (onShowToast) {
        onShowToast('info', 'Nama File Disalin', `"${fileName}" siap digunakan untuk penamaan file.`);
      }
      setTimeout(() => setCopiedSku(null), 2000);
    });
  };

  const handleFilterChange = (newFilter: MissionFilter) => {
    setFilter(newFilter);
    setCurrentPage(1);
  };

  const resetAllFilters = () => {
    setFilter('all');
    setSelectedCategory('all');
    setSelectedBrand('all');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const hasActiveDropdownFilters = selectedCategory !== 'all' || selectedBrand !== 'all';

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_CONFIG.spreadsheetId}/edit#gid=0`;

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
      {/* Header Banner */}
      <div className="p-4 sm:p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border-b border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shadow-inner shrink-0">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white">
                  Misi Upload Gambar Produk
                </h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                  <Sparkles className="w-3 h-3 text-indigo-300" />
                  Sheet STOCK LIST
                </span>
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-400/30"
                  title="Story (4:5) mendukung pewarisan gambar antar produk dalam sheet Variasi"
                >
                  <GitFork className="w-3 h-3 text-purple-300" />
                  Sheet Variasi Terhubung
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Pantau SKU yang belum memiliki ID gambar di Google Drive. Selesaikan misi dengan mengunggah gambar sesuai rasio <strong className="text-indigo-200">1:1 (AIO)</strong> dan <strong className="text-emerald-200">4:5 (Story)</strong>.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 self-start md:self-center shrink-0">
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-white/10 hover:bg-white/15 active:bg-white/20 text-white rounded-xl border border-white/20 transition-all cursor-pointer disabled:opacity-50"
              title="Perbarui data terbaru dari Google Sheet"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Membaca Sheet...' : 'Segarkan Sheet'}</span>
            </button>

            <a
              href={sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Buka Sheet</span>
              <ExternalLink className="w-3 h-3 opacity-70" />
            </a>
          </div>
        </div>

        {/* Mission Progress Metric Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800/80">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-300">Kemajuan Kelengkapan Gambar Produk:</span>
              <span className="text-xs font-bold text-white">
                {stats.complete} dari {stats.total} SKU Lengkap ({stats.percentComplete}%)
              </span>
            </div>
            {lastUpdated && (
              <span className="text-[11px] text-slate-400">
                Terakhir disinkronkan: {new Date(lastUpdated).toLocaleTimeString('id-ID')}
              </span>
            )}
          </div>

          <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden p-0.5 border border-slate-700/60">
            <div
              className="bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${stats.percentComplete}%` }}
            />
          </div>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 border-b border-slate-200 bg-slate-50/50">
        <button
          type="button"
          onClick={() => handleFilterChange('all')}
          className={`p-4 text-left transition-colors cursor-pointer hover:bg-slate-100/80 ${
            filter === 'all' ? 'bg-white font-semibold ring-2 ring-indigo-500/20 ring-inset' : ''
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Total Produk</span>
            <Boxes className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900">{stats.total}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">SKU di Sheet STOCK LIST</div>
        </button>

        <button
          type="button"
          onClick={() => handleFilterChange('missing_both')}
          className={`p-4 text-left transition-colors cursor-pointer hover:bg-rose-50/50 ${
            filter === 'missing_both' ? 'bg-rose-50/80 ring-2 ring-rose-500/20 ring-inset' : ''
          }`}
        >
          <div className="flex items-center justify-between text-xs text-rose-600 mb-1">
            <span className="font-semibold">Belum Keduanya</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-rose-700">{stats.missingBoth}</div>
          <div className="text-[11px] text-rose-600/80 mt-0.5">Prioritas Tinggi (Kosong 1:1 &amp; 4:5)</div>
        </button>

        <button
          type="button"
          onClick={() => handleFilterChange('missing_aio')}
          className={`p-4 text-left transition-colors cursor-pointer hover:bg-indigo-50/50 ${
            filter === 'missing_aio' ? 'bg-indigo-50/80 ring-2 ring-indigo-500/20 ring-inset' : ''
          }`}
        >
          <div className="flex items-center justify-between text-xs text-indigo-600 mb-1">
            <span className="font-semibold">Butuh AIO (1:1)</span>
            <ShoppingBag className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-indigo-700">{stats.missingAio}</div>
          <div className="text-[11px] text-indigo-600/80 mt-0.5">Rasio Persegi (1:1)</div>
        </button>

        <button
          type="button"
          onClick={() => handleFilterChange('missing_story')}
          className={`p-4 text-left transition-all cursor-pointer hover:bg-emerald-50/70 relative ${
            filter === 'missing_story'
              ? 'bg-emerald-50/90 ring-2 ring-emerald-500/30 ring-inset shadow-xs'
              : ''
          }`}
        >
          <div className="flex items-center justify-between text-xs text-emerald-600 mb-1">
            <span className="font-semibold flex items-center gap-1">
              <span>Butuh Story (4:5)</span>
            </span>
            <div className="w-5 h-5 rounded-md bg-emerald-100/80 flex items-center justify-center text-emerald-600">
              <Layers className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-700">{stats.missingStory}</div>
          <div className="text-[11px] text-emerald-600/90 mt-0.5 flex items-center gap-1 font-medium">
            <span>Rasio Portrait (4:5)</span>
            <span className="text-[10px] text-emerald-700/70 bg-emerald-100/60 px-1 py-0.2 rounded font-normal">
              +Variasi
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleFilterChange('complete')}
          className={`p-4 text-left transition-colors cursor-pointer hover:bg-teal-50/50 col-span-2 sm:col-span-1 ${
            filter === 'complete' ? 'bg-teal-50/80 ring-2 ring-teal-500/20 ring-inset' : ''
          }`}
        >
          <div className="flex items-center justify-between text-xs text-teal-600 mb-1">
            <span className="font-semibold">Sudah Lengkap</span>
            <CheckCircle2 className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-teal-700">{stats.complete}</div>
          <div className="text-[11px] text-teal-600/80 mt-0.5">Lengkap 1:1 dan 4:5</div>
        </button>
      </div>

      {/* Control Filters & Search Bar */}
      <div className="p-4 sm:p-5 border-b border-slate-200 bg-white space-y-3">
        {/* Row 1: Status Filter Pills */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-slate-500 mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Status:
            </span>
            <button
              onClick={() => handleFilterChange('missing_both')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filter === 'missing_both'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              🚨 Kosong Keduanya ({stats.missingBoth})
            </button>
            <button
              onClick={() => handleFilterChange('missing_aio')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filter === 'missing_aio'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              📦 Perlu AIO 1:1 ({stats.missingAio})
            </button>
            <button
              onClick={() => handleFilterChange('missing_story')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filter === 'missing_story'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              📱 Perlu Story 4:5 ({stats.missingStory})
            </button>
            <button
              onClick={() => handleFilterChange('complete')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filter === 'complete'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              ✓ Lengkap ({stats.complete})
            </button>
            <button
              onClick={() => handleFilterChange('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filter === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              Semua ({stats.total})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full lg:w-80 shrink-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari SKU, Nama Produk, Merk, Kategori..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 placeholder-slate-400 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Secondary Dropdown Filters for Merk & Kategori from STOCK LIST */}
        <div className="flex items-center gap-2.5 flex-wrap pt-2.5 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500 font-medium shrink-0">
            <Tag className="w-3.5 h-3.5 text-indigo-500" />
            <span>Filter Sheet:</span>
          </div>

          {/* Filter Kategori */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="filter-kategori-select" className="text-slate-600 font-medium">
              Kategori:
            </label>
            <select
              id="filter-kategori-select"
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all cursor-pointer min-w-[140px]"
            >
              <option value="all">Semua Kategori ({categories.length ? categories.reduce((sum, c) => sum + c.count, 0) : stats.total})</option>
              {categories.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>
          </div>

          {/* Filter Merk */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="filter-merk-select" className="text-slate-600 font-medium">
              Merk:
            </label>
            <select
              id="filter-merk-select"
              value={selectedBrand}
              onChange={(e) => {
                setSelectedBrand(e.target.value);
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all cursor-pointer min-w-[140px]"
            >
              <option value="all">Semua Merk ({brands.length ? brands.reduce((sum, b) => sum + b.count, 0) : stats.total})</option>
              {brands.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name} ({b.count})
                </option>
              ))}
            </select>
          </div>

          {/* Active Filter Badges & Reset Button */}
          {(hasActiveDropdownFilters || searchQuery || filter !== 'all') && (
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <span className="text-slate-400 text-[11px]">
                Menampilkan <strong>{filteredProducts.length}</strong> dari {stats.total} produk
              </span>
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                title="Reset semua filter dan pencarian"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Filter
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
              <th className="py-3 px-4 w-16 text-center">No</th>
              <th className="py-3 px-4 w-32">Kode SKU</th>
              <th className="py-3 px-4">Nama Produk (Kolom 3)</th>
              <th className="py-3 px-4 w-48">Status AIO (1:1 Square)</th>
              <th className="py-3 px-4 w-48">Status Story (4:5 Portrait)</th>
              <th className="py-3 px-4 w-40 text-center">Aksi Misi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
                    <span className="font-medium text-slate-700">Membaca data katalog dari Sheet STOCK LIST...</span>
                    <span className="text-xs text-slate-400">Sinkronisasi ID Google Drive &amp; nama produk</span>
                  </div>
                </td>
              </tr>
            ) : paginatedProducts.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    <span className="font-bold text-slate-800 text-sm">Tidak Ada SKU yang Cocok</span>
                    <span className="text-xs text-slate-500 max-w-sm">
                      {searchQuery
                        ? `Pencarian "${searchQuery}" tidak menemukan SKU atau nama produk.`
                        : selectedCategory !== 'all' || selectedBrand !== 'all'
                        ? `Tidak ada produk yang cocok dengan filter Kategori: "${selectedCategory}" atau Merk: "${selectedBrand}".`
                        : filter === 'complete'
                        ? 'Belum ada produk yang berstatus lengkap.'
                        : 'Semua SKU pada filter ini telah memiliki ID gambar di Google Drive!'}
                    </span>
                    {(selectedCategory !== 'all' || selectedBrand !== 'all' || searchQuery) && (
                      <button
                        type="button"
                        onClick={resetAllFilters}
                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset Semua Filter
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginatedProducts.map((p, idx) => {
                const globalIndex = (currentPage - 1) * itemsPerPage + idx + 1;
                const isCopied = copiedSku === p.sku;

                return (
                  <tr
                    key={`${p.sku}-${idx}`}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
                    {/* Index */}
                    <td className="py-3 px-4 text-center text-slate-400 font-mono text-[11px]">
                      {globalIndex}
                    </td>

                    {/* SKU */}
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200">
                          {p.sku}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyFileName(p.sku)}
                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors cursor-pointer"
                          title="Salin nama file [SKU].png"
                        >
                          {isCopied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Product Name (Kolom 3) */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors">
                        {p.productName}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {p.category && (
                          <span
                            onClick={() => {
                              setSelectedCategory(p.category || 'all');
                              setCurrentPage(1);
                            }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 cursor-pointer transition-colors"
                            title={`Kategori: ${p.category} (Klik untuk filter)`}
                          >
                            <Tag className="w-2.5 h-2.5 text-blue-500" />
                            {p.category}
                          </span>
                        )}
                        {p.brand && (
                          <span
                            onClick={() => {
                              setSelectedBrand(p.brand || 'all');
                              setCurrentPage(1);
                            }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 cursor-pointer transition-colors"
                            title={`Merk: ${p.brand} (Klik untuk filter)`}
                          >
                            <Bookmark className="w-2.5 h-2.5 text-amber-500" />
                            {p.brand}
                          </span>
                        )}
                        {p.variationGroup && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200"
                            title={`Grup Variasi: ${p.variationGroup} (${p.variationSkuList?.length || 1} SKU)`}
                          >
                            <GitFork className="w-2.5 h-2.5 text-purple-500" />
                            Variasi: {p.variationGroup}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400">
                          Baris {p.rowNumber}
                        </span>
                      </div>
                    </td>

                    {/* AIO (1:1) Status */}
                    <td className="py-3 px-4">
                      {p.hasAio ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 w-fit">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Tersedia (1:1)
                          </span>
                          {p.aioId && (
                            <a
                              href={`https://drive.google.com/file/d/${p.aioId}/view`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-slate-400 hover:text-indigo-600 truncate font-mono max-w-[170px] inline-flex items-center gap-1"
                              title={`ID: ${p.aioId} (Klik untuk lihat di Google Drive)`}
                            >
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                              {p.aioId}
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 w-fit">
                          <AlertTriangle className="w-3 h-3 text-rose-500" />
                          Belum Ada (1:1)
                        </span>
                      )}
                    </td>

                    {/* Story (4:5) Status */}
                    <td className="py-3 px-4">
                      {p.hasStory ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 w-fit">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Tersedia (4:5)
                            </span>
                            {p.storySource === 'variation' && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200"
                                title={`Menggunakan gambar variasi dari SKU ${p.storySharedFromSku}`}
                              >
                                <Link className="w-2.5 h-2.5 text-purple-600" />
                                Dari Variasi ({p.storySharedFromSku})
                              </span>
                            )}
                          </div>
                          {p.storyId && (
                            <a
                              href={`https://drive.google.com/file/d/${p.storyId}/view`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-slate-400 hover:text-indigo-600 truncate font-mono max-w-[170px] inline-flex items-center gap-1"
                              title={`ID: ${p.storyId} (Klik untuk lihat di Google Drive)`}
                            >
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                              {p.storyId}
                            </a>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 w-fit">
                            <AlertTriangle className="w-3 h-3 text-amber-500" />
                            Belum Ada (4:5)
                          </span>
                          {p.variationGroup && (
                            <span className="text-[10px] text-purple-600 font-medium">
                              Variasi: {p.variationGroup}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleCopyFileName(p.sku)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-2xs transition-all cursor-pointer flex items-center gap-1"
                          title="Salin format nama file PNG untuk SKU ini"
                        >
                          {isCopied ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span className="text-emerald-700">Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 text-slate-500" />
                              <span>Salin .png</span>
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
        <div>
          Menampilkan{' '}
          <span className="font-bold text-slate-900">
            {filteredProducts.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}
          </span>{' '}
          -{' '}
          <span className="font-bold text-slate-900">
            {Math.min(currentPage * itemsPerPage, filteredProducts.length)}
          </span>{' '}
          dari <span className="font-bold text-slate-900">{filteredProducts.length}</span> SKU produk
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            title="Halaman Sebelumnya"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-medium text-slate-700 px-2">
            Halaman {currentPage} dari {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            title="Halaman Selanjutnya"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
