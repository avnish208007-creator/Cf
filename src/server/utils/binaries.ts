import fs from 'fs';
import path from 'path';

export function resolveYtDlp(): string {
  const envPath = process.env.YT_DLP_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }
  const localBin = path.resolve(process.cwd(), 'bin', 'yt-dlp');
  if (fs.existsSync(localBin)) {
    return localBin;
  }
  return 'yt-dlp';
}

export function resolveFfmpeg(): string {
  const envPath = process.env.FFMPEG_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }
  return 'ffmpeg';
}

export function resolveFfprobe(): string {
  const envPath = process.env.FFPROBE_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }
  return 'ffprobe';
}
