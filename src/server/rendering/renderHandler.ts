import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';
import { RenderWorker } from './RenderWorker';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const renderedDir = path.resolve(process.cwd(), 'temp_media', 'rendered');

if (!fs.existsSync(renderedDir)) {
  fs.mkdirSync(renderedDir, { recursive: true });
}

export async function handleRenderRequest(req: Request, res: Response) {
  try {
    const { candidateId, workspaceId } = req.body || {};

    if (!candidateId || !workspaceId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'candidateId and workspaceId are required to render.',
      });
    }

    const candRef = doc(db, 'clip_candidates', candidateId);
    const candSnap = await getDoc(candRef);
    const candidate = candSnap.exists() ? candSnap.data() : null;

    if (candidate && candidate.factors && candidate.factors.activeJobId) {
      const activeJobId = candidate.factors.activeJobId;
      const jobSnap = await getDoc(doc(db, 'render_jobs', activeJobId));
      if (jobSnap.exists()) {
        const activeJob = jobSnap.data();
        if (activeJob.status === 'queued' || activeJob.status === 'running') {
          console.log(`[handleRenderRequest] Duplicate job active for candidate: ${activeJobId}`);
          return res.status(202).json({
            success: true,
            jobId: activeJobId,
            status: 'queued',
            message: 'An active render is already in progress for this candidate. Reusing job.'
          });
        }
      }
    }

    const jobId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });

    const now = new Date().toISOString();

    await setDoc(doc(db, 'render_jobs', jobId), {
      id: jobId,
      workspace_id: workspaceId,
      type: 'vertical_render',
      target_title: `Render Clip: ${candidateId}`,
      progress: 0,
      stage: 'queued',
      status: 'queued',
      created_at: now,
      metadata: { candidateId }
    });

    const existingFactors = (candidate?.factors || {}) as any;
    if (candSnap.exists()) {
      await updateDoc(candRef, {
        status: 'generating',
        factors: {
          ...existingFactors,
          renderStatus: 'rendering',
          activeJobId: jobId,
        }
      });
    }

    const worker = new RenderWorker();
    worker.process(jobId).catch((err) => {
      console.error(`[handleRenderRequest] Worker process background failure for job ${jobId}:`, err);
    });

    return res.status(202).json({
      success: true,
      jobId,
      status: 'queued',
      message: 'Render job successfully queued in background.',
    });
  } catch (err: any) {
    console.error('[handleRenderRequest] Execution exception:', err);
    return res.status(500).json({
      success: false,
      error: 'RENDER_ERROR',
      message: err.message || 'An unexpected render failure occurred.',
    });
  }
}

export async function handleDevRenderTestRequest(req: Request, res: Response) {
  try {
    const { candidateId, workspaceId } = req.body || {};

    const testVideoPath = path.resolve(process.cwd(), 'tmp', 'media', 'dev_moving_test.mp4');
    if (!fs.existsSync(testVideoPath)) {
      return res.status(404).json({ success: false, message: 'Development test MP4 asset not found on disk.' });
    }

    console.log(`[handleDevRenderTestRequest] Triggering isolated worker test using real moving MP4 at: ${testVideoPath}`);
    
    const jobId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });

    await setDoc(doc(db, 'render_jobs', jobId), {
      id: jobId,
      workspace_id: workspaceId || 'a0000000-0000-4000-a000-000000000001',
      type: 'vertical_render',
      target_title: `Test Render: ${candidateId || 'dev-test'}`,
      progress: 0,
      stage: 'queued',
      status: 'queued',
      created_at: new Date().toISOString(),
      metadata: { candidateId: candidateId || 'dev-test' }
    });

    const worker = new RenderWorker();
    const success = await worker.process(jobId);

    return res.status(success ? 200 : 422).json({
      success,
      jobId,
      message: success ? 'Isolated render test passed!' : 'Isolated render test failed.'
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function handleRenderJobStatus(req: Request, res: Response) {
  try {
    const { jobId } = req.params;

    const jobSnap = await getDoc(doc(db, 'render_jobs', jobId));

    if (!jobSnap.exists()) {
      return res.status(404).json({
        success: false,
        message: `Job ${jobId} not found in database.`,
      });
    }

    const job = jobSnap.data();

    return res.json({
      success: true,
      job: {
        id: job.id,
        workspaceId: job.workspace_id,
        status: job.status,
        progress: job.progress,
        stage: job.stage,
        errorCode: job.error_code,
        errorMessage: job.error_message,
        startedAt: job.started_at,
        completedAt: job.completed_at
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export function handleMediaStreaming(req: Request, res: Response) {
  const { filename } = req.params;
  const sanitized = path.basename(filename);
  const filePath = path.join(renderedDir, sanitized);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Media file not found' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const ext = path.extname(sanitized).toLowerCase();
  const isVideo = ext === '.mp4' || ext === '.mov' || ext === '.webm';
  const contentType = isVideo ? 'video/mp4' : 'image/jpeg';

  const range = req.headers.range;

  if (range && isVideo) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });

    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    };

    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    };

    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
}
