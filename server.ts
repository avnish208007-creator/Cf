import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { handleDiscoveryRequest } from './src/server/discovery/handler';
import { handleSourcesRequest } from './src/server/discovery/sourcesHandler';
import {
  handleStartProcessing,
  handleGetJobStatus,
  handleCancelJob,
} from './src/server/processing/processingHandler';
import { resolveYtDlp, resolveFfmpeg, resolveFfprobe } from './src/server/utils/binaries';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // CORS middleware for iframe preview and cross-origin requests
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization'
    );
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Serve processed uploads statically
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir));

  // Discovery server endpoints
  app.options('/api/discover', (req, res) => res.sendStatus(204));
  app.post('/api/discover', handleDiscoveryRequest);
  app.get('/api/discover', (req, res) => {
    res.json({ status: 'ok', message: 'Discovery endpoint active.' });
  });

  // Sources endpoints
  app.get('/api/sources', handleSourcesRequest);

  // Processing pipeline endpoints
  app.post('/api/processing/start', handleStartProcessing);
  app.get('/api/processing/jobs/:jobId', handleGetJobStatus);
  app.post('/api/processing/cancel/:jobId', handleCancelJob);

  // Health check endpoint (Problem 23)
  app.get('/api/health', (req, res) => {
    const ytDlpPath = resolveYtDlp();
    const ffmpegPath = resolveFfmpeg();
    const ffprobePath = resolveFfprobe();

    const ytDlpExists = ytDlpPath === 'yt-dlp' || fs.existsSync(ytDlpPath);
    const ffmpegExists = ffmpegPath === 'ffmpeg' || fs.existsSync(ffmpegPath);
    const ffprobeExists = ffprobePath === 'ffprobe' || fs.existsSync(ffprobePath);
    const geminiKeySet = Boolean(process.env.GEMINI_API_KEY);

    res.json({
      status: 'ok',
      service: 'clipflow-processing',
      firebase: true,
      discovery: true,
      processing: {
        ytDlp: ytDlpExists,
        ffmpeg: ffmpegExists,
        ffprobe: ffprobeExists,
        whisper: true,
        gemini: geminiKeySet,
        storage: true,
      },
    });
  });

  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    // Mount Vite dev server in middleware mode
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ClipFlow server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting ClipFlow server:', err);
  process.exit(1);
});


