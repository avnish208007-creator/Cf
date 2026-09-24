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

export function getFrameRawRGB(filePath: string, timeSec: number, size: number = 16): Buffer | null {
  try {
    const cmd = `ffmpeg -y -ss ${timeSec} -i "${filePath}" -vframes 1 -s ${size}x${size} -f rawvideo -pix_fmt rgb24 - 2>/dev/null`;
    const buffer = execSync(cmd, { timeout: 4000, stdio: ['pipe', 'pipe', 'ignore'] });
    if (buffer && buffer.length === size * size * 3) {
      return buffer;
    }
  } catch (err) {
    // Silently continue
  }
  return null;
}

export function calculateCorrelation(bufA: Buffer, bufB: Buffer): number {
  if (bufA.length !== bufB.length) return 0;
  let sumA = 0, sumB = 0;
  for (let i = 0; i < bufA.length; i++) {
    sumA += bufA[i];
    sumB += bufB[i];
  }
  const meanA = sumA / bufA.length;
  const meanB = sumB / bufB.length;

  let num = 0;
  let denA = 0;
  let denB = 0;

  for (let i = 0; i < bufA.length; i++) {
    const diffA = bufA[i] - meanA;
    const diffB = bufB[i] - meanB;
    num += diffA * diffB;
    denA += diffA * diffA;
    denB += diffB * diffB;
  }

  if (denA === 0 || denB === 0) return 1;
  return num / Math.sqrt(denA * denB);
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

  const duration = inspection.durationSeconds || 0;
  if (duration > 0) {
    const testTimes = [
      0.0,
      duration * 0.1,
      duration * 0.25,
      duration * 0.5,
      duration * 0.75,
      duration * 0.9
    ].filter(t => t < duration);

    while (testTimes.length < 3) {
      testTimes.push(testTimes[testTimes.length - 1] + 0.1);
    }

    const buffers: Buffer[] = [];
    for (const time of testTimes) {
      const buf = getFrameRawRGB(filePath, time, 16);
      if (buf) {
        buffers.push(buf);
      }
    }

    if (buffers.length >= 3) {
      // 1. Uniform solid or black/blank check
      for (let i = 0; i < buffers.length; i++) {
        const buf = buffers[i];
        let totalVal = 0;
        let diffFromFirstPixel = 0;
        const firstPixelR = buf[0];
        const firstPixelG = buf[1];
        const firstPixelB = buf[2];

        for (let j = 0; j < buf.length; j += 3) {
          totalVal += (buf[j] + buf[j+1] + buf[j+2]) / 3;
          diffFromFirstPixel += Math.abs(buf[j] - firstPixelR) + Math.abs(buf[j+1] - firstPixelG) + Math.abs(buf[j+2] - firstPixelB);
        }

        const avgBrightness = totalVal / (buf.length / 3);
        if (avgBrightness < 12) {
          return { valid: false, reason: 'INVALID: Extracted frame is a blank/black placeholder (average brightness < 12).', inspection };
        }

        const avgPixelDiff = diffFromFirstPixel / (buf.length / 3);
        if (avgPixelDiff < 3) {
          return { valid: false, reason: 'INVALID: Extracted frame is a completely solid color (no visual detail).', inspection };
        }
      }

      // 2. Pairwise frame correlation check (detect static image loops or zoompan fakes)
      let sumCorrelation = 0;
      let pairCount = 0;
      for (let i = 0; i < buffers.length; i++) {
        for (let j = i + 1; j < buffers.length; j++) {
          const r = calculateCorrelation(buffers[i], buffers[j]);
          sumCorrelation += r;
          pairCount++;
        }
      }

      const avgCorrelation = sumCorrelation / pairCount;
      console.log(`[validateRealVideo] Video frame-to-frame correlation: ${avgCorrelation.toFixed(4)}`);

      // We reject highly static looping images or linear zoompans that produce almost identical frame statistics.
      if (avgCorrelation > 0.985) {
        return {
          valid: false,
          reason: `SOURCE_MEDIA_STATIC: Video frames are highly static or have synthetic zoompan/movement (average frame correlation: ${avgCorrelation.toFixed(4)}). Expected real moving visual footage.`,
          inspection
        };
      }
    } else {
      return { valid: false, reason: 'Failed to decode sufficient representative video frames for motion and integrity validation', inspection };
    }
  }

  return { valid: true, inspection };
}

export function getFrameRawRGBCropped(
  filePath: string,
  timeSec: number,
  cropFilter: string,
  size: number = 16
): Buffer | null {
  try {
    const cmd = `ffmpeg -y -ss ${timeSec} -i "${filePath}" -vframes 1 -vf "${cropFilter}" -s ${size}x${size} -f rawvideo -pix_fmt rgb24 - 2>/dev/null`;
    const buffer = execSync(cmd, { timeout: 4000, stdio: ['pipe', 'pipe', 'ignore'] });
    if (buffer && buffer.length === size * size * 3) {
      return buffer;
    }
  } catch (err) {
    // Silently continue
  }
  return null;
}

export function validateVisualMatch(
  sourcePath: string,
  startSec: number,
  renderedPath: string
): { matched: boolean; correlation: number; reason?: string } {
  const sourceInspection = inspectVideoFile(sourcePath);
  const renderedInspection = inspectVideoFile(renderedPath);

  if (!sourceInspection.exists || !renderedInspection.exists) {
    return { matched: false, correlation: 0, reason: 'Source or rendered file does not exist.' };
  }

  const duration = renderedInspection.durationSeconds || 5;
  const testPoints = [duration * 0.25, duration * 0.5, duration * 0.75];

  let totalCorrelation = 0;
  let matchCount = 0;

  // Source crop: Crop 9:16 center aspect ratio, and then take the top 75% (to avoid subtitles at the bottom)
  const sourceCropFilter = 'crop=ih*9/16:ih*0.75:(iw-ih*9/16)/2:0';
  // Rendered crop: Already vertical 9:16, so just take the top 75% to ignore subtitles
  const renderedCropFilter = 'crop=iw:ih*0.75:0:0';

  for (const tRend of testPoints) {
    const tSrc = startSec + tRend;
    if (tSrc < 0 || (sourceInspection.durationSeconds && tSrc > sourceInspection.durationSeconds)) {
      continue;
    }

    const srcBuf = getFrameRawRGBCropped(sourcePath, tSrc, sourceCropFilter, 16);
    const rendBuf = getFrameRawRGBCropped(renderedPath, tRend, renderedCropFilter, 16);

    if (srcBuf && rendBuf) {
      const r = calculateCorrelation(srcBuf, rendBuf);
      totalCorrelation += r;
      matchCount++;
    }
  }

  if (matchCount === 0) {
    return { matched: false, correlation: 0, reason: 'Could not extract corresponding visual frames for cross-validation.' };
  }

  const avgCorrelation = totalCorrelation / matchCount;
  console.log(`[validateVisualMatch] Visual source-to-output match correlation (cropped): ${avgCorrelation.toFixed(4)}`);

  // With exact crop matching, matching videos correlate extremely highly (usually r > 0.90)
  // An average correlation >= 0.5 is exceptionally safe to prove origin.
  if (avgCorrelation >= 0.5) {
    return { matched: true, correlation: avgCorrelation };
  } else {
    return {
      matched: false,
      correlation: avgCorrelation,
      reason: `OUTPUT_VISUAL_MISMATCH: Visual content in rendered clip does not correspond to the source video interval. (correlation: ${avgCorrelation.toFixed(4)} < 0.5)`
    };
  }
}
