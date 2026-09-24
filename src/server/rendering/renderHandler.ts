import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { RenderService } from './RenderService';
import { getSupabaseServerClient } from '../discovery/pipeline';
import { RenderRequest } from './types';

const renderedDir = path.resolve(process.cwd(), 'uploads', 'rendered');
const sourcesDir = path.resolve(process.cwd(), 'uploads', 'sources');

if (!fs.existsSync(renderedDir)) {
  fs.mkdirSync(renderedDir, { recursive: true });
}
if (!fs.existsSync(sourcesDir)) {
  fs.mkdirSync(sourcesDir, { recursive: true });
}

export async function handleRenderRequest(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    let userAccessToken: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      userAccessToken = authHeader.slice(7).trim();
    }

    const {
      candidateId,
      workspaceId,
      sourceVideoId,
      sourceTitle,
      channelTitle,
      startTime,
      endTime,
      durationSeconds,
      hook,
      transcriptText,
      summary,
      sourceYoutubeUrl,
      mediaUrl,
      mediaPath,
      reframeMode,
      subtitles,
      branding,
    } = req.body || {};

    if (!candidateId || !workspaceId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'candidateId and workspaceId are required to render a vertical clip.',
      });
    }

    const supabase = getSupabaseServerClient(userAccessToken);
    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'DATABASE_UNAVAILABLE',
        message: 'Database connection could not be established.',
      });
    }

    // 1. PREVENT DUPLICATE RENDERS Check
    const { data: candidate } = await supabase
      .from('clip_candidates')
      .select('*')
      .eq('id', candidateId)
      .maybeSingle();

    if (candidate && candidate.factors && candidate.factors.activeJobId) {
      const activeJobId = candidate.factors.activeJobId;
      // Check if job exists and is still active
      const { data: job } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', activeJobId)
        .maybeSingle();

      if (job && (job.status === 'queued' || job.status === 'running')) {
        console.log(`[handleRenderRequest] Active job already exists for candidate ${candidateId}: ${activeJobId}`);
        return res.status(202).json({
          success: true,
          jobId: activeJobId,
          status: 'queued',
          message: 'An active render is already in progress for this candidate. Reusing job.'
        });
      }
    }

    const jobId = 'job_rend_' + Math.random().toString(36).slice(2, 10) + '-' + Math.random().toString(36).slice(2, 6);

    // Create a jobs row in Supabase
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
      });

    if (jobInsertErr) {
      console.error('[handleRenderRequest] Failed to create job row:', jobInsertErr.message);
      return res.status(500).json({
        success: false,
        error: 'DATABASE_FAILURE',
        message: 'Could not create a rendering background job: ' + jobInsertErr.message,
      });
    }

    // Update candidate status to 'generating' and activeJobId
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

    const renderService = new RenderService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      supabase
    );

    const renderRequest: RenderRequest = {
      candidateId,
      workspaceId,
      sourceVideoId,
      sourceTitle: sourceTitle || 'Discovered Video',
      channelTitle: channelTitle || 'Creator Channel',
      startTime: startTime || '00:00',
      endTime: endTime || '00:30',
      durationSeconds: Number(durationSeconds) || undefined,
      hook: hook || 'Key takeaway insight.',
      transcriptText: transcriptText || hook || '',
      summary: summary || '',
      sourceYoutubeUrl,
      mediaUrl,
      mediaPath,
      reframeMode,
      subtitles,
      branding,
      isDevTest: false,
      jobId,
    };

    // Run rendering asynchronously in the background for local / AI Studio Preview server
    renderService.renderCandidateToVerticalClip(renderRequest).catch((err) => {
      console.error('[handleRenderRequest] Asynchronous render background exception:', err);
    });

    return res.status(202).json({
      success: true,
      jobId,
      status: 'queued',
      message: 'Render job accepted and queued in background.',
    });
  } catch (err: any) {
    console.error('[handleRenderRequest] Unhandled error:', err);
    return res.status(500).json({
      success: false,
      error: 'RENDER_ERROR',
      message: err.message || 'An unexpected error occurred during rendering.',
    });
  }
}

export async function handleDevRenderTestRequest(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    let userAccessToken: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      userAccessToken = authHeader.slice(7).trim();
    }

    const {
      candidateId,
      workspaceId,
      sourceVideoId,
      sourceTitle,
      channelTitle,
      startTime,
      endTime,
      durationSeconds,
      hook,
      transcriptText,
      summary,
      sourceYoutubeUrl,
      mediaUrl,
      mediaPath,
      reframeMode,
      subtitles,
      branding,
    } = req.body || {};

    const supabase = getSupabaseServerClient(userAccessToken);
    const renderService = new RenderService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      supabase
    );

    const renderRequest: RenderRequest = {
      candidateId: candidateId || 'dev_test_candidate',
      workspaceId: workspaceId || 'dev_test_workspace',
      sourceVideoId: sourceVideoId || 'dev',
      sourceTitle: sourceTitle || 'Development Synthetic Test Video (DEVELOPMENT ONLY)',
      channelTitle: channelTitle || 'Dev Channel',
      startTime: startTime || '00:02',
      endTime: endTime || '00:10',
      durationSeconds: 8,
      hook: hook || 'This is a synthetic development render test.',
      transcriptText: transcriptText || 'This is a synthetic development render test.',
      summary: summary || 'Synthetic development test.',
      sourceYoutubeUrl: 'dev',
      mediaUrl: undefined,
      mediaPath: undefined,
      reframeMode: reframeMode || 'centered_crop',
      subtitles,
      branding,
      isDevTest: true, // EXPLICIT TEST FLAG ALLOWED HERE
    };

    const result = await renderService.renderCandidateToVerticalClip(renderRequest);
    return res.status(result.success ? 200 : 422).json(result);
  } catch (err: any) {
    console.error('[handleDevRenderTestRequest] Unhandled error:', err);
    return res.status(500).json({
      success: false,
      error: 'RENDER_ERROR',
      message: err.message || 'An unexpected error occurred during rendering.',
    });
  }
}

export async function handleRenderJobStatus(req: Request, res: Response) {
  const { jobId } = req.params;
  const renderService = new RenderService();
  const job = await renderService.getJob(jobId);

  if (!job) {
    return res.status(404).json({
      success: false,
      message: `Job ${jobId} not found.`,
    });
  }

  return res.json({
    success: true,
    job,
  });
}

/**
 * Serves rendered MP4 files and JPG poster frames with HTTP 206 Partial Content / Range support.
 */
export function handleMediaStreaming(req: Request, res: Response) {
  const { filename } = req.params;

  // Sanitize filename to avoid path traversal
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
    // Parse Range header (e.g. "bytes=0-1048575")
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
