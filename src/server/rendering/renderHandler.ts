import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { getSupabaseServerClient } from '../discovery/pipeline';
import { RenderWorker } from './RenderWorker';

const renderedDir = path.resolve(process.cwd(), 'temp_media', 'rendered');

if (!fs.existsSync(renderedDir)) {
  fs.mkdirSync(renderedDir, { recursive: true });
}

/**
 * Main production render endpoint.
 * POST /api/render
 */
export async function handleRenderRequest(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    let userAccessToken: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      userAccessToken = authHeader.slice(7).trim();
    }

    const { candidateId, workspaceId } = req.body || {};

    if (!candidateId || !workspaceId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'candidateId and workspaceId are required to render.',
      });
    }

    const supabase = getSupabaseServerClient(userAccessToken);
    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'DATABASE_UNAVAILABLE',
        message: 'Could not connect to database.',
      });
    }

    // 1. Check for active duplicate jobs to prevent rendering overload
    const { data: candidate } = await supabase
      .from('clip_candidates')
      .select('*')
      .eq('id', candidateId)
      .maybeSingle();

    if (candidate && candidate.factors && candidate.factors.activeJobId) {
      const activeJobId = candidate.factors.activeJobId;
      const { data: activeJob } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', activeJobId)
        .maybeSingle();

      if (activeJob && (activeJob.status === 'queued' || activeJob.status === 'running')) {
        console.log(`[handleRenderRequest] Duplicate job active for candidate: ${activeJobId}`);
        return res.status(202).json({
          success: true,
          jobId: activeJobId,
          status: 'queued',
          message: 'An active render is already in progress for this candidate. Reusing job.'
        });
      }
    }

    // 2. Generate compliant UUID for the job
    const jobId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });

    // 3. Create a jobs row in Supabase (status: 'queued')
    const { error: jobInsertErr } = await supabase
      .from('jobs')
      .insert({
        id: jobId,
        workspace_id: workspaceId,
        type: 'vertical_render',
        target_title: `Render Clip: ${candidateId}`,
        progress: 0,
        stage: 'queued',
        status: 'queued',
        metadata: { candidateId }
      });

    if (jobInsertErr) {
      console.error('[handleRenderRequest] Failed to insert job row:', jobInsertErr.message);
      return res.status(500).json({
        success: false,
        error: 'DATABASE_FAILURE',
        message: 'Could not initiate a render job: ' + jobInsertErr.message,
      });
    }

    // 4. Update candidate factors to bind activeJobId
    const existingFactors = (candidate?.factors || {}) as any;
    await supabase
      .from('clip_candidates')
      .update({
        status: 'generating',
        factors: {
          ...existingFactors,
          renderStatus: 'rendering',
          activeJobId: jobId,
        }
      })
      .eq('id', candidateId);

    // 5. Trigger the Replaceable Worker asynchronously (Fire-and-forget background execution)
    const worker = new RenderWorker(supabase);
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

/**
 * Isolated development/test handler using real moving local MP4 assets.
 * NEVER reachable from the normal render button.
 */
export async function handleDevRenderTestRequest(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    let userAccessToken: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      userAccessToken = authHeader.slice(7).trim();
    }

    const { candidateId, workspaceId } = req.body || {};
    const supabase = getSupabaseServerClient(userAccessToken);
    if (!supabase) {
      return res.status(500).json({ success: false, message: 'Database client not available.' });
    }

    const testVideoPath = path.resolve(process.cwd(), 'tmp', 'media', 'dev_moving_test.mp4');
    if (!fs.existsSync(testVideoPath)) {
      return res.status(404).json({ success: false, message: 'Development test MP4 asset not found on disk.' });
    }

    console.log(`[handleDevRenderTestRequest] Triggering isolated worker test using real moving MP4 at: ${testVideoPath}`);
    
    // Create direct test job
    const jobId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });

    await supabase.from('jobs').insert({
      id: jobId,
      workspace_id: workspaceId || 'a0000000-0000-4000-a000-000000000001',
      type: 'vertical_render',
      target_title: `Test Render: ${candidateId || 'dev-test'}`,
      progress: 0,
      stage: 'queued',
      status: 'queued',
      metadata: { candidateId: candidateId || 'dev-test' }
    });

    const worker = new RenderWorker(supabase);
    // Execute test synchronously to return output directly
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

/**
 * Retrieves the asynchronous status of a render job from the jobs database.
 * GET /api/render/jobs/:jobId
 */
export async function handleRenderJobStatus(req: Request, res: Response) {
  try {
    const { jobId } = req.params;
    const authHeader = req.headers.authorization;
    let userAccessToken: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      userAccessToken = authHeader.slice(7).trim();
    }

    const supabase = getSupabaseServerClient(userAccessToken);
    if (!supabase) {
      return res.status(500).json({ success: false, message: 'Database client not available.' });
    }

    const { data: job, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (error || !job) {
      return res.status(404).json({
        success: false,
        message: `Job ${jobId} not found in database.`,
      });
    }

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

/**
 * Serves media streaming with Range support
 */
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
