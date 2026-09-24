import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleDiscoveryRequest } from './src/server/discovery/handler';
import { handleSourcesRequest } from './src/server/discovery/sourcesHandler';
import { handleAnalyzeRequest } from './src/server/moment-detection/analyzeHandler';
import { handleCandidatesRequest } from './src/server/moment-detection/candidatesHandler';
import { handleCandidateSelectRequest } from './src/server/moment-detection/selectHandler';
import { handleClipsRequest } from './src/server/rendering/clipsHandler';
import { handleValidateExistingClipsRequest } from './src/server/rendering/adminHandler';
import {
  handleRenderRequest,
  handleRenderJobStatus,
  handleMediaStreaming,
} from './src/server/rendering/renderHandler';

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

  // Discovery server endpoints (supports both Netlify Function route and standard API proxy route)
  app.options('/api/discover', (req, res) => res.sendStatus(204));
  app.options('/.netlify/functions/discover', (req, res) => res.sendStatus(204));
  app.post('/api/discover', handleDiscoveryRequest);
  app.post('/.netlify/functions/discover', handleDiscoveryRequest);
  app.get('/api/discover', (req, res) => {
    res.json({ status: 'ok', message: 'Discovery endpoint active. Send a POST request to run discovery.' });
  });
  app.get('/.netlify/functions/discover', (req, res) => {
    res.json({ status: 'ok', message: 'Discovery Netlify function active. Send a POST request to run discovery.' });
  });

  // Moment Analysis endpoints
  app.options('/api/analyze', (req, res) => res.sendStatus(204));
  app.options('/.netlify/functions/analyze', (req, res) => res.sendStatus(204));
  app.post('/api/analyze', handleAnalyzeRequest);
  app.post('/.netlify/functions/analyze', handleAnalyzeRequest);
  app.get('/api/analyze', (req, res) => {
    res.json({ status: 'ok', message: 'Moment analysis endpoint active. Send a POST request to analyze sources.' });
  });
  app.get('/.netlify/functions/analyze', (req, res) => {
    res.json({ status: 'ok', message: 'Moment analysis Netlify function active. Send a POST request to analyze sources.' });
  });

  // Sources endpoints (Supabase-persisted source video retrieval)
  app.options('/api/sources', (req, res) => res.sendStatus(204));
  app.options('/.netlify/functions/sources', (req, res) => res.sendStatus(204));
  app.get('/api/sources', handleSourcesRequest);
  app.get('/.netlify/functions/sources', handleSourcesRequest);

  // Candidates endpoints (Supabase-persisted clip candidate retrieval & selection)
  app.options('/api/candidates', (req, res) => res.sendStatus(204));
  app.options('/.netlify/functions/candidates', (req, res) => res.sendStatus(204));
  app.get('/api/candidates', handleCandidatesRequest);
  app.get('/.netlify/functions/candidates', handleCandidatesRequest);

  app.options('/api/candidates/select', (req, res) => res.sendStatus(204));
  app.options('/.netlify/functions/candidates-select', (req, res) => res.sendStatus(204));
  app.post('/api/candidates/select', handleCandidateSelectRequest);
  app.post('/.netlify/functions/candidates-select', handleCandidateSelectRequest);

  // Clips endpoints (Supabase-persisted rendered clip retrieval)
  app.options('/api/clips', (req, res) => res.sendStatus(204));
  app.options('/.netlify/functions/clips', (req, res) => res.sendStatus(204));
  app.get('/api/clips', handleClipsRequest);
  app.get('/.netlify/functions/clips', handleClipsRequest);

  // Admin endpoints
  app.options('/api/admin/validate-clips', (req, res) => res.sendStatus(204));
  app.options('/.netlify/functions/admin/validate-clips', (req, res) => res.sendStatus(204));
  app.get('/api/admin/validate-clips', handleValidateExistingClipsRequest);
  app.get('/.netlify/functions/admin/validate-clips', handleValidateExistingClipsRequest);

  // Vertical Render endpoints (Real Modular Rendering Pipeline)
  app.options('/api/render', (req, res) => res.sendStatus(204));
  app.options('/.netlify/functions/render', (req, res) => res.sendStatus(204));
  app.post('/api/render', handleRenderRequest);
  app.post('/.netlify/functions/render', handleRenderRequest);
  app.get('/api/render/jobs/:jobId', handleRenderJobStatus);

  // Static / Media streaming route for rendered clips and thumbnails
  app.get('/api/media/clips/:filename', handleMediaStreaming);

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'clipflow-discovery' });
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
