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
    };

    const result = await renderService.renderCandidateToVerticalClip(renderRequest);

    return res.status(result.success ? 200 : 422).json(result);
  } catch (err: any) {
    console.error('[handleRenderRequest] Unhandled error:', err);
    return res.status(500).json({
      success: false,
      error: 'RENDER_ERROR',
      message: err.message || 'An unexpected error occurred during rendering.',
    });
  }
}

export function handleRenderJobStatus(req: Request, res: Response) {
  const { jobId } = req.params;
  const renderService = new RenderService();
  const job = renderService.getJob(jobId);

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
