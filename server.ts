import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Parser for raw binary image uploads (scoped only to upload and replace routes)
  const rawBodyParser = express.raw({
    type: '*/*',
    limit: '50mb',
  });

  app.use(express.json());

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Call & Diagnose Google Apps Script Web App Endpoint
  app.all('/api/sync/call-appsscript', async (req, res) => {
    try {
      const scriptUrl =
        (req.query.url as string) ||
        (req.body && req.body.url) ||
        'https://script.google.com/macros/s/AKfycbzjPVi5VEr3RU1Ixs7LwAFKiX9hUYlphq0V9k3WIacJjxa7cJvhIVHRwop-cofQmjUE4Q/exec';
      const action = (req.query.action as string) || (req.body && req.body.action) || 'all';
      const sheet = (req.query.sheet as string) || (req.body && req.body.sheet) || 'STOCK LIST';

      const urlObj = new URL(scriptUrl);
      urlObj.searchParams.set('action', action);
      urlObj.searchParams.set('sheet', sheet);
      const fullUrl = urlObj.toString();

      const startTime = Date.now();
      const response = await fetch(fullUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          Accept: 'application/json, text/html, */*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AI-Studio-Drive-Sync/1.0',
        },
      });

      const responseTimeMs = Date.now() - startTime;
      const finalUrl = response.url || fullUrl;
      const httpStatus = response.status;
      const rawText = await response.text();

      // Decode basic HTML entities
      const decodeHtml = (str: string) =>
        str
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

      // Extract error text from Google Apps Script HTML page
      let extractedError = '';
      const divMatch = rawText.match(/<div[^>]*style=["'][^"']*text-align:\s*center[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
      if (divMatch && divMatch[1].trim()) {
        extractedError = decodeHtml(divMatch[1].replace(/<[^>]+>/g, '').trim());
      } else {
        const errorMsgMatch = rawText.match(/<div[^>]*class=["']errorMessage["'][^>]*>([\s\S]*?)<\/div>/i);
        if (errorMsgMatch && errorMsgMatch[1].trim()) {
          extractedError = decodeHtml(errorMsgMatch[1].replace(/<[^>]+>/g, '').trim());
        }
      }

      // Try JSON parsing
      let parsedJson: any = null;
      try {
        parsedJson = JSON.parse(rawText);
      } catch {
        // Not JSON
      }

      // Classification logic
      let category: 'BERHASIL' | 'KREDENSIAL_AKSES' | 'STRUKTUR_SHEET' | 'KODE_APPS_SCRIPT' | 'ENDPOINT_URL' | 'UNKNOWN' = 'UNKNOWN';
      let categoryLabel = 'Diagnostik Apps Script';
      let title = '';
      let detail = '';
      let suggestedFix: string[] = [];
      let isSuccess = false;

      const lowerText = rawText.toLowerCase();
      const lowerFinalUrl = finalUrl.toLowerCase();

      if (parsedJson && parsedJson.status === 'success') {
        isSuccess = true;
        category = 'BERHASIL';
        categoryLabel = 'Sinkronisasi Berhasil';
        title = 'Apps Script Berhasil Dieksekusi';
        detail = parsedJson.message || 'Perintah sinkronisasi berhasil diterima dan diproses oleh Google Apps Script.';
        suggestedFix = ['Data di spreadsheet telah diperbarui sesuai file di Google Drive.'];
      } else if (
        httpStatus === 401 ||
        httpStatus === 403 ||
        lowerFinalUrl.includes('accounts.google.com') ||
        lowerText.includes('sign in - google accounts') ||
        lowerText.includes('accounts.google.com') ||
        lowerText.includes('script requires authorization') ||
        lowerText.includes('you do not have permission') ||
        lowerText.includes('permission denied')
      ) {
        category = 'KREDENSIAL_AKSES';
        categoryLabel = 'Masalah Kredensial / Hak Akses';
        title = 'Akses Ditolak / Memerlukan Autentikasi Google';
        detail =
          'Google Apps Script menolak permintaan karena memerlukan login atau hak akses belum dibuka untuk umum (Anyone).';
        suggestedFix = [
          'Buka Google Spreadsheet > menu Ekstensi > Apps Script.',
          'Klik tombol biru "Deploy" di kanan atas > pilih "Kelola deployment" (Manage deployments).',
          'Klik ikon Pensil (Edit) pada deployment aktif.',
          'Ubah setelan "Yang memiliki akses" (Who has access) menjadi "Siapa saja" (Anyone).',
          'Pada pilihan Versi (Version), WAJIB pilih "Versi baru" (New version), lalu klik "Deploy".',
          'Pastikan akun pemilik Apps Script memiliki hak akses Editor ke spreadsheet target.',
        ];
      } else if (
        extractedError.includes('SyntaxError') ||
        lowerText.includes('syntaxerror') ||
        lowerText.includes('has already been declared') ||
        lowerText.includes('script function not found: doget') ||
        lowerText.includes('referenceerror') ||
        lowerText.includes('typeerror')
      ) {
        category = 'KODE_APPS_SCRIPT';
        categoryLabel = 'Masalah Kode / Syntax Apps Script';
        if (extractedError.includes('has already been declared') || lowerText.includes('has already been declared')) {
          title = 'Variabel Duplikat di File Script (SyntaxError)';
          detail =
            extractedError ||
            "SyntaxError: Identifier 'SPREADSHEET_ID' has already been declared. Terdapat variabel ganda di file script Anda.";
          suggestedFix = [
            'Buka editor Apps Script, periksa daftar file .gs di panel kiri.',
            'Hapus file lama/duplikat (misalnya file bernama "Update") yang mendeklarasikan nama variabel yang sama.',
            'Pastikan kode hanya berada di 1 file bersih, lalu buat Deployment Baru (New version).',
          ];
        } else if (lowerText.includes('doget')) {
          title = 'Fungsi doGet Tidak Ditemukan';
          detail = 'Versi deployment yang sedang tayang belum memuat fungsi doGet(e).';
          suggestedFix = [
            'Pastikan fungsi doGet(e) sudah tersimpan di file .gs.',
            'Klik Deploy > Manage deployments > Edit > pilih Version: "New version" > klik Deploy.',
          ];
        } else {
          title = 'Error Eksekusi Kode Apps Script';
          detail = extractedError || 'Terjadi error kompilasi atau runtime pada script Google Apps Script.';
          suggestedFix = [
            'Periksa editor Apps Script pada menu Ekstensi > Apps Script.',
            'Periksa Execution Log di Apps Script untuk melihat letak baris yang error.',
            'Deploy ulang dengan "New version" setelah memperbaiki kode.',
          ];
        }
      } else if (
        lowerText.includes('tidak ditemukan') ||
        lowerText.includes('sheet') ||
        lowerText.includes('spreadsheet') ||
        lowerText.includes('openbyid') ||
        lowerText.includes('range') ||
        lowerText.includes('kolom') ||
        (parsedJson && parsedJson.status === 'error' && parsedJson.message && parsedJson.message.toLowerCase().includes('sheet'))
      ) {
        category = 'STRUKTUR_SHEET';
        categoryLabel = 'Masalah Struktur Sheet / Tab';
        title = 'Struktur Tab Sheet atau Spreadsheet Tidak Sesuai';
        detail =
          extractedError ||
          (parsedJson && parsedJson.message) ||
          'Tab sheet atau kolom yang ditargetkan tidak ditemukan pada Spreadsheet.';
        suggestedFix = [
          'Periksa tab di spreadsheet: pastikan ada tab bernama persis "STOCK LIST" (perhatikan huruf besar & spasi).',
          'Pastikan Kolom A berisi kode SKU produk (misal: 19163, 07945).',
          'Pastikan spreadsheet memiliki minimal kolom A sampai Y.',
          'Pastikan ID Spreadsheet adalah: 1mrD9sQK_Sffa1X1fzlCDmaJXs1Yj2q-XTNdi2sRGPos',
        ];
      } else if (httpStatus === 404) {
        category = 'ENDPOINT_URL';
        categoryLabel = 'URL Web App 404 Not Found';
        title = 'URL Web App Tidak Ditemukan';
        detail = 'URL Google Apps Script tidak valid atau deployment telah dihapus.';
        suggestedFix = [
          'Pastikan URL berakhiran "/exec" bukan "/dev".',
          'Buka Apps Script > Deploy > Manage deployments > salin ulang URL Web App yang aktif.',
        ];
      } else if (extractedError) {
        category = 'KODE_APPS_SCRIPT';
        categoryLabel = 'Error Pesan Google Apps Script';
        title = 'Google Apps Script Mengembalikan Error';
        detail = extractedError;
        suggestedFix = [
          'Buka Apps Script dan tinjau log eksekusi.',
          'Pastikan deployment versi terbaru sudah aktif.',
        ];
      } else {
        category = 'UNKNOWN';
        categoryLabel = 'Status Respons Tidak Biasa';
        title = `Respons HTTP ${httpStatus}`;
        detail = rawText.slice(0, 300) || 'Tidak ada konten respons yang dikembalikan.';
        suggestedFix = [
          'Cek kembali koneksi internet dan status server Google.',
          'Uji URL Web App langsung di tab browser baru.',
        ];
      }

      return res.json({
        success: isSuccess,
        httpStatus,
        category,
        categoryLabel,
        title,
        detail,
        rawResponse: extractedError || rawText.slice(0, 800),
        suggestedFix,
        responseTimeMs,
        url: fullUrl,
        timestamp: new Date().toISOString(),
        parsedJson,
      });
    } catch (err: any) {
      console.error('Call Apps Script proxy error:', err);
      return res.status(500).json({
        success: false,
        httpStatus: 500,
        category: 'ENDPOINT_URL',
        categoryLabel: 'Gagal Menghubungi Endpoint',
        title: 'Koneksi ke Apps Script Gagal',
        detail: err.message || 'Gagal mengirim permintaan ke Google Apps Script.',
        suggestedFix: [
          'Periksa apakah URL Web App aktif dan dapat diakses.',
          'Periksa koneksi jaringan server.',
        ],
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Fetch and Parse STOCK LIST rows + sheet "Variasi" from Google Sheets API
  // Column 1 (index 0) = SKU, Column 3 (index 2) = Nama Produk
  // Column V (index 21) = Story ID (4:5), Column X (index 23) = AIO ID (1:1)
  // Sheet "Variasi": Kelompok variasi produk yang berbagi gambar Story (4:5) yang sama
  app.get('/api/sheet/stock-products', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'Token otorisasi diperlukan.' });
      }

      const spreadsheetId = '1mrD9sQK_Sffa1X1fzlCDmaJXs1Yj2q-XTNdi2sRGPos';
      const sheetName = 'STOCK LIST';

      // 1. Fetch STOCK LIST A:AZ and Variasi A:Z in parallel or sequence
      const stockListUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(
        sheetName
      )}'!A:AZ`;

      const variasiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(
        'Variasi'
      )}'!A:Z`;

      const [stockRes, variasiRes] = await Promise.all([
        fetch(stockListUrl, {
          headers: {
            Authorization: authHeader,
            Accept: 'application/json',
          },
        }),
        fetch(variasiUrl, {
          headers: {
            Authorization: authHeader,
            Accept: 'application/json',
          },
        }).catch(() => null),
      ]);

      if (!stockRes.ok) {
        const err = await stockRes.json().catch(() => ({}));
        return res.status(stockRes.status).json({
          error: err?.error?.message || `Gagal membaca Google Sheet (${stockRes.status})`,
        });
      }

      const data = await stockRes.json();
      const rows: any[][] = data.values || [];

      if (rows.length <= 1) {
        return res.json({ products: [], total: 0 });
      }

      // Deteksi indeks kolom berdasarkan header baris ke-1
      const headerRow = (rows[0] || []).map((h: any) => String(h || '').trim().toLowerCase());
      
      // Cari kolom Kategori & Merk
      let categoryColIdx = headerRow.findIndex(
        (h: string) => h === 'kategori' || h.includes('kategori') || h === 'category'
      );
      let brandColIdx = headerRow.findIndex(
        (h: string) => h === 'merk' || h === 'merek' || h.includes('merk') || h === 'brand'
      );

      // Cari kolom Story ID dan AIO ID jika ada di header, atau default ke V (21) dan X (23)
      let storyColIdx = headerRow.findIndex(
        (h: string) => (h.includes('story') && (h.includes('id') || h.includes('drive'))) || h === 'id story'
      );
      if (storyColIdx === -1) storyColIdx = 21; // Kolom V

      let aioColIdx = headerRow.findIndex(
        (h: string) => (h.includes('aio') && (h.includes('id') || h.includes('drive'))) || h === 'id aio'
      );
      if (aioColIdx === -1) aioColIdx = 23; // Kolom X

      const cleanSku = (val: any): string => {
        if (!val) return '';
        let s = String(val).trim();
        const lastDot = s.lastIndexOf('.');
        if (lastDot > 0 && lastDot >= s.length - 5) {
          s = s.substring(0, lastDot);
        }
        return s.trim();
      };

      const isValidId = (val: any): boolean => {
        if (!val) return false;
        const s = String(val).trim();
        return s !== '' && s !== '-' && s !== 'null' && s !== '#N/A' && s !== 'undefined';
      };

      // 2. Parse sheet "Variasi" jika tersedia
      // Cari kolom yang bernama "Variasi" (case-insensitive) dan kolom SKU / Kode
      const variationMap: Record<string, string> = {}; // SKU -> variationGroup
      const groupToSkus: Record<string, string[]> = {}; // variationGroup -> SKU[]

      if (variasiRes && variasiRes.ok) {
        try {
          const varData = await variasiRes.json();
          const varRows: any[][] = varData.values || [];
          if (varRows.length > 1) {
            const header = varRows[0].map((h: any) => String(h || '').trim().toLowerCase());
            let variasiColIdx = header.findIndex(
              (h: string) => h === 'variasi' || h.includes('variasi')
            );
            let skuColIdx = header.findIndex(
              (h: string) => h === 'sku' || h.includes('kode') || h === 'id'
            );

            // Default fallback bila tidak ada header spesifik: Kolom 0 = SKU, Kolom 1 = Variasi
            if (variasiColIdx === -1) {
              variasiColIdx = header.length > 1 ? 1 : 0;
            }
            if (skuColIdx === -1) {
              skuColIdx = 0;
            }

            for (let v = 1; v < varRows.length; v++) {
              const vRow = varRows[v];
              const skuVal = cleanSku(vRow[skuColIdx]);
              const varVal = vRow[variasiColIdx] ? String(vRow[variasiColIdx]).trim() : '';

              if (skuVal && varVal) {
                variationMap[skuVal] = varVal;
                // Simpan juga versi angka murni
                const num = parseInt(skuVal, 10);
                if (!isNaN(num)) {
                  variationMap[num.toString()] = varVal;
                  variationMap[num.toString().padStart(5, '0')] = varVal;
                }

                if (!groupToSkus[varVal]) {
                  groupToSkus[varVal] = [];
                }
                if (!groupToSkus[varVal].includes(skuVal)) {
                  groupToSkus[varVal].push(skuVal);
                }
              }
            }
          }
        } catch (e) {
          console.warn('Gagal memproses sheet Variasi:', e);
        }
      }

      // 3. Baca semua row STOCK LIST dan kumpulkan direct story IDs
      const rawProducts: any[] = [];
      const directStoryBySku: Record<string, { id: string; date: string }> = {};

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const rawSku = row[0];
        const sku = cleanSku(rawSku);
        if (!sku) continue;

        // Kolom 3 = Index 2 = Nama Produk
        const productName = (row[2] ? String(row[2]) : '').trim();

        // Kategori & Merk
        const categoryVal =
          categoryColIdx !== -1 && row[categoryColIdx] ? String(row[categoryColIdx]).trim() : '';
        const brandVal =
          brandColIdx !== -1 && row[brandColIdx] ? String(row[brandColIdx]).trim() : '';

        // Story ID & Date
        const storyId = row[storyColIdx] ? String(row[storyColIdx]).trim() : '';
        const storyDate = row[storyColIdx + 1] ? String(row[storyColIdx + 1]).trim() : '';

        // AIO ID & Date
        const aioId = row[aioColIdx] ? String(row[aioColIdx]).trim() : '';
        const aioDate = row[aioColIdx + 1] ? String(row[aioColIdx + 1]).trim() : '';

        const hasDirectStory = isValidId(storyId);
        if (hasDirectStory) {
          directStoryBySku[sku] = { id: storyId, date: storyDate };
          const num = parseInt(sku, 10);
          if (!isNaN(num)) {
            directStoryBySku[num.toString()] = { id: storyId, date: storyDate };
            directStoryBySku[num.toString().padStart(5, '0')] = { id: storyId, date: storyDate };
          }
        }

        rawProducts.push({
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

      // 4. Hubungkan Story ID dari Variasi jika SKU belum memiliki Story ID langsung
      const products = rawProducts.map((p) => {
        const varGroup = variationMap[p.sku];
        const variationSkuList = varGroup ? groupToSkus[varGroup] || [] : undefined;

        let effectiveStoryId = p.directStoryId;
        let effectiveStoryDate = p.directStoryDate;
        let storySource: 'direct' | 'variation' = 'direct';
        let storySharedFromSku: string | undefined = undefined;

        if (isValidId(p.directStoryId)) {
          storySource = 'direct';
        } else if (varGroup && variationSkuList && variationSkuList.length > 0) {
          // Cari apakah ada SKU lain dalam variasi yang sama yang sudah punya Story ID
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

      // Kumpulkan daftar opsi Brand dan Kategori unik
      const categoriesSet = new Set<string>();
      const brandsSet = new Set<string>();
      products.forEach((p) => {
        if (p.category) categoriesSet.add(p.category);
        if (p.brand) brandsSet.add(p.brand);
      });

      return res.json({
        products,
        total: products.length,
        completeCount: products.filter((p) => p.isComplete).length,
        missingAioCount: products.filter((p) => !p.hasAio).length,
        missingStoryCount: products.filter((p) => !p.hasStory).length,
        missingBothCount: products.filter((p) => !p.hasAio && !p.hasStory).length,
        hasVariationSheet: !!(variasiRes && variasiRes.ok),
        variationGroupCount: Object.keys(groupToSkus).length,
        availableCategories: Array.from(categoriesSet).sort(),
        availableBrands: Array.from(brandsSet).sort(),
      });
    } catch (err: any) {
      console.error('Error fetching stock products:', err);
      return res.status(500).json({ error: err.message || 'Gagal memproses data produk.' });
    }
  });

  // Proxy upload to Google Drive API (Bypasses all browser CORS restrictions)
  app.post('/api/drive/upload', rawBodyParser, async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: { message: 'Token otorisasi tidak ditemukan.' } });
      }

      const folderId = req.headers['x-folder-id'] as string;
      const fileName = decodeURIComponent((req.headers['x-file-name'] as string) || 'image.png');

      if (!folderId) {
        return res.status(400).json({ error: { message: 'ID folder target tidak ditemukan.' } });
      }

      const fileBuffer = req.body as Buffer;
      if (!fileBuffer || fileBuffer.length === 0) {
        return res.status(400).json({ error: { message: 'Data gambar kosong.' } });
      }

      const metadata = {
        name: fileName,
        mimeType: 'image/png',
        parents: [folderId],
      };

      const boundary = '----------NodeDriveBoundary' + Date.now().toString(36);
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelim = `\r\n--${boundary}--`;

      const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
      const mediaHeader = `${delimiter}Content-Type: image/png\r\n\r\n`;

      const bodyBuffer = Buffer.concat([
        Buffer.from(metadataPart, 'utf8'),
        Buffer.from(mediaHeader, 'utf8'),
        fileBuffer,
        Buffer.from(closeDelim, 'utf8'),
      ]);

      const driveRes = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink',
        {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': `multipart/related; boundary=${boundary}`,
            'Content-Length': bodyBuffer.length.toString(),
          },
          body: bodyBuffer,
        }
      );

      const data = await driveRes.json();
      if (!driveRes.ok) {
        return res.status(driveRes.status).json(data);
      }

      return res.json(data);
    } catch (error: any) {
      console.error('Server drive upload error:', error);
      return res.status(500).json({
        error: { message: error.message || 'Terjadi kesalahan saat mengunggah ke Google Drive' },
      });
    }
  });

  // Proxy replace/overwrite to Google Drive API (with smart recreate fallback if permissions restricted)
  app.patch('/api/drive/replace', rawBodyParser, async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: { message: 'Token otorisasi tidak ditemukan.' } });
      }

      const fileId = req.headers['x-file-id'] as string;
      const folderId = req.headers['x-folder-id'] as string;
      const fileName = decodeURIComponent((req.headers['x-file-name'] as string) || 'image.png');

      if (!fileId) {
        return res.status(400).json({ error: { message: 'ID file target tidak ditemukan.' } });
      }

      const fileBuffer = req.body as Buffer;
      if (!fileBuffer || fileBuffer.length === 0) {
        return res.status(400).json({ error: { message: 'Data gambar kosong.' } });
      }

      console.log(`[DRIVE REPLACE] Attempting binary patch for fileId: ${fileId}`);

      // Strategy 1: Direct binary content PATCH to existing fileId
      const driveRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true&fields=id,name,webViewLink`,
        {
          method: 'PATCH',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'image/png',
            'Content-Length': fileBuffer.length.toString(),
          },
          body: fileBuffer,
        }
      );

      if (driveRes.ok) {
        const data = await driveRes.json();
        console.log(`[DRIVE REPLACE] Direct PATCH succeeded for fileId: ${fileId}`);
        return res.json(data);
      }

      const patchErr = await driveRes.json().catch(() => ({}));
      console.warn(`[DRIVE REPLACE] Direct PATCH returned status ${driveRes.status}:`, patchErr);

      if (driveRes.status === 401) {
        return res.status(401).json({
          error: { message: 'Sesi login Google telah kedaluwarsa. Silakan Logout lalu Login kembali.' },
        });
      }

      // Strategy 2: If direct PATCH failed (e.g. 403 insufficientFilePermissions or 404),
      // perform Smart Replace: Create fresh file in target folder, then detach/trash the old file!
      if (folderId) {
        console.log(`[DRIVE REPLACE] Attempting Smart Fallback: creating new file in folder ${folderId}...`);
        const metadata = {
          name: fileName,
          mimeType: 'image/png',
          parents: [folderId],
        };

        const boundary = '----------NodeDriveBoundaryReplace' + Date.now().toString(36);
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelim = `\r\n--${boundary}--`;

        const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
        const mediaHeader = `${delimiter}Content-Type: image/png\r\n\r\n`;

        const bodyBuffer = Buffer.concat([
          Buffer.from(metadataPart, 'utf8'),
          Buffer.from(mediaHeader, 'utf8'),
          fileBuffer,
          Buffer.from(closeDelim, 'utf8'),
        ]);

        const createRes = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink',
          {
            method: 'POST',
            headers: {
              Authorization: authHeader,
              'Content-Type': `multipart/related; boundary=${boundary}`,
              'Content-Length': bodyBuffer.length.toString(),
            },
            body: bodyBuffer,
          }
        );

        if (createRes.ok) {
          const newFileData = await createRes.json();
          console.log(`[DRIVE REPLACE] Smart Fallback file created: ${newFileData.id}. Now cleaning old file ${fileId}...`);

          // Attempt removing old file in background
          try {
            await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
              method: 'DELETE',
              headers: { Authorization: authHeader },
            });
          } catch (delErr) {
            console.warn('[DRIVE REPLACE] Non-blocking: Could not hard delete old file:', delErr);
          }

          try {
            await fetch(
              `https://www.googleapis.com/drive/v3/files/${fileId}?removeParents=${encodeURIComponent(folderId)}&supportsAllDrives=true`,
              {
                method: 'PATCH',
                headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
              }
            );
          } catch (unlinkErr) {
            console.warn('[DRIVE REPLACE] Non-blocking: Could not unlink old file:', unlinkErr);
          }

          return res.json({
            ...newFileData,
            replacedOldFileId: fileId,
            isRecreated: true,
          });
        }
      }

      const errMsg = patchErr?.error?.message || `Gagal menimpa file di Google Drive (${driveRes.status})`;
      return res.status(driveRes.status).json({ error: { message: errMsg } });
    } catch (error: any) {
      console.error('Server drive replace error:', error);
      return res.status(500).json({
        error: { message: error.message || 'Terjadi kesalahan saat menimpa file di Google Drive' },
      });
    }
  });

  // Proxy delete file from Google Drive API with automatic multi-tier fallback (Hard Delete -> Trash -> Remove Parents)
  app.delete('/api/drive/delete', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Token otorisasi tidak ditemukan. Silakan login kembali dengan Google.',
          },
        });
      }

      const fileId = (req.headers['x-file-id'] as string) || (req.query.fileId as string);
      const folderId = (req.headers['x-folder-id'] as string) || (req.query.folderId as string);

      if (!fileId) {
        return res.status(400).json({
          error: { code: 'INVALID_PARAM', message: 'ID file target tidak ditemukan.' },
        });
      }

      console.log(`[DRIVE DELETE] Request deleting fileId: ${fileId}, folderId: ${folderId || 'none'}`);

      // Strategy 1: Attempt hard delete (permanent deletion)
      const driveRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
        {
          method: 'DELETE',
          headers: {
            Authorization: authHeader,
          },
        }
      );

      // If file is already gone (404), treat as success
      if (driveRes.status === 404) {
        console.log(`[DRIVE DELETE] File ${fileId} already not found (404), considered deleted.`);
        return res.json({
          success: true,
          message: 'File sudah tidak ada di Google Drive (sudah terhapus).',
        });
      }

      if (driveRes.ok || driveRes.status === 204) {
        console.log(`[DRIVE DELETE] Hard delete succeeded for ${fileId}`);
        return res.json({ success: true, message: 'File berhasil dihapus permanen dari Google Drive' });
      }

      const hardDeleteErr = await driveRes.json().catch(() => ({}));
      console.warn(`[DRIVE DELETE] Hard delete returned status ${driveRes.status}:`, hardDeleteErr);

      // If 401 Unauthorized, token expired
      if (driveRes.status === 401) {
        return res.status(401).json({
          error: {
            code: 'TOKEN_EXPIRED',
            message: 'Sesi login Google telah kedaluwarsa. Silakan Logout lalu Login kembali.',
          },
        });
      }

      // Strategy 2: Attempt moving to trash (soft delete)
      const trashRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
        {
          method: 'PATCH',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ trashed: true }),
        }
      );

      if (trashRes.status === 404) {
        return res.json({
          success: true,
          message: 'File sudah tidak ada di Google Drive (sudah terhapus).',
        });
      }

      if (trashRes.ok || trashRes.status === 204) {
        console.log(`[DRIVE DELETE] Trashed succeeded for ${fileId}`);
        return res.json({
          success: true,
          message: 'File berhasil dipindahkan ke tempat sampah Google Drive.',
        });
      }

      const trashErr = await trashRes.json().catch(() => ({}));
      console.warn(`[DRIVE DELETE] Trashing returned status ${trashRes.status}:`, trashErr);

      // Strategy 3: Remove from parent folder(s) (removeParents)
      // This is the standard Google Drive API approach when user is an Editor in a shared folder, but NOT the owner of the file!
      console.log(`[DRIVE DELETE] Attempting Strategy 3: removeParents for ${fileId}...`);

      const parentsToRemove: string[] = [];
      if (folderId) {
        parentsToRemove.push(folderId);
      }

      try {
        const metaRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,parents,owners,capabilities,trashed&supportsAllDrives=true`,
          {
            headers: { Authorization: authHeader },
          }
        );

        if (metaRes.status === 404) {
          return res.json({
            success: true,
            message: 'File sudah tidak ada di Google Drive (sudah terhapus).',
          });
        }

        if (metaRes.ok) {
          const meta = await metaRes.json();
          if (meta.trashed) {
            return res.json({
              success: true,
              message: 'File sudah berada di tempat sampah Google Drive.',
            });
          }
          if (Array.isArray(meta.parents)) {
            meta.parents.forEach((p: string) => {
              if (!parentsToRemove.includes(p)) parentsToRemove.push(p);
            });
          }
        }
      } catch (metaErr) {
        console.warn('[DRIVE DELETE] Error reading file meta:', metaErr);
      }

      if (parentsToRemove.length > 0) {
        for (const pId of parentsToRemove) {
          try {
            const removeRes = await fetch(
              `https://www.googleapis.com/drive/v3/files/${fileId}?removeParents=${encodeURIComponent(pId)}&supportsAllDrives=true`,
              {
                method: 'PATCH',
                headers: {
                  Authorization: authHeader,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({}),
              }
            );

            if (removeRes.ok || removeRes.status === 204 || removeRes.status === 404) {
              console.log(`[DRIVE DELETE] removeParents succeeded for ${fileId} from parent ${pId}`);
              return res.json({
                success: true,
                message: 'File berhasil dihapus dari folder Google Drive.',
              });
            }
          } catch (rErr) {
            console.warn(`[DRIVE DELETE] removeParents failed for parent ${pId}:`, rErr);
          }
        }
      }

      // If all strategies failed, compile human-readable error explanation
      const rawErrMsg =
        trashErr?.error?.message ||
        hardDeleteErr?.error?.message ||
        'Izin akun Google Anda tidak mencukupi untuk menghapus file ini.';

      let userFriendlyMsg = rawErrMsg;
      if (
        rawErrMsg.includes('insufficientFilePermissions') ||
        rawErrMsg.includes('insufficient permissions') ||
        rawErrMsg.includes('The user does not have sufficient permissions')
      ) {
        userFriendlyMsg =
          'Akun Google Anda tidak memiliki izin untuk menghapus file ini (hanya pemilik file atau editor folder yang dapat menghapus). Silakan pastikan akun Anda memiliki hak akses Editor ke folder ini, atau Logout lalu Login kembali untuk memperbarui izin Google Drive.';
      } else if (rawErrMsg.includes('Invalid Credentials') || rawErrMsg.includes('authError')) {
        userFriendlyMsg =
          'Kredensial login Google telah kedaluwarsa. Silakan Logout dan Login kembali untuk memperbarui akses.';
      }

      return res.status(403).json({
        error: {
          code: 'DELETE_RESTRICTED',
          message: userFriendlyMsg,
          rawError: rawErrMsg,
        },
      });
    } catch (error: any) {
      console.error('Server drive delete error:', error);
      return res.status(500).json({
        error: { message: error.message || 'Terjadi kesalahan sistem saat menghapus file di Google Drive' },
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
