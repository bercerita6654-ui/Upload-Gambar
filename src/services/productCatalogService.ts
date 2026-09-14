import { StockProduct } from '../types';

const LOCAL_STORAGE_CATALOG_KEY = 'drive_uploader_stock_catalog_v1';
const LOCAL_STORAGE_MAP_KEY = 'drive_uploader_sku_name_map_v1';

export interface StockCatalogResponse {
  products: StockProduct[];
  total: number;
  completeCount: number;
  missingAioCount: number;
  missingStoryCount: number;
  missingBothCount: number;
  lastUpdated?: string;
  skuMap: Record<string, string>;
  availableCategories?: string[];
  availableBrands?: string[];
}

/**
 * Normalizes SKU by stripping file extensions and whitespace
 * e.g. "11321.png" -> "11321", " 07945 " -> "07945"
 */
export function extractSkuFromFileName(fileName: string): string {
  if (!fileName) return '';
  let clean = fileName.trim();
  const lastDot = clean.lastIndexOf('.');
  if (lastDot > 0 && lastDot >= clean.length - 5) {
    clean = clean.substring(0, lastDot);
  }
  return clean.trim();
}

/**
 * Retrieves cached SKU-to-Product Name map from localStorage for fast initial render
 */
export function getCachedSkuMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_MAP_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Gagal membaca cache SKU:', e);
  }
  return {};
}

/**
 * Retrieves cached StockProduct array from localStorage for immediate display
 */
export function getCachedStockCatalog(): StockCatalogResponse | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CATALOG_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Gagal membaca cache catalog:', e);
  }
  return null;
}

/**
 * Fetches the stock products catalog from Google Sheet 'STOCK LIST'.
 * Uses server proxy `/api/sheet/stock-products` first, with direct Google Sheets API fallback.
 */
export async function fetchStockProducts(
  token?: string | null,
  forceRefresh = false
): Promise<StockCatalogResponse> {
  const cached = getCachedStockCatalog();
  if (!forceRefresh && cached && cached.products.length > 0) {
    if (!token) {
      return cached;
    }
  }

  let catalogData: StockCatalogResponse | null = null;

  // 1. Try server proxy endpoint
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch('/api/sheet/stock-products', { headers });

    if (res.ok) {
      const data = await res.json();
      const products: StockProduct[] = data.products || [];
      catalogData = {
        products,
        total: data.total || products.length,
        completeCount: data.completeCount || products.filter((p) => p.isComplete).length,
        missingAioCount: data.missingAioCount || products.filter((p) => !p.hasAio).length,
        missingStoryCount: data.missingStoryCount || products.filter((p) => !p.hasStory).length,
        missingBothCount:
          data.missingBothCount || products.filter((p) => !p.hasAio && !p.hasStory).length,
        lastUpdated: new Date().toISOString(),
        skuMap: {},
        availableCategories: data.availableCategories,
        availableBrands: data.availableBrands,
      };
    }
  } catch (proxyErr) {
    console.warn('Proxy /api/sheet/stock-products gagal, mencoba akses langsung ke Google Sheets API...', proxyErr);
  }

  // 2. Fallback to direct client-side Google Sheets API call
  if (!catalogData) {
    if (!token) {
      if (cached) return cached;
      return {
        products: [],
        total: 0,
        completeCount: 0,
        missingAioCount: 0,
        missingStoryCount: 0,
        missingBothCount: 0,
        lastUpdated: undefined,
        skuMap: {},
      };
    }

    const spreadsheetId = '1mrD9sQK_Sffa1X1fzlCDmaJXs1Yj2q-XTNdi2sRGPos';
    const sheetName = 'STOCK LIST';
    const directUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(
      sheetName
    )}'!A:AZ`;

    const variasiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(
      'Variasi'
    )}'!A:Z`;

    const [directRes, variasiRes] = await Promise.all([
      fetch(directUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }),
      fetch(variasiUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }).catch(() => null),
    ]);

    if (!directRes.ok) {
      const errObj = await directRes.json().catch(() => ({}));
      throw new Error(errObj?.error?.message || `Gagal mengambil data dari Google Sheet (${directRes.status})`);
    }

    const json = await directRes.json();
    const rows: unknown[][] = json.values || [];

    const isValidId = (val: unknown): boolean => {
      if (!val) return false;
      const s = String(val).trim();
      return s !== '' && s !== '-' && s !== 'null' && s !== '#N/A' && s !== 'undefined';
    };

    // Deteksi header kolom Kategori & Merk
    const headerRow = ((rows[0] as unknown[]) || []).map((h) => String(h || '').trim().toLowerCase());
    let categoryColIdx = headerRow.findIndex(
      (h) => h === 'kategori' || h.includes('kategori') || h === 'category'
    );
    let brandColIdx = headerRow.findIndex(
      (h) => h === 'merk' || h === 'merek' || h.includes('merk') || h === 'brand'
    );
    let storyColIdx = headerRow.findIndex(
      (h) => (h.includes('story') && (h.includes('id') || h.includes('drive'))) || h === 'id story'
    );
    if (storyColIdx === -1) storyColIdx = 21;
    let aioColIdx = headerRow.findIndex(
      (h) => (h.includes('aio') && (h.includes('id') || h.includes('drive'))) || h === 'id aio'
    );
    if (aioColIdx === -1) aioColIdx = 23;

    // Parse sheet "Variasi" if available
    const variationMap: Record<string, string> = {};
    const groupToSkus: Record<string, string[]> = {};

    if (variasiRes && variasiRes.ok) {
      try {
        const varJson = await variasiRes.json();
        const varRows: unknown[][] = varJson.values || [];
        if (varRows.length > 1) {
          const header = (varRows[0] || []).map((h) => String(h || '').trim().toLowerCase());
          let variasiColIdx = header.findIndex((h) => h === 'variasi' || h.includes('variasi'));
          let skuColIdx = header.findIndex((h) => h === 'sku' || h.includes('kode') || h === 'id');

          if (variasiColIdx === -1) variasiColIdx = header.length > 1 ? 1 : 0;
          if (skuColIdx === -1) skuColIdx = 0;

          for (let v = 1; v < varRows.length; v++) {
            const vRow = varRows[v];
            const skuVal = extractSkuFromFileName(String(vRow[skuColIdx] || ''));
            const varVal = vRow[variasiColIdx] ? String(vRow[variasiColIdx]).trim() : '';

            if (skuVal && varVal) {
              variationMap[skuVal] = varVal;
              const num = parseInt(skuVal, 10);
              if (!isNaN(num)) {
                variationMap[num.toString()] = varVal;
                variationMap[num.toString().padStart(5, '0')] = varVal;
              }
              if (!groupToSkus[varVal]) groupToSkus[varVal] = [];
              if (!groupToSkus[varVal].includes(skuVal)) groupToSkus[varVal].push(skuVal);
            }
          }
        }
      } catch (varErr) {
        console.warn('Gagal membaca variasi fallback:', varErr);
      }
    }

    const rawList: any[] = [];
    const directStoryBySku: Record<string, { id: string; date: string }> = {};

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rawSku = row[0];
      const sku = extractSkuFromFileName(String(rawSku || ''));
      if (!sku) continue;

      // Kolom 3 = Index 2 = Nama Produk
      const productName = (row[2] ? String(row[2]) : '').trim();

      const categoryVal =
        categoryColIdx !== -1 && row[categoryColIdx] ? String(row[categoryColIdx]).trim() : '';
      const brandVal =
        brandColIdx !== -1 && row[brandColIdx] ? String(row[brandColIdx]).trim() : '';

      // Kolom Story ID & Date
      const storyId = row[storyColIdx] ? String(row[storyColIdx]).trim() : '';
      const storyDate = row[storyColIdx + 1] ? String(row[storyColIdx + 1]).trim() : '';

      // Kolom AIO ID & Date
      const aioId = row[aioColIdx] ? String(row[aioColIdx]).trim() : '';
      const aioDate = row[aioColIdx + 1] ? String(row[aioColIdx + 1]).trim() : '';

      if (isValidId(storyId)) {
        directStoryBySku[sku] = { id: storyId, date: storyDate };
        const num = parseInt(sku, 10);
        if (!isNaN(num)) {
          directStoryBySku[num.toString()] = { id: storyId, date: storyDate };
          directStoryBySku[num.toString().padStart(5, '0')] = { id: storyId, date: storyDate };
        }
      }

      rawList.push({
        rowNumber: i + 1,
        sku,
        productName: productName || `Produk SKU ${sku}`,
        category: categoryVal,
        brand: brandVal,
        directStoryId: storyId,
        directStoryDate: storyDate,
        aioId,
        aioDate,
        hasAio: isValidId(aioId),
      });
    }

    const products: StockProduct[] = rawList.map((p) => {
      const varGroup = variationMap[p.sku];
      const variationSkuList = varGroup ? groupToSkus[varGroup] : undefined;

      let effectiveStoryId = p.directStoryId;
      let effectiveStoryDate = p.directStoryDate;
      let storySource: 'direct' | 'variation' = 'direct';
      let storySharedFromSku: string | undefined = undefined;

      if (isValidId(p.directStoryId)) {
        storySource = 'direct';
      } else if (varGroup && variationSkuList && variationSkuList.length > 0) {
        for (const otherSku of variationSkuList) {
          const found = directStoryBySku[otherSku];
          if (found && isValidId(found.id)) {
            effectiveStoryId = found.id;
            effectiveStoryDate = found.date;
            storySource = 'variation';
            storySharedFromSku = otherSku;
            break;
          }
        }
      }

      const hasStory = isValidId(effectiveStoryId);
      const hasAio = p.hasAio;
      const isComplete = hasStory && hasAio;

      let missingCategory: 'both' | 'story' | 'aio' | 'none' = 'none';
      if (!hasStory && !hasAio) {
        missingCategory = 'both';
      } else if (!hasStory) {
        missingCategory = 'story';
      } else if (!hasAio) {
        missingCategory = 'aio';
      }

      return {
        rowNumber: p.rowNumber,
        sku: p.sku,
        productName: p.productName,
        category: p.category,
        brand: p.brand,
        variationGroup: varGroup,
        variationSkuList,
        storyId: effectiveStoryId,
        storyDate: effectiveStoryDate,
        aioId: p.aioId,
        aioDate: p.aioDate,
        hasStory,
        hasAio,
        isComplete,
        missingCategory,
        storySource: hasStory ? storySource : undefined,
        storySharedFromSku,
      };
    });

    const catSet = new Set<string>();
    const brSet = new Set<string>();
    products.forEach((p) => {
      if (p.category) catSet.add(p.category);
      if (p.brand) brSet.add(p.brand);
    });

    catalogData = {
      products,
      total: products.length,
      completeCount: products.filter((p) => p.isComplete).length,
      missingAioCount: products.filter((p) => !p.hasAio).length,
      missingStoryCount: products.filter((p) => !p.hasStory).length,
      missingBothCount: products.filter((p) => !p.hasAio && !p.hasStory).length,
      lastUpdated: new Date().toISOString(),
      skuMap: {},
      availableCategories: Array.from(catSet).sort(),
      availableBrands: Array.from(brSet).sort(),
    };
  }

  // 3. Save to localStorage for instant UI response and product name lookup
  const skuMap: Record<string, string> = {};
  catalogData.products.forEach((p) => {
    if (p.sku && p.productName) {
      skuMap[p.sku] = p.productName;
      // Also map without leading zeroes or with 5-digit pad for flexible matching
      const num = parseInt(p.sku, 10);
      if (!isNaN(num)) {
        skuMap[num.toString()] = p.productName;
        skuMap[num.toString().padStart(5, '0')] = p.productName;
      }
    }
  });
  catalogData.skuMap = skuMap;

  try {
    localStorage.setItem(LOCAL_STORAGE_CATALOG_KEY, JSON.stringify(catalogData));
    localStorage.setItem(LOCAL_STORAGE_MAP_KEY, JSON.stringify(skuMap));
  } catch (e) {
    console.warn('Gagal menyimpan cache catalog:', e);
  }

  return catalogData;
}

/**
 * Looks up product name by SKU code from the SKU map.
 */
export function lookupProductName(skuOrFileName: string, skuMap: Record<string, string>): string | undefined {
  const clean = extractSkuFromFileName(skuOrFileName);
  if (!clean) return undefined;

  if (skuMap[clean]) return skuMap[clean];

  const num = parseInt(clean, 10);
  if (!isNaN(num)) {
    const rawNumStr = num.toString();
    const padStr = rawNumStr.padStart(5, '0');
    if (skuMap[padStr]) return skuMap[padStr];
    if (skuMap[rawNumStr]) return skuMap[rawNumStr];
  }

  return undefined;
}
