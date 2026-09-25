import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { db, DEFAULT_WORKSPACE_ID } from '../../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { OutputValidator } from './OutputValidator';

export async function handleValidateExistingClipsRequest(req: Request, res: Response): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const workspaceId = ((req.query.workspaceId as string) || DEFAULT_WORKSPACE_ID).trim();

  try {
    const clipsColRef = collection(db, 'workspaces', workspaceId, 'clips');
    const snapshot = await getDocs(clipsColRef);
    const records = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    const results = [];

    const tmpDir = path.resolve(process.cwd(), 'temp_media', 'validate');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const validator = new OutputValidator();

    for (const cl of records) {
      const videoUrl = (cl as any).videoUrl || (cl as any).video_url;
      if (!videoUrl) {
        results.push({
          id: cl.id,
          title: (cl as any).title,
          videoUrl: null,
          status: 'INVALID_SYNTHETIC_OUTPUT',
          details: 'No video URL present on the clip record.',
        });
        continue;
      }

      let filePath = '';
      let isTemp = false;

      if (videoUrl.includes('/api/media/clips/')) {
        const filename = videoUrl.split('/').pop() || '';
        filePath = path.resolve(process.cwd(), 'temp_media', 'rendered', filename);
      } else if (videoUrl.startsWith('http')) {
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
            title: (cl as any).title,
            videoUrl,
            status: 'INVALID_SYNTHETIC_OUTPUT',
            details: `Failed to download external MP4: ${downloadErr.message}`,
          });
          continue;
        }
      }

      if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).size < 1000) {
        if (isTemp && filePath && fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch (_) {}
        }
        results.push({
          id: cl.id,
          title: (cl as any).title,
          videoUrl,
          status: 'INVALID_SYNTHETIC_OUTPUT',
          details: 'Media file does not exist or is empty.',
        });
        continue;
      }

      const durationStr = (cl as any).duration || '15s';
      const durationNum = Number(durationStr.replace('s', '')) || 15;
      const validation = await validator.validate(filePath, durationNum);

      if (isTemp && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_) {}
      }

      if (validation.valid) {
        results.push({
          id: cl.id,
          title: (cl as any).title,
          videoUrl,
          status: 'VALID_REAL_VIDEO',
          details: `Resolution: ${validation.width}x${validation.height}, Duration: ${validation.duration}s, Codec: ${validation.videoCodec}`,
        });
      } else {
        results.push({
          id: cl.id,
          title: (cl as any).title,
          videoUrl,
          status: 'INVALID_SYNTHETIC_OUTPUT',
          details: validation.errorMessage || 'Invalid media content or format.',
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
