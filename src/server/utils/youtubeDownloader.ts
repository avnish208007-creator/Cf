import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolveYtDlp, resolveFfprobe } from './binaries';

const execFileAsync = promisify(execFile);

export interface DownloadedMediaInfo {
  localPath: string;
  sourceUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * Downloads a real YouTube video using yt-dlp.
 * No fake fallbacks, no sample video substitution.
 */
export async function downloadYouTubeSource(
  youtubeUrl: string,
  outputDir: string,
  filePrefix: string
): Promise<DownloadedMediaInfo> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const destPath = path.resolve(outputDir, `${filePrefix}_source.mp4`);
  const ytDlpExecutable = resolveYtDlp();

  console.log(`[YouTubeDownloader] Downloading source video from "${youtubeUrl}" to "${destPath}" using ${ytDlpExecutable}...`);

  const ytDlpArgs = [
    '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--no-playlist',
    '--merge-output-format', 'mp4',
    '-o', destPath,
    youtubeUrl,
  ];

  try {
    await execFileAsync(ytDlpExecutable, ytDlpArgs, { timeout: 180000 });
  } catch (dlErr: any) {
    const errorMsg = dlErr?.stderr || dlErr?.message || 'yt-dlp execution failed';
    console.error('[YouTubeDownloader] Download error:', errorMsg);
    throw new Error(`YouTube download failed: ${errorMsg.slice(0, 300)}`);
  }

  if (!fs.existsSync(destPath) || fs.statSync(destPath).size < 1000) {
    throw new Error('Downloaded YouTube media file is missing, corrupted, or too small.');
  }

  // Probe with ffprobe
  const ffprobeExecutable = resolveFfprobe();
  let durationSeconds = 60;
  let width = 1920;
  let height = 1080;

  try {
    const { stdout } = await execFileAsync(ffprobeExecutable, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      destPath,
    ]);
    const probe = JSON.parse(stdout);
    if (probe.format && probe.format.duration) {
      durationSeconds = Math.round(parseFloat(probe.format.duration));
    }
    const videoStream = probe.streams?.find((s: any) => s.codec_type === 'video');
    if (videoStream) {
      width = Number(videoStream.width) || width;
      height = Number(videoStream.height) || height;
    }
  } catch (probeErr: any) {
    console.warn('[YouTubeDownloader] ffprobe warning during download probe:', probeErr?.message);
  }

  const sizeBytes = fs.statSync(destPath).size;

  return {
    localPath: destPath,
    sourceUrl: youtubeUrl,
    durationSeconds,
    width,
    height,
    sizeBytes,
  };
}
