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

  // Proxy replace/overwrite to Google Drive API
  app.patch('/api/drive/replace', rawBodyParser, async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: { message: 'Token otorisasi tidak ditemukan.' } });
      }

      const fileId = req.headers['x-file-id'] as string;
      if (!fileId) {
        return res.status(400).json({ error: { message: 'ID file target tidak ditemukan.' } });
      }

      const fileBuffer = req.body as Buffer;
      if (!fileBuffer || fileBuffer.length === 0) {
        return res.status(400).json({ error: { message: 'Data gambar kosong.' } });
      }

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

      const data = await driveRes.json();
      if (!driveRes.ok) {
        return res.status(driveRes.status).json(data);
      }

      return res.json(data);
    } catch (error: any) {
      console.error('Server drive replace error:', error);
      return res.status(500).json({
        error: { message: error.message || 'Terjadi kesalahan saat menimpa file di Google Drive' },
      });
    }
  });

  // Proxy delete file from Google Drive API with automatic trash fallback
  app.delete('/api/drive/delete', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: { message: 'Token otorisasi tidak ditemukan.' } });
      }

      const fileId = (req.headers['x-file-id'] as string) || (req.query.fileId as string);
      if (!fileId) {
        return res.status(400).json({ error: { message: 'ID file target tidak ditemukan.' } });
      }

      // Step 1: Attempt hard delete
      const driveRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
        {
          method: 'DELETE',
          headers: {
            Authorization: authHeader,
          },
        }
      );

      if (driveRes.ok || driveRes.status === 204) {
        return res.json({ success: true, message: 'File berhasil dihapus dari Google Drive' });
      }

      // Step 2: Fallback to moving to trash if hard delete is restricted
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

      if (trashRes.ok || trashRes.status === 204) {
        return res.json({ success: true, message: 'File berhasil dipindahkan ke tempat sampah Google Drive' });
      }

      const data = await trashRes.json().catch(() => ({}));
      return res.status(trashRes.status).json(data);
    } catch (error: any) {
      console.error('Server drive delete error:', error);
      return res.status(500).json({
        error: { message: error.message || 'Terjadi kesalahan saat menghapus file di Google Drive' },
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
