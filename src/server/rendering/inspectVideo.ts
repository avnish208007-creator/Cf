import fs from 'fs';
import { execSync } from 'child_process';
import crypto from 'crypto';

export interface VideoInspectionResult {
  exists: boolean;
  fileSizeBytes: number;
  mimeType: string;
  hasVideoStream: boolean;
  videoCodec?: string;
  width?: number;
  height?: number;
  fps?: number;
  durationSeconds?: number;
  frameCount?: number;
  hasAudioStream: boolean;
  audioCodec?: string;
  error?: string;
}

export function inspectVideoFile(filePath: string): VideoInspectionResult {
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      exists: false,
      fileSizeBytes: 0,
      mimeType: 'unknown',
      hasVideoStream: false,
      hasAudioStream: false,
      error: 'File does not exist on disk',
    };
  }

  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    return {
      exists: true,
      fileSizeBytes: 0,
      mimeType: 'video/mp4',
      hasVideoStream: false,
      hasAudioStream: false,
      error: 'File is 0 bytes',
    };
  }

  try {
    const cmd = `ffprobe -v error -show_entries stream=codec_name,codec_type,width,height,r_frame_rate,duration,nb_frames -show_entries format=duration,size,format_name -of json "${filePath}"`;
    const stdout = execSync(cmd, { timeout: 10000 }).toString();
    const parsed = JSON.parse(stdout);

    const streams = parsed.streams || [];
    const videoStream = streams.find((s: any) => s.codec_type === 'video');
    const audioStream = streams.find((s: any) => s.codec_type === 'audio');

    const duration = parseFloat(videoStream?.duration || parsed.format?.duration || '0');
    const frameCount = parseInt(videoStream?.nb_frames || '0', 10);

    let fps = 0;
    if (videoStream?.r_frame_rate) {
      const parts = videoStream.r_frame_rate.split('/');
      if (parts.length === 2 && parseFloat(parts[1]) > 0) {
        fps = parseFloat(parts[0]) / parseFloat(parts[1]);
      } else {
        fps = parseFloat(parts[0]) || 0;
      }
    }

    const hasVideo = !!videoStream && !!videoStream.codec_name;

    return {
      exists: true,
      fileSizeBytes: stats.size,
      mimeType: 'video/mp4',
      hasVideoStream: hasVideo,
      videoCodec: videoStream?.codec_name,
      width: videoStream?.width,
      height: videoStream?.height,
      fps,
      durationSeconds: duration,
      frameCount: frameCount > 0 ? frameCount : Math.round(duration * (fps || 25)),
      hasAudioStream: !!audioStream && !!audioStream.codec_name,
      audioCodec: audioStream?.codec_name,
    };
  } catch (err: any) {
    console.error(`[inspectVideoFile] ffprobe failed for ${filePath}:`, err.message);
    return {
      exists: true,
      fileSizeBytes: stats.size,
      mimeType: 'video/mp4',
      hasVideoStream: false,
      hasAudioStream: false,
      error: `ffprobe failed: ${err.message}`,
    };
  }
}

export function getFrameMd5(filePath: string, timeSec: number): string | null {
  try {
    const cmd = `ffmpeg -y -ss ${timeSec} -i "${filePath}" -vframes 1 -s 16x16 -f rawvideo -pix_fmt rgb24 - 2>/dev/null`;
    const buffer = execSync(cmd, { timeout: 4000, stdio: ['pipe', 'pipe', 'ignore'] });
    if (buffer && buffer.length > 0) {
      return crypto.createHash('md5').update(buffer).digest('hex');
    }
  } catch (err) {
    // Bypassed or failed silently
  }
  return null;
}

export function validateRealVideo(filePath: string): { valid: boolean; reason?: string; inspection?: VideoInspectionResult } {
  const inspection = inspectVideoFile(filePath);
  if (!inspection.exists) {
    return { valid: false, reason: 'File does not exist on disk', inspection };
  }
  if (inspection.fileSizeBytes <= 0) {
    return { valid: false, reason: 'File size is 0 or less', inspection };
  }
  if (!inspection.hasVideoStream) {
    return { valid: false, reason: 'No valid video stream detected', inspection };
  }
  if (!inspection.videoCodec) {
    return { valid: false, reason: 'Missing video codec specification', inspection };
  }
  if (!inspection.width || inspection.width <= 0 || !inspection.height || inspection.height <= 0) {
    return { valid: false, reason: `Invalid dimensions: ${inspection.width}x${inspection.height}`, inspection };
  }
  if (!inspection.durationSeconds || inspection.durationSeconds <= 0) {
    return { valid: false, reason: 'Duration is 0 or invalid', inspection };
  }
  if (!inspection.fps || inspection.fps <= 0) {
    return { valid: false, reason: 'Frame rate is 0 or invalid', inspection };
  }

  // To distinguish REAL VIDEO from a STATIC IMAGE LOOP, decode frames at two distinct timestamps and compare.
  const duration = inspection.durationSeconds;
  if (duration > 1.5) {
    const t1 = Math.min(1.0, duration * 0.15);
    const t2 = Math.min(duration - 0.5, duration * 0.75);
    if (t2 > t1) {
      const h1 = getFrameMd5(filePath, t1);
      const h2 = getFrameMd5(filePath, t2);

      if (!h1 || !h2) {
        return { valid: false, reason: 'Failed to decode video frames at test intervals', inspection };
      }
      if (h1 === h2) {
        return { valid: false, reason: 'Static image loop detected (no actual motion/changing video frames found)', inspection };
      }
    }
  }

  return { valid: true, inspection };
}
