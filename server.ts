import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Support raw binary uploads up to 50MB for image transfers
  app.use(
    '/api/drive',
    express.raw({
      type: '*/*',
      limit: '50mb',
    })
  );

  app.use(express.json());

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Proxy upload to Google Drive API (Bypasses all browser CORS restrictions)
  app.post('/api/drive/upload', async (req, res) => {
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
  app.patch('/api/drive/replace', async (req, res) => {
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
