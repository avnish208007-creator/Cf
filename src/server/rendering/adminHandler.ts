import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { getSupabaseServerClient } from '../discovery/pipeline';
import { validateRealVideo } from './inspectVideo';

export async function handleValidateExistingClipsRequest(req: Request, res: Response): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const workspaceId = ((req.query.workspaceId as string) || '').trim();
  const authHeader = req.headers.authorization || '';
  const userAccessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;

  const supabase = getSupabaseServerClient(userAccessToken);
  if (!supabase) {
    res.status(500).json({
      success: false,
      error: 'SERVER_CONFIG_ERROR',
      message: 'Supabase server client could not be initialized.',
    });
    return;
  }

  try {
    // 1. Fetch all clips
    let query = supabase.from('clips').select('*');
    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId);
    }
    const { data: clips, error } = await query;

    if (error) {
      res.status(500).json({
        success: false,
        error: 'QUERY_FAILED',
        message: error.message,
      });
      return;
    }

    const records = clips || [];
    const results = [];

    // Ensure tmp folder exists
    const tmpDir = path.resolve(process.cwd(), 'tmp', 'validate');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    for (const cl of records) {
      const videoUrl = cl.video_url;
      if (!videoUrl) {
        results.push({
          id: cl.id,
          title: cl.title,
          videoUrl: null,
          status: 'INVALID_SYNTHETIC_OUTPUT',
          details: 'No video URL present on the clip record.',
        });
        continue;
      }

      let filePath = '';
      let isTemp = false;

      // Handle local versus remote URLs
      if (videoUrl.includes('/api/media/clips/')) {
        const filename = videoUrl.split('/').pop() || '';
        filePath = path.resolve(process.cwd(), 'uploads', 'rendered', filename);
      } else if (videoUrl.startsWith('http')) {
        // Download the remote file to temp
        const tempName = `validate_${cl.id}_${Date.now()}.mp4`;
        filePath = path.join(tmpDir, tempName);
        isTemp = true;

        try {
          await new Promise<void>((resolveDownload, rejectDownload) => {
            const file = fs.createWriteStream(filePath);
            const client = videoUrl.startsWith('https') ? https : http;
            client.get(videoUrl, (response) => {
              if (response.statusCode && (response.statusCode < 200 || response.statusCode >= 300)) {
                rejectDownload(new Error(`HTTP ${response.statusCode}`));
                return;
              }
              response.pipe(file);
              file.on('finish', () => {
                file.close();
                resolveDownload();
              });
            }).on('error', (err) => {
              file.close();
              rejectDownload(err);
            });
          });
        } catch (downloadErr: any) {
          if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (_) {}
          }
          results.push({
            id: cl.id,
            title: cl.title,
            videoUrl,
            status: 'INVALID_SYNTHETIC_OUTPUT',
            details: `Failed to download external MP4: ${downloadErr.message}`,
          });
          continue;
        }
      }

      // Check existence and size
      if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).size < 1000) {
        if (isTemp && filePath && fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch (_) {}
        }
        results.push({
          id: cl.id,
          title: cl.title,
          videoUrl,
          status: 'INVALID_SYNTHETIC_OUTPUT',
          details: 'Media file does not exist or is empty.',
        });
        continue;
      }

      // Run robust validation (H.264, yuv420p, 9:16, moving frames)
      const validation = validateRealVideo(filePath);

      // Clean up downloaded temp file if applicable
      if (isTemp && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_) {}
      }

      if (validation.valid && validation.inspection) {
        results.push({
          id: cl.id,
          title: cl.title,
          videoUrl,
          status: 'VALID_REAL_VIDEO',
          details: `Resolution: ${validation.inspection.width}x${validation.inspection.height}, Duration: ${validation.inspection.durationSeconds}s, Codec: ${validation.inspection.videoCodec}, Size: ${validation.inspection.fileSizeBytes} bytes`,
        });
      } else {
        results.push({
          id: cl.id,
          title: cl.title,
          videoUrl,
          status: 'INVALID_SYNTHETIC_OUTPUT',
          details: validation.reason || 'Invalid media content or format.',
        });
      }
    }

    res.status(200).json({
      success: true,
      workspaceId,
      totalCount: records.length,
      validatedClips: results,
    });
  } catch (err: any) {
    console.error('[AdminValidate] Unexpected error:', err);
    res.status(500).json({
      success: false,
      error: 'VALIDATION_PIPELINE_ERROR',
      message: err.message,
    });
  }
}
